import unittest
from statistics import median

from chat_json import (
    ChatComment,
    LOCAL_BASELINE_WINDOW_SECONDS,
    LOW_ACTIVITY_COUNT_10S,
    LOW_ACTIVITY_COUNT_30S,
    STRONG_ACTIVITY_COUNT_10S,
    STRONG_ACTIVITY_COUNT_30S,
    attach_chat_json_metrics,
    compute_activity_percentile_scores,
    compute_local_burst_scores,
    percentile_rank,
    rolling_count,
    rolling_counts,
    soft_activity_gate,
)
from models import SampleMetrics
from scoring import clamp, percentile


class ChatJsonScoringTest(unittest.TestCase):
    def test_chat_json_score_detects_burst_above_normal_rate(self):
        samples = [
            SampleMetrics(timestamp_seconds=second, timestamp=f"00:00:{second:02d}")
            for second in range(90)
        ]
        comments: list[ChatComment] = []
        for second in range(60):
            comments.append(ChatComment(timestamp_seconds=float(second), body="normal"))
            if second % 2 == 0:
                comments.append(ChatComment(timestamp_seconds=float(second) + 0.2, body="normal"))
        for second in range(60, 70):
            for index in range(15):
                comments.append(ChatComment(timestamp_seconds=float(second) + index * 0.01, body="burst"))

        attach_chat_json_metrics(samples, comments, sample_interval_seconds=1.0)

        normal_max = max(sample.chat_json_score for sample in samples[:50])
        burst_min = min(sample.chat_json_score for sample in samples[63:70])

        self.assertGreater(burst_min, normal_max + 20)
        self.assertGreater(max(sample.chat_json_score for sample in samples[60:70]), 80)

    def test_low_activity_small_bump_does_not_saturate(self):
        samples = make_samples(120)
        comments: list[ChatComment] = []
        for second in range(0, 80, 20):
            comments.append(ChatComment(timestamp_seconds=float(second), body="quiet"))
        comments.extend(
            [
                ChatComment(timestamp_seconds=90.0, body="small bump"),
                ChatComment(timestamp_seconds=95.0, body="small bump"),
            ]
        )

        attach_chat_json_metrics(samples, comments, sample_interval_seconds=1.0)

        bump_score = max(sample.chat_json_score for sample in samples[90:100])
        self.assertLess(bump_score, 60)

    def test_moderate_baseline_large_burst_scores_high(self):
        samples = make_samples(160)
        comments: list[ChatComment] = []
        for bucket_start in range(0, 100, 10):
            comments.append(ChatComment(timestamp_seconds=float(bucket_start), body="normal"))
            comments.append(ChatComment(timestamp_seconds=float(bucket_start + 5), body="normal"))
        for index in range(12):
            comments.append(ChatComment(timestamp_seconds=120.0 + index * 0.5, body="burst"))

        attach_chat_json_metrics(samples, comments, sample_interval_seconds=1.0)

        burst_score = max(sample.chat_json_score for sample in samples[120:130])
        normal_score = max(sample.chat_json_score for sample in samples[40:90])
        self.assertGreater(burst_score, 70)
        self.assertGreater(burst_score, normal_score + 30)

    def test_high_volume_stream_still_detects_extra_surge(self):
        samples = make_samples(180)
        comments: list[ChatComment] = []
        for second in range(0, 120):
            comments.append(ChatComment(timestamp_seconds=float(second), body="busy"))
            comments.append(ChatComment(timestamp_seconds=float(second) + 0.4, body="busy"))
        for second in range(130, 140):
            for index in range(6):
                comments.append(ChatComment(timestamp_seconds=float(second) + index * 0.1, body="surge"))

        attach_chat_json_metrics(samples, comments, sample_interval_seconds=1.0)

        busy_score = max(sample.chat_json_score for sample in samples[60:110])
        surge_score = max(sample.chat_json_score for sample in samples[130:145])
        self.assertGreater(surge_score, 70)
        self.assertGreater(surge_score, busy_score + 10)

    def test_zero_comments_do_not_create_nan_or_infinity(self):
        samples = make_samples(60)

        attach_chat_json_metrics(samples, [], sample_interval_seconds=1.0)

        for sample in samples:
            self.assertEqual(sample.chat_json_score, sample.chat_json_score)
            self.assertNotEqual(sample.chat_json_score, float("inf"))
            self.assertNotEqual(sample.chat_json_score, float("-inf"))
            self.assertEqual(sample.chat_json_score, 0)

    def test_optimized_chat_windows_and_scores_match_reference_calculation(self):
        samples = [
            SampleMetrics(timestamp_seconds=float(second), timestamp=str(second))
            for second in range(180)
        ]
        for index, sample in enumerate(samples):
            sample.chat_message_count = (index * 7 + index // 11) % 5

        for window_seconds in (5.0, 10.0, 30.0):
            self.assertEqual(
                rolling_counts(samples, window_seconds),
                [
                    rolling_count(samples, index, window_seconds)
                    for index in range(len(samples))
                ],
            )

        for sample, count in zip(samples, rolling_counts(samples, 10.0)):
            sample.chat_message_count_10s = count
        for sample, count in zip(samples, rolling_counts(samples, 30.0)):
            sample.chat_message_count_30s = count

        expected_activity = reference_activity_scores(samples)
        expected_burst = reference_burst_scores(samples)

        self.assertEqual(
            compute_activity_percentile_scores(samples),
            expected_activity,
        )
        self.assertEqual(
            compute_local_burst_scores(samples, LOCAL_BASELINE_WINDOW_SECONDS),
            expected_burst,
        )


def make_samples(seconds: int) -> list[SampleMetrics]:
    return [
        SampleMetrics(timestamp_seconds=second, timestamp=f"00:00:{second % 60:02d}")
        for second in range(seconds)
    ]


def reference_activity_scores(samples: list[SampleMetrics]) -> list[float]:
    count_10s_values = [float(sample.chat_message_count_10s) for sample in samples]
    count_30s_values = [float(sample.chat_message_count_30s) for sample in samples]
    dynamic_strong_30s = max(
        STRONG_ACTIVITY_COUNT_30S,
        percentile(count_30s_values, 90),
    )
    scores: list[float] = []
    for sample in samples:
        count_10s = float(sample.chat_message_count_10s)
        count_30s = float(sample.chat_message_count_30s)
        percentile_score = (
            percentile_rank(count_10s_values, count_10s) * 0.35
            + percentile_rank(count_30s_values, count_30s) * 0.65
        )
        activity_gate = (
            soft_activity_gate(count_10s, LOW_ACTIVITY_COUNT_10S, STRONG_ACTIVITY_COUNT_10S)
            * 0.35
            + soft_activity_gate(count_30s, LOW_ACTIVITY_COUNT_30S, dynamic_strong_30s)
            * 0.65
        )
        scores.append(clamp(percentile_score * activity_gate / 100.0))
    return scores


def reference_burst_scores(samples: list[SampleMetrics]) -> list[float]:
    scores: list[float] = []
    for index, sample in enumerate(samples):
        baseline_counts = [
            float(previous.chat_message_count_10s)
            for previous in samples[:index]
            if previous.timestamp_seconds
            >= sample.timestamp_seconds - LOCAL_BASELINE_WINDOW_SECONDS
        ]
        if not baseline_counts:
            scores.append(0.0)
            continue
        baseline = median(baseline_counts)
        current = float(sample.chat_message_count_10s)
        delta = max(0.0, current - baseline)
        if delta <= 0:
            scores.append(0.0)
            continue
        needed_delta = max(6.0, baseline * 3.0)
        burst_ratio_score = clamp(delta / needed_delta * 100.0)
        absolute_count_gate = soft_activity_gate(
            current,
            LOW_ACTIVITY_COUNT_10S,
            STRONG_ACTIVITY_COUNT_10S,
        )
        scores.append(clamp(burst_ratio_score * absolute_count_gate / 100.0))
    return scores


if __name__ == "__main__":
    unittest.main()
