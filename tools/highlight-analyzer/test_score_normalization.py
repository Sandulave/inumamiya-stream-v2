import unittest

from models import SampleMetrics
from scoring import compute_observation_scores, merge_moment_candidates, normalize_against_max


class ScoreNormalizationTest(unittest.TestCase):
    def test_audio_delta_candidates_scale_linearly_to_max(self):
        samples = make_samples(4)
        for sample, delta in zip(samples, [10, 20, 30, 40]):
            sample.audio_delta = delta
            sample.audio_spike_score = 100

        compute_observation_scores(samples)
        scores = [sample.audio_score for sample in samples]

        self.assertEqual(scores, [25, 50, 75, 100])

    def test_strongest_audio_candidate_scores_high(self):
        samples = make_samples(5)
        for sample, delta in zip(samples, [1, 3, 5, 10, 30]):
            sample.audio_delta = delta
            sample.audio_spike_score = min(100, delta / 18 * 100)

        compute_observation_scores(samples)

        self.assertGreaterEqual(samples[-1].audio_score, 90)

    def test_weak_audio_change_does_not_score_high(self):
        score = normalize_against_max(1, 30)

        self.assertLess(score, 35)

    def test_event_chat_score_scales_linearly_to_max(self):
        samples = make_samples(4)
        for sample, raw in zip(samples, [10, 20, 30, 40]):
            sample.event_chat_score = raw

        compute_observation_scores(samples)
        scores = [sample.observation_chat_score for sample in samples]

        self.assertEqual(scores, [25, 50, 75, 100])

    def test_max_chat_raw_score_scores_100(self):
        samples = make_samples(5)
        for sample, raw in zip(samples, [2, 5, 10, 20, 50]):
            sample.event_chat_score = raw

        compute_observation_scores(samples)

        self.assertEqual(samples[-1].observation_chat_score, 100)

    def test_mid_chat_raw_score_is_middle_range(self):
        samples = make_samples(5)
        for sample, raw in zip(samples, [2, 5, 10, 20, 50]):
            sample.event_chat_score = raw

        compute_observation_scores(samples)

        self.assertEqual(samples[2].observation_chat_score, 20)

    def test_low_activity_chat_is_not_capped_when_it_is_vod_max(self):
        samples = make_samples(3)
        samples[0].event_chat_score = 80
        samples[0].chat_message_count_10s = 0
        samples[0].chat_message_count_30s = 1

        compute_observation_scores(samples)

        self.assertEqual(samples[0].observation_chat_score, 100)

    def test_normalized_scores_are_monotonic_with_raw_values(self):
        values = [1, 3, 8, 13, 21]
        scores = [normalize_against_max(value, max(values)) for value in values]

        self.assertEqual(scores, sorted(scores))

    def test_moment_candidate_keeps_raw_scores(self):
        samples = make_samples(5)
        samples[2].audio_delta = 30
        samples[2].audio_spike_score = 100
        samples[2].event_chat_score = 50
        samples[2].chat_message_count_10s = 6
        samples[2].chat_message_count_30s = 12
        compute_observation_scores(samples)

        moments = merge_moment_candidates(samples, 30, 50, 50, 1, 1, 20)

        self.assertEqual(moments[0].audio_raw_score, 100)
        self.assertEqual(moments[0].chat_raw_score, 50)


def make_samples(seconds: int) -> list[SampleMetrics]:
    return [
        SampleMetrics(timestamp_seconds=second, timestamp=f"00:00:{second:02d}")
        for second in range(seconds)
    ]


if __name__ == "__main__":
    unittest.main()
