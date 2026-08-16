import unittest

from models import SampleMetrics
from scoring import compute_observation_scores, compute_score_statistics, merge_moment_candidates


class MomentCandidatesTest(unittest.TestCase):
    def test_audio_high_chat_low_remains_candidate(self):
        samples = make_samples(20)
        samples[10].audio_spike_score = 95
        samples[10].audio_delta = 20
        compute_observation_scores(samples)

        moments = merge_moment_candidates(samples, 30, 50, 50, 1, 1, 20)

        self.assertEqual(len(moments), 1)
        self.assertGreater(moments[0].audio_score, 90)
        self.assertEqual(moments[0].audio_raw_score, 95)
        self.assertEqual(moments[0].chat_score, 0)

    def test_chat_high_audio_low_remains_candidate(self):
        samples = make_samples(20)
        samples[10].event_chat_score = 95
        samples[10].chat_message_count_10s = 8
        samples[10].chat_message_count_30s = 20
        compute_observation_scores(samples)

        moments = merge_moment_candidates(samples, 30, 50, 50, 1, 1, 20)

        self.assertEqual(len(moments), 1)
        self.assertEqual(moments[0].audio_score, 0)
        self.assertGreater(moments[0].chat_score, 90)
        self.assertEqual(moments[0].chat_raw_score, 95)

    def test_chat_candidates_are_not_crowded_out_by_many_audio_candidates(self):
        samples = make_samples(200)
        for second in range(0, 100, 10):
            samples[second].audio_spike_score = 90 - second * 0.1
            samples[second].audio_delta = 20 - second * 0.1
        samples[150].event_chat_score = 95
        samples[150].chat_message_count_10s = 8
        samples[150].chat_message_count_30s = 20
        compute_observation_scores(samples)

        moments = merge_moment_candidates(samples, 5, 3, 3, 1, 1, 20)

        self.assertTrue(any(moment.chat_score > 90 for moment in moments))

    def test_nearby_audio_and_chat_peaks_merge_and_keep_max_scores(self):
        samples = make_samples(160)
        samples[100].audio_spike_score = 90
        samples[100].audio_delta = 20
        samples[117].event_chat_score = 95
        samples[117].chat_message_count_10s = 8
        samples[117].chat_message_count_30s = 20
        compute_observation_scores(samples)

        moments = merge_moment_candidates(samples, 30, 50, 50, 1, 1, 20)

        self.assertEqual(len(moments), 1)
        self.assertGreater(moments[0].audio_score, 90)
        self.assertGreater(moments[0].chat_score, 90)

    def test_distinct_audio_and_chat_peak_timestamps_are_preserved(self):
        samples = make_samples(160)
        samples[100].audio_spike_score = 90
        samples[100].audio_delta = 20
        samples[117].event_chat_score = 95
        samples[117].chat_message_count_10s = 8
        samples[117].chat_message_count_30s = 20
        compute_observation_scores(samples)

        moments = merge_moment_candidates(samples, 30, 50, 50, 1, 1, 20)

        self.assertEqual(moments[0].audio_peak_timestamp_seconds, 100)
        self.assertEqual(moments[0].audio_peak_timestamp, "00:01:40")
        self.assertEqual(moments[0].chat_peak_timestamp_seconds, 117)
        self.assertEqual(moments[0].chat_peak_timestamp, "00:01:57")

    def test_chain_merge_is_prevented_for_three_candidates(self):
        samples = make_samples(80)
        set_audio_candidates(samples, [0, 25, 50])
        compute_observation_scores(samples)

        moments = merge_moment_candidates(samples, 30, 50, 50, 1, 1, 20)

        self.assertEqual([moment.audio_peak_timestamp_seconds for moment in moments], [50, 25])

    def test_candidates_inside_anchor_window_merge(self):
        samples = make_samples(50)
        set_audio_candidates(samples, [0, 10, 20, 30])
        compute_observation_scores(samples)

        moments = merge_moment_candidates(samples, 30, 50, 50, 1, 1, 20)

        self.assertEqual(len(moments), 1)

    def test_candidate_just_outside_anchor_window_starts_new_moment(self):
        samples = make_samples(60)
        samples[0].audio_delta = 100
        samples[0].audio_spike_score = 100
        samples[30].audio_delta = 100
        samples[30].audio_spike_score = 100
        samples[31].audio_delta = 100
        samples[31].audio_spike_score = 100
        compute_observation_scores(samples)

        moments = merge_moment_candidates(samples, 30, 50, 50, 1, 1, 20)

        self.assertEqual(len(moments), 2)
        self.assertEqual(sorted(moment.timestamp_seconds for moment in moments), [0, 31])

    def test_audio_and_chat_candidates_inside_anchor_window_merge(self):
        samples = make_samples(150)
        samples[100].audio_delta = 40
        samples[100].audio_spike_score = 100
        samples[120].event_chat_score = 80
        compute_observation_scores(samples)

        moments = merge_moment_candidates(samples, 30, 50, 50, 1, 1, 20)

        self.assertEqual(len(moments), 1)
        self.assertEqual(moments[0].audio_peak_timestamp_seconds, 100)
        self.assertEqual(moments[0].chat_peak_timestamp_seconds, 120)

    def test_audio_and_chat_candidates_outside_anchor_window_do_not_merge(self):
        samples = make_samples(160)
        samples[100].audio_delta = 40
        samples[100].audio_spike_score = 100
        samples[135].event_chat_score = 80
        compute_observation_scores(samples)

        moments = merge_moment_candidates(samples, 30, 50, 50, 1, 1, 20)

        self.assertEqual(len(moments), 2)

    def test_long_chain_does_not_collapse_into_one_moment(self):
        samples = make_samples(130)
        set_audio_candidates(samples, [0, 25, 50, 75, 100])
        compute_observation_scores(samples)

        moments = merge_moment_candidates(samples, 30, 50, 50, 1, 1, 20)

        self.assertEqual(len(moments), 3)

    def test_merged_moment_keeps_max_audio_and_chat_peak_values(self):
        samples = make_samples(150)
        samples[100].audio_delta = 30
        samples[100].audio_spike_score = 80
        samples[110].audio_delta = 40
        samples[110].audio_spike_score = 100
        samples[115].event_chat_score = 50
        samples[120].event_chat_score = 90
        compute_observation_scores(samples)

        moments = merge_moment_candidates(samples, 30, 50, 50, 1, 1, 20)

        self.assertEqual(len(moments), 1)
        self.assertEqual(moments[0].audio_score, 100)
        self.assertEqual(moments[0].chat_score, 100)
        self.assertEqual(moments[0].audio_peak_timestamp_seconds, 110)
        self.assertEqual(moments[0].chat_peak_timestamp_seconds, 120)

    def test_score_statistics_are_numeric_not_star_thresholds(self):
        samples = make_samples(5)
        samples[1].audio_spike_score = 10
        samples[1].audio_delta = 3
        samples[2].audio_spike_score = 50
        samples[2].audio_delta = 10
        samples[3].event_chat_score = 80
        samples[3].chat_message_count_10s = 6
        samples[3].chat_message_count_30s = 12
        compute_observation_scores(samples)

        stats = compute_score_statistics(samples)

        self.assertIn("p50", stats["audio"])
        self.assertIn("p95", stats["chat"])
        self.assertNotIn("star5", stats["audio"])


def make_samples(seconds: int) -> list[SampleMetrics]:
    return [
        SampleMetrics(timestamp_seconds=second, timestamp=format_timestamp(second))
        for second in range(seconds)
    ]


def set_audio_candidates(samples: list[SampleMetrics], timestamps: list[int]) -> None:
    for timestamp in timestamps:
        samples[timestamp].audio_delta = 40 + timestamp
        samples[timestamp].audio_spike_score = 100


def format_timestamp(seconds: int) -> str:
    hours = seconds // 3600
    minutes = (seconds % 3600) // 60
    secs = seconds % 60
    return f"{hours:02d}:{minutes:02d}:{secs:02d}"


if __name__ == "__main__":
    unittest.main()
