import unittest

from chat_json import ChatComment, attach_chat_json_metrics
from models import SampleMetrics


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


def make_samples(seconds: int) -> list[SampleMetrics]:
    return [
        SampleMetrics(timestamp_seconds=second, timestamp=f"00:00:{second % 60:02d}")
        for second in range(seconds)
    ]


if __name__ == "__main__":
    unittest.main()
