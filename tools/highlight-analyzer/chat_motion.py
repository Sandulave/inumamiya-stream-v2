from __future__ import annotations

import cv2
import numpy as np

from models import Roi


def preprocess_chat_frame(frame: np.ndarray, roi: Roi) -> np.ndarray:
    frame_height, frame_width = frame.shape[:2]
    x, y, width, height = roi.to_pixels(frame_width, frame_height)
    cropped = frame[y : y + height, x : x + width]
    gray = cv2.cvtColor(cropped, cv2.COLOR_BGR2GRAY)
    return cv2.GaussianBlur(gray, (5, 5), 0)


def chat_motion_ratio(previous: np.ndarray | None, current: np.ndarray) -> float:
    if previous is None:
        return 0.0
    diff = cv2.absdiff(previous, current)
    _, thresholded = cv2.threshold(diff, 25, 255, cv2.THRESH_BINARY)
    changed_pixels = int(np.count_nonzero(thresholded))
    total_pixels = int(thresholded.size)
    if total_pixels == 0:
        return 0.0
    return changed_pixels / total_pixels * 100.0
