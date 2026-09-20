from __future__ import annotations

from bisect import bisect_left, bisect_right, insort
from collections import deque
from dataclasses import dataclass
import json
from pathlib import Path
from typing import Any

from models import SampleMetrics
from scoring import clamp, percentile


class ChatJsonError(RuntimeError):
    pass


CHAT_JSON_SCORE_WEIGHTS = {
    "activity_percentile": 0.70,
    "local_burst": 0.30,
}
LOCAL_BASELINE_WINDOW_SECONDS = 120.0
LOW_ACTIVITY_COUNT_10S = 2.0
STRONG_ACTIVITY_COUNT_10S = 10.0
LOW_ACTIVITY_COUNT_30S = 4.0
STRONG_ACTIVITY_COUNT_30S = 18.0


@dataclass(frozen=True)
class ChatComment:
    timestamp_seconds: float
    body: str
    user_name: str | None = None


def load_twitch_downloader_comments(path: Path) -> list[ChatComment]:
    if not path.exists():
        raise ChatJsonError(f"Chat JSONが存在しません: {path}")
    try:
        with path.open("r", encoding="utf-8-sig") as f:
            payload = json.load(f)
    except json.JSONDecodeError as exc:
        raise ChatJsonError(f"Chat JSONのparseに失敗しました: {path}") from exc

    comments_raw = payload.get("comments") if isinstance(payload, dict) else None
    if not isinstance(comments_raw, list):
        raise ChatJsonError("TwitchDownloader想定形式ではありません。JSON直下に comments 配列が必要です。")

    comments: list[ChatComment] = []
    unreadable_timestamps = 0
    for item in comments_raw:
        if not isinstance(item, dict):
            continue
        timestamp = read_comment_timestamp(item)
        if timestamp is None:
            unreadable_timestamps += 1
            continue
        message = item.get("message") if isinstance(item.get("message"), dict) else {}
        commenter = item.get("commenter") if isinstance(item.get("commenter"), dict) else {}
        comments.append(
            ChatComment(
                timestamp_seconds=timestamp,
                body=str(message.get("body") or ""),
                user_name=read_user_name(commenter),
            )
        )

    if unreadable_timestamps and not comments:
        raise ChatJsonError("comment timestampが読めません。content_offset_seconds を含むChat JSONを指定してください。")
    if not comments:
        raise ChatJsonError("Chat JSON内のコメントが0件です。")
    comments.sort(key=lambda comment: comment.timestamp_seconds)
    return comments


def read_comment_timestamp(item: dict[str, Any]) -> float | None:
    for key in ("content_offset_seconds", "contentOffsetSeconds", "offset_seconds", "offsetSeconds"):
        value = item.get(key)
        if isinstance(value, (int, float)):
            return float(value)
        if isinstance(value, str):
            try:
                return float(value)
            except ValueError:
                pass
    return None


def read_user_name(commenter: dict[str, Any]) -> str | None:
    for key in ("display_name", "displayName", "name", "login"):
        value = commenter.get(key)
        if isinstance(value, str) and value:
            return value
    return None


