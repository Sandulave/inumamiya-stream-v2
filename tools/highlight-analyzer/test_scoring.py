import unittest

from models import SampleMetrics
from scoring import compute_audio_scores, compute_highlight_scores, merge_peaks


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


if __name__ == "__main__":
    unittest.main()
