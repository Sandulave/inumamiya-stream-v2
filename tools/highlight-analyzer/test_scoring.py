import unittest

from models import SampleMetrics
from scoring import (
    AUDIO_MIN_LOUDNESS_DBFS,
    compute_audio_scores,
    compute_highlight_scores,
    compute_observation_scores,
    merge_moment_candidates,
    merge_peaks,
)


class ScoringTest(unittest.TestCase):
    def test_audio_spike_score_uses_recent_baseline(self):
        samples = [
            SampleMetrics(timestamp_seconds=0, timestamp="00:00:00", audio_db=-30),
            SampleMetrics(timestamp_seconds=1, timestamp="00:00:01", audio_db=-29),
            SampleMetrics(timestamp_seconds=2, timestamp="00:00:02", audio_db=-12),
        ]

        compute_audio_scores(samples, baseline_window_seconds=30)

        self.assertGreater(samples[2].audio_delta, 15)
        self.assertGreater(samples[2].audio_spike_score, 80)

    def test_quiet_voice_after_silence_is_not_audio_candidate(self):
        samples = make_audio_samples([-80.0] * 60 + [AUDIO_MIN_LOUDNESS_DBFS - 1.0])

        compute_audio_scores(samples, baseline_window_seconds=60)
        compute_observation_scores(samples)
        moments = merge_moment_candidates(samples, 30, 50, 50, 1, 1, 20)

        self.assertGreater(samples[-1].audio_delta, 40)
        self.assertFalse(samples[-1].audio_eligible)
        self.assertEqual(samples[-1].audio_spike_score, 0)
        self.assertEqual(samples[-1].audio_score, 0)
        self.assertEqual(moments, [])

    def test_loud_voice_above_normal_conversation_is_audio_candidate(self):
        samples = make_audio_samples([-32.0] * 60 + [-12.0])

        compute_audio_scores(samples, baseline_window_seconds=60)
        compute_observation_scores(samples)
        moments = merge_moment_candidates(samples, 30, 50, 50, 1, 1, 20)

        self.assertTrue(samples[-1].audio_eligible)
        self.assertGreater(samples[-1].audio_spike_score, 80)
        self.assertGreater(samples[-1].audio_score, 90)
        self.assertEqual(len(moments), 1)

    def test_sustained_loud_audio_without_delta_is_not_audio_candidate(self):
        samples = make_audio_samples([-10.0] * 90)

        compute_audio_scores(samples, baseline_window_seconds=60)
        compute_observation_scores(samples)
        moments = merge_moment_candidates(samples, 30, 50, 50, 1, 1, 20)

        self.assertEqual(max(sample.audio_delta for sample in samples), 0)
        self.assertTrue(all(sample.audio_score == 0 for sample in samples))
        self.assertEqual(moments, [])

    def test_audio_loudness_threshold_is_inclusive(self):
        samples = make_audio_samples([-50.0] * 60 + [AUDIO_MIN_LOUDNESS_DBFS])

        compute_audio_scores(samples, baseline_window_seconds=60)
        compute_observation_scores(samples)

        self.assertTrue(samples[-1].audio_eligible)
        self.assertGreater(samples[-1].audio_eligible_delta, 0)
        self.assertEqual(samples[-1].audio_score, 100)

    def test_audio_scores_normalize_after_loudness_gate(self):
        samples = make_audio_samples(
            [-50.0] * 60
            + [AUDIO_MIN_LOUDNESS_DBFS - 1.0]
            + [-30.0] * 60
            + [AUDIO_MIN_LOUDNESS_DBFS]
            + [-30.0] * 60
            + [0.0]
        )

        compute_audio_scores(samples, baseline_window_seconds=60)
        compute_observation_scores(samples)

        self.assertEqual(samples[60].audio_score, 0)
        self.assertAlmostEqual(samples[121].audio_score, 50)
        self.assertEqual(samples[182].audio_score, 100)

    def test_audio_loudness_gate_does_not_change_chat_score(self):
        samples = make_audio_samples([-80.0] * 60 + [AUDIO_MIN_LOUDNESS_DBFS - 1.0])
        samples[-1].event_chat_score = 80
        samples[-1].chat_message_count_10s = 8
        samples[-1].chat_message_count_30s = 20

        compute_audio_scores(samples, baseline_window_seconds=60)
        compute_observation_scores(samples)

        self.assertEqual(samples[-1].audio_score, 0)
        self.assertEqual(samples[-1].observation_chat_score, 100)

    def test_merge_peaks_keeps_best_candidate_in_window(self):
        samples = [
            SampleMetrics(timestamp_seconds=10, timestamp="00:00:10", highlight_score=80),
            SampleMetrics(timestamp_seconds=20, timestamp="00:00:20", highlight_score=95),
            SampleMetrics(timestamp_seconds=70, timestamp="00:01:10", highlight_score=90),
        ]

        highlights = merge_peaks(samples, merge_window_seconds=30, top_n=10)

        self.assertEqual([item.timestamp for item in highlights], ["00:00:20", "00:01:10"])

    def test_highlight_score_weights_are_normalized(self):
        sample = SampleMetrics(
            timestamp_seconds=0,
            timestamp="00:00:00",
            chat_score=100,
            audio_spike_score=50,
            audio_level_score=0,
        )

        compute_highlight_scores([sample], {"chat": 5, "audio_spike": 3.5, "audio_level": 1.5})

        self.assertEqual(sample.highlight_score, 67.5)

def make_audio_samples(audio_values: list[float]) -> list[SampleMetrics]:
    return [
        SampleMetrics(
            timestamp_seconds=float(index),
            timestamp=f"00:00:{index:02d}",
            audio_db=audio_db,
        )
        for index, audio_db in enumerate(audio_values)
    ]


if __name__ == "__main__":
    unittest.main()
