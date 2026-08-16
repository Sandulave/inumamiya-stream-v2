import json
from pathlib import Path
import tempfile
import unittest

from analyze import write_highlights_json
from models import MomentCandidate


class OutputContractTest(unittest.TestCase):
    def test_vod_id_is_written_and_star_fields_are_not_written(self):
        moment = MomentCandidate(
            timestamp_seconds=100,
            timestamp="00:01:40",
            playback_start_seconds=80,
            playback_start_timestamp="00:01:20",
            audio_score=90,
            audio_raw_score=100,
            chat_score=10,
            chat_raw_score=12,
            audio_peak_timestamp_seconds=100,
            audio_peak_timestamp="00:01:40",
            chat_peak_timestamp_seconds=105,
            chat_peak_timestamp="00:01:45",
            audio_spike_score=90,
            audio_level_score=50,
            audio_db=-20,
            audio_delta=12,
            chat_json_score=10,
            event_chat_score=10,
            chat_activity_percentile_score=8,
            chat_local_burst_score=2,
            chat_message_count_10s=1,
            chat_message_count_30s=2,
            event_chat_peak_offset_seconds=5,
            possible_scene_change=False,
            event_highlight_score=40,
        )

        with tempfile.TemporaryDirectory() as tmpdir:
            output_path = Path(tmpdir) / "highlights.json"
            write_highlights_json(
                output_path,
                Path("archive.mp4"),
                120,
                1.0,
                [],
                [],
                [],
                [moment],
                {"audio": {"p50": 0, "p70": 0, "p85": 0, "p95": 90, "max": 90}, "chat": {"p50": 0, "p70": 0, "p85": 0, "p95": 10, "max": 10}},
                {"audioDelta": {"p50": 0, "p70": 0, "p85": 0, "p95": 12, "p99_5": 12, "max": 12}, "eventChatScore": {"p50": 0, "p70": 0, "p85": 0, "p95": 12, "p99_5": 12, "max": 12}},
                None,
                0.0,
                "2845096588",
            )
            payload = json.loads(output_path.read_text(encoding="utf-8"))

        self.assertEqual(payload["vodId"], "2845096588")
        self.assertIn("momentCandidates", payload)
        self.assertNotIn("discoverableMoments", payload)
        self.assertNotIn("starThresholds", payload)
        self.assertNotIn("audioStars", payload["momentCandidates"][0])
        self.assertNotIn("chatStars", payload["momentCandidates"][0])
        self.assertEqual(payload["momentCandidates"][0]["audioRawScore"], 100)
        self.assertEqual(payload["momentCandidates"][0]["chatRawScore"], 12)
        self.assertIn("rawScoreStatistics", payload)


if __name__ == "__main__":
    unittest.main()