def attach_chat_json_metrics(
    samples: list[SampleMetrics],
    comments: list[ChatComment],
    sample_interval_seconds: float,
    vod_offset_seconds: float = 0.0,
) -> None:
    if not samples:
        return

    counts = [0 for _ in samples]
    for comment in comments:
        video_time = comment.timestamp_seconds - vod_offset_seconds
        if video_time < 0:
            continue
        index = int(video_time // sample_interval_seconds)
        if 0 <= index < len(counts):
            counts[index] += 1

    for sample, count in zip(samples, counts):
        sample.chat_message_count = count

    counts_5s = rolling_counts(samples, 5.0)
    counts_10s = rolling_counts(samples, 10.0)
    counts_30s = rolling_counts(samples, 30.0)
    for sample, count_5s, count_10s, count_30s in zip(
        samples,
        counts_5s,
        counts_10s,
        counts_30s,
    ):
        sample.chat_message_count_5s = count_5s
        sample.chat_message_count_10s = count_10s
        sample.chat_message_count_30s = count_30s
        sample.chat_message_rate = sample.chat_message_count_10s / 10.0

    scores = compute_chat_json_scores(samples)
    for sample, score in zip(samples, scores):
        sample.chat_json_score = score


def rolling_count(samples: list[SampleMetrics], index: int, window_seconds: float) -> int:
    current_time = samples[index].timestamp_seconds
    start_time = current_time - window_seconds
    return sum(
        sample.chat_message_count
        for sample in samples[: index + 1]
        if sample.timestamp_seconds > start_time
    )


def rolling_counts(samples: list[SampleMetrics], window_seconds: float) -> list[int]:
    """Return chronological rolling counts with the same exclusive start as rolling_count."""
    totals: list[int] = []
    left = 0
    total = 0
    for index, sample in enumerate(samples):
        total += sample.chat_message_count
        start_time = sample.timestamp_seconds - window_seconds
        while left <= index and samples[left].timestamp_seconds <= start_time:
            total -= samples[left].chat_message_count
            left += 1
        totals.append(total)
    return totals


def compute_chat_json_scores(
    samples: list[SampleMetrics],
    baseline_window_seconds: float = LOCAL_BASELINE_WINDOW_SECONDS,
) -> list[float]:
    activity_scores = compute_activity_percentile_scores(samples)
    burst_scores = compute_local_burst_scores(samples, baseline_window_seconds)
    activity_weight = CHAT_JSON_SCORE_WEIGHTS["activity_percentile"]
    burst_weight = CHAT_JSON_SCORE_WEIGHTS["local_burst"]
    total = activity_weight + burst_weight
    scores: list[float] = []
    for sample, activity_score, burst_score in zip(samples, activity_scores, burst_scores):
        sample.chat_activity_percentile_score = activity_score
        sample.chat_local_burst_score = burst_score
        scores.append(clamp((activity_score * activity_weight + burst_score * burst_weight) / total))
    return scores


def compute_activity_percentile_scores(samples: list[SampleMetrics]) -> list[float]:
    count_10s_values = [float(sample.chat_message_count_10s) for sample in samples]
    count_30s_values = [float(sample.chat_message_count_30s) for sample in samples]
    sorted_count_10s_values = sorted(count_10s_values)
    sorted_count_30s_values = sorted(count_30s_values)
    p90_30s = percentile(count_30s_values, 90) if count_30s_values else 0.0
    dynamic_strong_30s = max(STRONG_ACTIVITY_COUNT_30S, p90_30s)

    scores: list[float] = []
    for sample in samples:
        rank_10s = percentile_rank_sorted(
            sorted_count_10s_values,
            float(sample.chat_message_count_10s),
        )
        rank_30s = percentile_rank_sorted(
            sorted_count_30s_values,
            float(sample.chat_message_count_30s),
        )
        percentile_score = rank_10s * 0.35 + rank_30s * 0.65
        count_gate_10s = soft_activity_gate(
            float(sample.chat_message_count_10s),
            LOW_ACTIVITY_COUNT_10S,
            STRONG_ACTIVITY_COUNT_10S,
        )
        count_gate_30s = soft_activity_gate(
            float(sample.chat_message_count_30s),
            LOW_ACTIVITY_COUNT_30S,
            dynamic_strong_30s,
        )
        activity_gate = count_gate_10s * 0.35 + count_gate_30s * 0.65
        scores.append(clamp(percentile_score * activity_gate / 100.0))
    return scores


def compute_local_burst_scores(samples: list[SampleMetrics], baseline_window_seconds: float) -> list[float]:
    scores: list[float] = []
    baseline_samples: deque[tuple[float, float]] = deque()
    sorted_baseline_counts: list[float] = []
    for sample in samples:
        start_time = sample.timestamp_seconds - baseline_window_seconds
        while baseline_samples and baseline_samples[0][0] < start_time:
            _, expired_count = baseline_samples.popleft()
            del sorted_baseline_counts[bisect_left(sorted_baseline_counts, expired_count)]

        if not sorted_baseline_counts:
            scores.append(0.0)
        else:
            baseline = median_sorted(sorted_baseline_counts)
            current = float(sample.chat_message_count_10s)
            delta = max(0.0, current - baseline)
            if delta <= 0.0:
                scores.append(0.0)
            else:
                needed_delta = max(6.0, baseline * 3.0)
                burst_ratio_score = clamp(delta / needed_delta * 100.0)
                absolute_count_gate = soft_activity_gate(
                    current,
                    LOW_ACTIVITY_COUNT_10S,
                    STRONG_ACTIVITY_COUNT_10S,
                )
                scores.append(clamp(burst_ratio_score * absolute_count_gate / 100.0))

        current = float(sample.chat_message_count_10s)
        baseline_samples.append((sample.timestamp_seconds, current))
        insort(sorted_baseline_counts, current)
    return scores


def percentile_rank(values: list[float], value: float) -> float:
    if not values:
        return 0.0
    below = sum(1 for item in values if item < value)
    equal = sum(1 for item in values if item == value)
    return (below + equal * 0.5) / len(values) * 100.0


def percentile_rank_sorted(sorted_values: list[float], value: float) -> float:
    if not sorted_values:
        return 0.0
    below = bisect_left(sorted_values, value)
    equal = bisect_right(sorted_values, value) - below
    return (below + equal * 0.5) / len(sorted_values) * 100.0


def median_sorted(sorted_values: list[float]) -> float:
    middle = len(sorted_values) // 2
    if len(sorted_values) % 2:
        return sorted_values[middle]
    return (sorted_values[middle - 1] + sorted_values[middle]) / 2


def soft_activity_gate(value: float, low: float, strong: float) -> float:
    if strong <= low:
        return 100.0 if value > low else 0.0
    return clamp((value - low) / (strong - low) * 100.0)
