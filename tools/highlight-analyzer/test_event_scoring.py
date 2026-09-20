import unittest

from models import SampleMetrics
from scoring import clamp, compute_event_highlight_scores, merge_event_peaks


EVENT_WEIGHTS = {
    "event_chat": 0.60,
    "audio_spike": 0.35,
    "audio_level": 0.05,
}


class EventScoringTest(unittest.TestCase):
    def test_audio_peak_and_delayed_chat_are_scored_as_one_event(self):
        samples = make_samples(140)
        samples[100].audio_spike_score = 90
        samples[106].chat_json_score = 95

        compute_event_highlight_scores(samples, EVENT_WEIGHTS, 3, 12, 0.4)

        self.assertGreater(samples[100].event_highlight_score, 85)
        self.assertEqual(samples[100].event_chat_score, 95)
        self.assertEqual(samples[100].event_chat_peak_offset_seconds, 6)

    def test_scene_change_penalty_reduces_audio_only_motion_event(self):
        samples = make_samples(140)
        samples[100].audio_spike_score = 100
        samples[100].audio_level_score = 50
        samples[100].chat_motion_score = 100

        compute_event_highlight_scores(samples, EVENT_WEIGHTS, 3, 12, 0.4)

        self.assertTrue(samples[100].possible_scene_change)
        self.assertTrue(samples[100].scene_change_penalty_applied)
        self.assertLess(samples[100].event_highlight_score, 20)

    def test_chat_only_event_remains_a_candidate(self):
        samples = make_samples(140)
        samples[100].chat_json_score = 95
        samples[100].audio_spike_score = 5

        compute_event_highlight_scores(samples, EVENT_WEIGHTS, 3, 12, 0.4)
        events = merge_event_peaks(samples, 30, 10, 20)

        self.assertEqual(events[0].timestamp_seconds, 100)
        self.assertGreater(events[0].event_highlight_score, 55)

    def test_nearby_high_scores_merge_into_one_event(self):
        samples = make_samples(180)
        samples[100].chat_json_score = 90
        samples[110].chat_json_score = 95
        samples[130].chat_json_score = 85

        compute_event_highlight_scores(samples, EVENT_WEIGHTS, 3, 12, 0.4)
        events = merge_event_peaks(samples, 30, 10, 20)

        self.assertEqual(len(events), 1)
        self.assertEqual(events[0].timestamp_seconds, 110)

    def test_playback_start_does_not_go_below_zero(self):
        samples = make_samples(40)
        samples[10].chat_json_score = 100

        compute_event_highlight_scores(samples, EVENT_WEIGHTS, 3, 12, 0.4)
        events = merge_event_peaks(samples, 30, 10, 20)

        self.assertEqual(events[0].timestamp_seconds, 10)
        self.assertEqual(events[0].playback_start_seconds, 0)
        self.assertEqual(events[0].playback_start_timestamp, "00:00:00")

    def test_optimized_event_window_matches_reference_calculation(self):
        samples = make_samples(180)
        for index, sample in enumerate(samples):
            sample.chat_json_score = float((index * 13) % 101)
            sample.chat_message_count_30s = (index * 5) % 23
            sample.audio_spike_score = float(index % 19)
            sample.audio_level_score = float(index % 7)
            sample.chat_motion_score = float(index % 103)

        expected = reference_event_scores(samples, 3, 12, 0.4)
        compute_event_highlight_scores(samples, EVENT_WEIGHTS, 3, 12, 0.4)

        self.assertEqual(
            [
                (
                    sample.event_chat_score,
                    sample.event_chat_peak_offset_seconds,
                    sample.event_highlight_score,
                    sample.possible_scene_change,
                    sample.scene_change_penalty_applied,
                )
                for sample in samples
            ],
            expected,
        )


def make_samples(seconds: int) -> list[SampleMetrics]:
    return [
        SampleMetrics(timestamp_seconds=second, timestamp=f"00:00:{second % 60:02d}")
        for second in range(seconds)
    ]


def reference_event_scores(
    samples: list[SampleMetrics],
    before_seconds: float,
    after_seconds: float,
    scene_change_penalty_multiplier: float,
) -> list[tuple[float, float, float, bool, bool]]:
    total = sum(EVENT_WEIGHTS.values())
    chat_weight = EVENT_WEIGHTS["event_chat"] / total
    spike_weight = EVENT_WEIGHTS["audio_spike"] / total
    level_weight = EVENT_WEIGHTS["audio_level"] / total
    expected: list[tuple[float, float, float, bool, bool]] = []
    for sample in samples:
        candidates = [
            candidate
            for candidate in samples
            if sample.timestamp_seconds - before_seconds
            <= candidate.timestamp_seconds
            <= sample.timestamp_seconds + after_seconds
        ]
        peak = max(
            candidates,
            key=lambda candidate: (
                candidate.chat_json_score,
                candidate.chat_message_count_30s,
                -abs(candidate.timestamp_seconds - sample.timestamp_seconds),
            ),
        )
        possible_scene_change = (
            sample.chat_motion_score >= 85.0 and peak.chat_json_score < 20.0
        )
        score = clamp(
            peak.chat_json_score * chat_weight
            + sample.audio_spike_score * spike_weight
            + sample.audio_level_score * level_weight
        )
        penalty_applied = possible_scene_change and peak.chat_json_score < 20.0
        if penalty_applied:
            score = clamp(score * scene_change_penalty_multiplier)
        expected.append(
            (
                peak.chat_json_score,
                peak.timestamp_seconds - sample.timestamp_seconds,
                score,
                possible_scene_change,
                penalty_applied,
            )
        )
    return expected


if __name__ == "__main__":
    unittest.main()
