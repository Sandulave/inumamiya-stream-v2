from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

from analyze import analyze_video, UserFacingError
from models import AnalyzerConfig, Roi


class VideoCoverageTest(unittest.TestCase):
    def analyze_with_readable_frames(self, duration, readable_frames, interval=1.0):
        capture = Mock()
        capture.isOpened.return_value = True
        capture.read.side_effect = [(True, object())] * readable_frames + [(False, None)]
        cv2 = SimpleNamespace(VideoCapture=Mock(return_value=capture), CAP_PROP_POS_MSEC=0)
        chat_motion = SimpleNamespace(
            preprocess_chat_frame=Mock(return_value=object()),
            chat_motion_ratio=Mock(return_value=0.0),
        )
        config = AnalyzerConfig(chat_roi=Roi(0, 0, 1, 1), sample_interval_seconds=interval)
        with patch.dict("sys.modules", {"cv2": cv2, "chat_motion": chat_motion}), patch("builtins.print"):
            try:
                return analyze_video(Path("archive.mp4"), config, {"duration": duration})
            finally:
                capture.release.assert_called_once()

    def test_read_failure_mid_archive_rejects_partial_analysis(self):
        # A long VOD must not be published with only its first 36 minutes.
        with self.assertRaisesRegex(UserFacingError, "00:35:50 / 動画長 12:20:57"):
            self.analyze_with_readable_frames(44457, 2150)

    def test_read_failure_more_than_one_interval_before_end_is_rejected(self):
        with self.assertRaises(UserFacingError):
            self.analyze_with_readable_frames(10, 8)

    def test_final_seek_rounding_is_tolerated(self):
        for duration, readable_frames, interval in [(10, 9, 1.0), (10.01, 10, 1.0), (10, 4, 2.0)]:
            with self.subTest(duration=duration, interval=interval):
                samples = self.analyze_with_readable_frames(duration, readable_frames, interval)
                self.assertEqual(len(samples), readable_frames)

    def test_complete_archive_keeps_last_sample(self):
        samples = self.analyze_with_readable_frames(10, 10)
        self.assertEqual([sample.timestamp_seconds for sample in samples], list(range(10)))

    def test_unreadable_short_video_is_rejected(self):
        with self.assertRaises(UserFacingError):
            self.analyze_with_readable_frames(0.5, 0)


if __name__ == "__main__":
    unittest.main()
