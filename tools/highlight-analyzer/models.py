from __future__ import annotations

from dataclasses import asdict, dataclass, field
from pathlib import Path
import json


DEFAULT_WEIGHTS = {
    "chat": 0.50,
    "audio_spike": 0.35,
    "audio_level": 0.15,
}

DEFAULT_ENHANCED_WEIGHTS = {
    "chat_json": 0.45,
    "audio_spike": 0.30,
    "chat_motion": 0.15,
    "audio_level": 0.10,
}

DEFAULT_EVENT_WEIGHTS = {
    "event_chat": 0.60,
    "audio_spike": 0.35,
    "audio_level": 0.05,
}


@dataclass(frozen=True)
class Roi:
    x: float
    y: float
    width: float
    height: float

    def validate(self) -> None:
        values = [self.x, self.y, self.width, self.height]
        if any(v < 0.0 or v > 1.0 for v in values):
            raise ValueError("ROIは0.0〜1.0の比率で指定してください。")
        if self.width <= 0.0 or self.height <= 0.0:
            raise ValueError("ROIのwidth/heightは0より大きい必要があります。")
        if self.x + self.width > 1.0 or self.y + self.height > 1.0:
            raise ValueError("ROIが動画範囲外です。config.jsonのchat_roiを確認してください。")

    def to_pixels(self, frame_width: int, frame_height: int) -> tuple[int, int, int, int]:
        self.validate()
        x = int(round(self.x * frame_width))
        y = int(round(self.y * frame_height))
        width = int(round(self.width * frame_width))
        height = int(round(self.height * frame_height))
        if width <= 0 or height <= 0:
            raise ValueError("ROIが小さすぎます。")
        return x, y, width, height


