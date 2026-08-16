import unittest

from models import SampleMetrics
from scoring import compute_event_highlight_scores, merge_event_peaks


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


def make_samples(seconds: int) -> list[SampleMetrics]:
    return [
        SampleMetrics(timestamp_seconds=second, timestamp=f"00:00:{second % 60:02d}")
        for second in range(seconds)
    ]


if __name__ == "__main__":
    unittest.main()