@dataclass
class AnalyzerConfig:
    chat_roi: Roi | None = None
    sample_interval_seconds: float = 1.0
    baseline_window_seconds: float = 30.0
    merge_window_seconds: float = 30.0
    top_n: int = 10
    highlight_weights: dict[str, float] = field(default_factory=lambda: DEFAULT_WEIGHTS.copy())
    enhanced_highlight_weights: dict[str, float] = field(default_factory=lambda: DEFAULT_ENHANCED_WEIGHTS.copy())
    event_highlight_weights: dict[str, float] = field(default_factory=lambda: DEFAULT_EVENT_WEIGHTS.copy())
    chat_event_window_before_seconds: float = 3.0
    chat_event_window_after_seconds: float = 12.0
    scene_change_penalty_multiplier: float = 0.4
    playback_preroll_seconds: float = 20.0
    max_audio_candidates: int = 50
    max_chat_candidates: int = 50
    min_audio_candidate_score: float = 1.0
    min_chat_candidate_score: float = 1.0

    @classmethod
    def load(cls, path: Path) -> "AnalyzerConfig":
        if not path.exists():
            return cls()
        with path.open("r", encoding="utf-8") as f:
            raw = json.load(f)
        roi = raw.get("chat_roi")
        return cls(
            chat_roi=Roi(**roi) if roi else None,
            sample_interval_seconds=float(raw.get("sample_interval_seconds", 1.0)),
            baseline_window_seconds=float(raw.get("baseline_window_seconds", 30.0)),
            merge_window_seconds=float(raw.get("merge_window_seconds", 30.0)),
            top_n=int(raw.get("top_n", 10)),
            highlight_weights={**DEFAULT_WEIGHTS, **raw.get("highlight_weights", {})},
            enhanced_highlight_weights={
                **DEFAULT_ENHANCED_WEIGHTS,
                **raw.get("enhanced_highlight_weights", {}),
            },
            event_highlight_weights={
                **DEFAULT_EVENT_WEIGHTS,
                **raw.get("event_highlight_weights", {}),
            },
            chat_event_window_before_seconds=float(raw.get("chat_event_window_before_seconds", 3.0)),
            chat_event_window_after_seconds=float(raw.get("chat_event_window_after_seconds", 12.0)),
            scene_change_penalty_multiplier=float(raw.get("scene_change_penalty_multiplier", 0.4)),
            playback_preroll_seconds=float(raw.get("playback_preroll_seconds", 20.0)),
            max_audio_candidates=int(raw.get("max_audio_candidates", 50)),
            max_chat_candidates=int(raw.get("max_chat_candidates", 50)),
            min_audio_candidate_score=float(raw.get("min_audio_candidate_score", 1.0)),
            min_chat_candidate_score=float(raw.get("min_chat_candidate_score", 1.0)),
        )

    def save(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        data = asdict(self)
        with path.open("w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            f.write("\n")


@dataclass
class SampleMetrics:
    timestamp_seconds: float
    timestamp: str
    chat_motion_raw: float = 0.0
    chat_score: float = 0.0
    chat_motion_score: float = 0.0
    chat_message_count: int = 0
    chat_message_rate: float = 0.0
    chat_message_count_5s: int = 0
    chat_message_count_10s: int = 0
    chat_message_count_30s: int = 0
    chat_activity_percentile_score: float = 0.0
    chat_local_burst_score: float = 0.0
    chat_json_score: float = 0.0
    audio_db: float = -100.0
    audio_delta: float = 0.0
    audio_eligible: bool = True
    audio_eligible_delta: float = 0.0
    audio_level_score: float = 0.0
    audio_spike_score: float = 0.0
    highlight_score: float = 0.0
    enhanced_highlight_score: float = 0.0
    possible_scene_change: bool = False
    event_chat_score: float = 0.0
    event_chat_peak_offset_seconds: float = 0.0
    event_highlight_score: float = 0.0
    scene_change_penalty_applied: bool = False
    audio_raw_score: float = 0.0
    chat_raw_score: float = 0.0
    audio_score: float = 0.0
    observation_chat_score: float = 0.0


@dataclass
class HighlightEvent:
    timestamp_seconds: float
    timestamp: str
    score: float
    chat_score: float
    audio_spike_score: float
    audio_level_score: float
    audio_db: float
    audio_delta: float


@dataclass
class EnhancedHighlightEvent:
    timestamp_seconds: float
    timestamp: str
    enhanced_score: float
    chat_json_score: float
    chat_motion_score: float
    audio_spike_score: float
    audio_level_score: float
    chat_message_count: int
    chat_message_count_10s: int
    chat_message_count_30s: int
    chat_message_rate: float
    chat_activity_percentile_score: float
    chat_local_burst_score: float
    possible_scene_change: bool


@dataclass
class EventHighlightEvent:
    timestamp_seconds: float
    timestamp: str
    playback_start_seconds: float
    playback_start_timestamp: str
    event_highlight_score: float
    event_chat_score: float
    event_chat_peak_offset_seconds: float
    chat_json_score: float
    chat_message_count_10s: int
    chat_message_count_30s: int
    audio_spike_score: float
    audio_level_score: float
    chat_motion_score: float
    possible_scene_change: bool
    scene_change_penalty_applied: bool


@dataclass
class MomentCandidate:
    timestamp_seconds: float
    timestamp: str
    playback_start_seconds: float
    playback_start_timestamp: str
    audio_score: float
    audio_raw_score: float
    chat_score: float
    chat_raw_score: float
    audio_peak_timestamp_seconds: float | None
    audio_peak_timestamp: str | None
    chat_peak_timestamp_seconds: float | None
    chat_peak_timestamp: str | None
    audio_spike_score: float
    audio_level_score: float
    audio_db: float
    audio_delta: float
    chat_json_score: float
    event_chat_score: float
    chat_activity_percentile_score: float
    chat_local_burst_score: float
    chat_message_count_10s: int
    chat_message_count_30s: int
    event_chat_peak_offset_seconds: float
    possible_scene_change: bool
    event_highlight_score: float
