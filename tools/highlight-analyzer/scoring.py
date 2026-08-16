from __future__ import annotations
from statistics import median

from models import EnhancedHighlightEvent, EventHighlightEvent, HighlightEvent, MomentCandidate, SampleMetrics


def clamp(value: float, low: float = 0.0, high: float = 100.0) -> float:
    return max(low, min(high, value))


def normalize_to_100(values: list[float]) -> list[float]:
    if not values:
        return []
    finite = [float(value) for value in values if value == value]
    if not finite:
        return [0.0 for _ in values]
    low = percentile(finite, 5)
    high = percentile(finite, 95)
    if high <= low:
        return [0.0 for _ in values]
    return [clamp((float(v) - low) / (high - low) * 100.0) for v in values]


def percentile(values: list[float], percent: float) -> float:
    ordered = sorted(values)
    if len(ordered) == 1:
        return ordered[0]
    position = (len(ordered) - 1) * percent / 100.0
    lower = int(position)
    upper = min(lower + 1, len(ordered) - 1)
    fraction = position - lower
    return ordered[lower] * (1.0 - fraction) + ordered[upper] * fraction


def normalize_against_max(value: float, max_value: float) -> float:
    if value <= 0.0 or max_value <= 0.0:
        return 0.0
    return clamp(value / max_value * 100.0)


def compute_audio_scores(samples: list[SampleMetrics], baseline_window_seconds: float) -> None:
    audio_values = [sample.audio_db for sample in samples]
    level_scores = normalize_to_100(audio_values)
    for sample, score in zip(samples, level_scores):
        sample.audio_level_score = score

    for idx, sample in enumerate(samples):
        start_time = sample.timestamp_seconds - baseline_window_seconds
        baseline_values = [
            previous.audio_db
            for previous in samples[:idx]
            if previous.timestamp_seconds >= start_time and previous.audio_db > -99.0
        ]
        if not baseline_values:
            sample.audio_delta = 0.0
            sample.audio_spike_score = 0.0
            continue
        baseline = median(baseline_values)
        sample.audio_delta = sample.audio_db - baseline
        sample.audio_spike_score = clamp(sample.audio_delta / 18.0 * 100.0)


def compute_highlight_scores(samples: list[SampleMetrics], weights: dict[str, float]) -> None:
    total = weights["chat"] + weights["audio_spike"] + weights["audio_level"]
    chat_w = weights["chat"] / total
    spike_w = weights["audio_spike"] / total
    level_w = weights["audio_level"] / total
    for sample in samples:
        sample.chat_motion_score = sample.chat_score
        sample.highlight_score = clamp(
            sample.chat_score * chat_w
            + sample.audio_spike_score * spike_w
            + sample.audio_level_score * level_w
        )


def compute_enhanced_highlight_scores(samples: list[SampleMetrics], weights: dict[str, float]) -> None:
    total = weights["chat_json"] + weights["audio_spike"] + weights["chat_motion"] + weights["audio_level"]
    chat_json_w = weights["chat_json"] / total
    spike_w = weights["audio_spike"] / total
    motion_w = weights["chat_motion"] / total
    level_w = weights["audio_level"] / total
    for sample in samples:
        sample.enhanced_highlight_score = clamp(
            sample.chat_json_score * chat_json_w
            + sample.audio_spike_score * spike_w
            + sample.chat_motion_score * motion_w
            + sample.audio_level_score * level_w
        )
        sample.possible_scene_change = sample.chat_motion_score >= 85.0 and sample.chat_json_score <= 20.0


def merge_peaks(
    samples: list[SampleMetrics],
    merge_window_seconds: float,
    top_n: int,
    min_score: float = 1.0,
) -> list[HighlightEvent]:
    candidates = [sample for sample in samples if sample.highlight_score >= min_score]
    candidates.sort(key=lambda sample: sample.highlight_score, reverse=True)

    selected: list[SampleMetrics] = []
    for candidate in candidates:
        if all(
            abs(candidate.timestamp_seconds - existing.timestamp_seconds) > merge_window_seconds
            for existing in selected
        ):
            selected.append(candidate)
        if len(selected) >= top_n:
            break

    selected.sort(key=lambda sample: sample.highlight_score, reverse=True)
    return [
        HighlightEvent(
            timestamp_seconds=sample.timestamp_seconds,
            timestamp=sample.timestamp,
            score=sample.highlight_score,
            chat_score=sample.chat_score,
            audio_spike_score=sample.audio_spike_score,
            audio_level_score=sample.audio_level_score,
            audio_db=sample.audio_db,
            audio_delta=sample.audio_delta,
        )
        for sample in selected
    ]


def merge_enhanced_peaks(
    samples: list[SampleMetrics],
    merge_window_seconds: float,
    top_n: int,
    min_score: float = 1.0,
) -> list[EnhancedHighlightEvent]:
    candidates = [sample for sample in samples if sample.enhanced_highlight_score >= min_score]
    candidates.sort(key=lambda sample: sample.enhanced_highlight_score, reverse=True)

    selected: list[SampleMetrics] = []
    for candidate in candidates:
        if all(
            abs(candidate.timestamp_seconds - existing.timestamp_seconds) > merge_window_seconds
            for existing in selected
        ):
            selected.append(candidate)
        if len(selected) >= top_n:
            break

    selected.sort(key=lambda sample: sample.enhanced_highlight_score, reverse=True)
    return [
        EnhancedHighlightEvent(
            timestamp_seconds=sample.timestamp_seconds,
            timestamp=sample.timestamp,
            enhanced_score=sample.enhanced_highlight_score,
            chat_json_score=sample.chat_json_score,
            chat_motion_score=sample.chat_motion_score,
            audio_spike_score=sample.audio_spike_score,
            audio_level_score=sample.audio_level_score,
            chat_message_count=sample.chat_message_count,
            chat_message_count_10s=sample.chat_message_count_10s,
            chat_message_count_30s=sample.chat_message_count_30s,
            chat_message_rate=sample.chat_message_rate,
            chat_activity_percentile_score=sample.chat_activity_percentile_score,
            chat_local_burst_score=sample.chat_local_burst_score,
            possible_scene_change=sample.possible_scene_change,
        )
        for sample in selected
    ]


def compute_event_highlight_scores(
    samples: list[SampleMetrics],
    weights: dict[str, float],
    chat_window_before_seconds: float,
    chat_window_after_seconds: float,
    scene_change_penalty_multiplier: float,
) -> None:
    total = weights["event_chat"] + weights["audio_spike"] + weights["audio_level"]
    chat_w = weights["event_chat"] / total
    spike_w = weights["audio_spike"] / total
    level_w = weights["audio_level"] / total

    for sample in samples:
        chat_peak = find_event_chat_peak(
            samples,
            sample.timestamp_seconds,
            chat_window_before_seconds,
            chat_window_after_seconds,
        )
        sample.event_chat_score = chat_peak.chat_json_score
        sample.event_chat_peak_offset_seconds = chat_peak.timestamp_seconds - sample.timestamp_seconds
        sample.possible_scene_change = sample.chat_motion_score >= 85.0 and sample.event_chat_score < 20.0

        score = clamp(
            sample.event_chat_score * chat_w
            + sample.audio_spike_score * spike_w
            + sample.audio_level_score * level_w
        )
        sample.scene_change_penalty_applied = sample.possible_scene_change and sample.event_chat_score < 20.0
        if sample.scene_change_penalty_applied:
            score = clamp(score * scene_change_penalty_multiplier)
        sample.event_highlight_score = score


def find_event_chat_peak(
    samples: list[SampleMetrics],
    timestamp_seconds: float,
    before_seconds: float,
    after_seconds: float,
) -> SampleMetrics:
    window_start = timestamp_seconds - before_seconds
    window_end = timestamp_seconds + after_seconds
    candidates = [
        sample
        for sample in samples
        if window_start <= sample.timestamp_seconds <= window_end
    ]
    if not candidates:
        return min(samples, key=lambda sample: abs(sample.timestamp_seconds - timestamp_seconds))
    return max(
        candidates,
        key=lambda sample: (
            sample.chat_json_score,
            sample.chat_message_count_30s,
            -abs(sample.timestamp_seconds - timestamp_seconds),
        ),
    )


def merge_event_peaks(
    samples: list[SampleMetrics],
    merge_window_seconds: float,
    top_n: int,
    playback_preroll_seconds: float,
    min_score: float = 1.0,
) -> list[EventHighlightEvent]:
    candidates = [
        sample
        for sample in samples
        if sample.event_highlight_score >= min_score
        and (sample.chat_json_score >= min_score or sample.audio_spike_score >= min_score)
    ]
    candidates.sort(
        key=lambda sample: (
            sample.event_highlight_score,
            sample.chat_json_score,
            sample.audio_spike_score,
        ),
        reverse=True,
    )

    selected: list[SampleMetrics] = []
    for candidate in candidates:
        if all(
            abs(candidate.timestamp_seconds - existing.timestamp_seconds) > merge_window_seconds
            for existing in selected
        ):
            selected.append(candidate)
        if len(selected) >= top_n:
            break

    selected.sort(key=lambda sample: sample.event_highlight_score, reverse=True)
    return [
        EventHighlightEvent(
            timestamp_seconds=sample.timestamp_seconds,
            timestamp=sample.timestamp,
            playback_start_seconds=max(0.0, sample.timestamp_seconds - playback_preroll_seconds),
            playback_start_timestamp=format_event_timestamp(max(0.0, sample.timestamp_seconds - playback_preroll_seconds)),
            event_highlight_score=sample.event_highlight_score,
            event_chat_score=sample.event_chat_score,
            event_chat_peak_offset_seconds=sample.event_chat_peak_offset_seconds,
            chat_json_score=sample.chat_json_score,
            chat_message_count_10s=sample.chat_message_count_10s,
            chat_message_count_30s=sample.chat_message_count_30s,
            audio_spike_score=sample.audio_spike_score,
            audio_level_score=sample.audio_level_score,
            chat_motion_score=sample.chat_motion_score,
            possible_scene_change=sample.possible_scene_change,
            scene_change_penalty_applied=sample.scene_change_penalty_applied,
        )
        for sample in selected
    ]


def compute_observation_scores(samples: list[SampleMetrics]) -> None:
    max_audio_delta = max((sample.audio_delta for sample in samples if sample.audio_delta > 0.0), default=0.0)
    max_event_chat_score = max((sample.event_chat_score for sample in samples if sample.event_chat_score > 0.0), default=0.0)
    for sample in samples:
        sample.audio_raw_score = sample.audio_spike_score
        sample.chat_raw_score = sample.event_chat_score
        sample.audio_score = normalize_against_max(sample.audio_delta, max_audio_delta)
        sample.observation_chat_score = normalize_against_max(sample.event_chat_score, max_event_chat_score)


def compute_score_statistics(samples: list[SampleMetrics]) -> dict[str, dict[str, float]]:
    return {
        "audio": score_statistics([sample.audio_score for sample in samples]),
        "chat": score_statistics([sample.observation_chat_score for sample in samples]),
    }


def compute_raw_score_statistics(samples: list[SampleMetrics]) -> dict[str, dict[str, float]]:
    return {
        "audioDelta": raw_score_statistics([sample.audio_delta for sample in samples if sample.audio_delta > 0.0]),
        "eventChatScore": raw_score_statistics([sample.event_chat_score for sample in samples if sample.event_chat_score > 0.0]),
    }


def score_statistics(values: list[float]) -> dict[str, float]:
    finite = [float(value) for value in values if value == value]
    if not finite:
        return {"p50": 0.0, "p70": 0.0, "p85": 0.0, "p95": 0.0, "max": 0.0}
    return {
        "p50": percentile(finite, 50),
        "p70": percentile(finite, 70),
        "p85": percentile(finite, 85),
        "p95": percentile(finite, 95),
        "max": max(finite),
    }


def raw_score_statistics(values: list[float]) -> dict[str, float]:
    finite = [float(value) for value in values if value == value]
    if not finite:
        return {"p50": 0.0, "p70": 0.0, "p85": 0.0, "p95": 0.0, "p99_5": 0.0, "max": 0.0}
    return {
        "p50": percentile(finite, 50),
        "p70": percentile(finite, 70),
        "p85": percentile(finite, 85),
        "p95": percentile(finite, 95),
        "p99_5": percentile(finite, 99.5),
        "max": max(finite),
    }


def merge_moment_candidates(
    samples: list[SampleMetrics],
    merge_window_seconds: float,
    max_audio_candidates: int,
    max_chat_candidates: int,
    min_audio_score: float,
    min_chat_score: float,
    playback_preroll_seconds: float,
) -> list[MomentCandidate]:
    audio_candidates = local_peak_candidates(
        samples,
        score_getter=lambda sample: sample.audio_score,
        min_score=min_audio_score,
        max_count=max_audio_candidates,
    )
    chat_candidates = local_peak_candidates(
        samples,
        score_getter=lambda sample: sample.observation_chat_score,
        min_score=min_chat_score,
        max_count=max_chat_candidates,
    )
    candidates = audio_candidates + [
        sample
        for sample in chat_candidates
        if sample not in audio_candidates
    ]
    candidates.sort(
        key=lambda sample: sample.timestamp_seconds,
    )

    groups: list[list[SampleMetrics]] = []
    for candidate in candidates:
        if not groups:
            groups.append([candidate])
            continue

        current_group = groups[-1]
        group_anchor_timestamp = current_group[0].timestamp_seconds
        if candidate.timestamp_seconds - group_anchor_timestamp <= merge_window_seconds:
            current_group.append(candidate)
        else:
            groups.append([candidate])

    moments = [moment_from_group(group, samples, playback_preroll_seconds) for group in groups]
    moments.sort(
        key=lambda moment: (
            max(moment.audio_score, moment.chat_score),
            moment.audio_score,
            moment.chat_score,
        ),
        reverse=True,
    )
    return moments


def local_peak_candidates(
    samples: list[SampleMetrics],
    score_getter,
    min_score: float,
    max_count: int,
) -> list[SampleMetrics]:
    peaks: list[SampleMetrics] = []
    for index, sample in enumerate(samples):
        score = score_getter(sample)
        if score < min_score:
            continue
        previous_score = score_getter(samples[index - 1]) if index > 0 else -1.0
        next_score = score_getter(samples[index + 1]) if index + 1 < len(samples) else -1.0
        if score >= previous_score and score >= next_score:
            peaks.append(sample)
    peaks.sort(key=score_getter, reverse=True)
    return peaks[:max_count]


def moment_from_group(
    group: list[SampleMetrics],
    samples: list[SampleMetrics],
    playback_preroll_seconds: float,
) -> MomentCandidate:
    start = min(sample.timestamp_seconds for sample in group)
    end = max(sample.timestamp_seconds for sample in group)
    window_samples = [
        sample
        for sample in samples
        if start <= sample.timestamp_seconds <= end
    ]
    audio_peak = max(window_samples, key=lambda sample: sample.audio_score)
    chat_peak = max(window_samples, key=lambda sample: sample.observation_chat_score)
    representative = max(
        window_samples,
        key=lambda sample: (
            max(sample.audio_score, sample.observation_chat_score),
            sample.event_highlight_score,
        ),
    )
    playback_start = max(0.0, representative.timestamp_seconds - playback_preroll_seconds)
    return MomentCandidate(
        timestamp_seconds=representative.timestamp_seconds,
        timestamp=representative.timestamp,
        playback_start_seconds=playback_start,
        playback_start_timestamp=format_event_timestamp(playback_start),
        audio_score=audio_peak.audio_score,
        audio_raw_score=audio_peak.audio_raw_score,
        chat_score=chat_peak.observation_chat_score,
        chat_raw_score=chat_peak.chat_raw_score,
        audio_peak_timestamp_seconds=audio_peak.timestamp_seconds if audio_peak.audio_score > 0 else None,
        audio_peak_timestamp=audio_peak.timestamp if audio_peak.audio_score > 0 else None,
        chat_peak_timestamp_seconds=chat_peak.timestamp_seconds if chat_peak.observation_chat_score > 0 else None,
        chat_peak_timestamp=chat_peak.timestamp if chat_peak.observation_chat_score > 0 else None,
        audio_spike_score=audio_peak.audio_spike_score,
        audio_level_score=audio_peak.audio_level_score,
        audio_db=audio_peak.audio_db,
        audio_delta=audio_peak.audio_delta,
        chat_json_score=chat_peak.chat_json_score,
        event_chat_score=chat_peak.event_chat_score,
        chat_activity_percentile_score=chat_peak.chat_activity_percentile_score,
        chat_local_burst_score=chat_peak.chat_local_burst_score,
        chat_message_count_10s=chat_peak.chat_message_count_10s,
        chat_message_count_30s=chat_peak.chat_message_count_30s,
        event_chat_peak_offset_seconds=representative.event_chat_peak_offset_seconds,
        possible_scene_change=representative.possible_scene_change,
        event_highlight_score=representative.event_highlight_score,
    )


def format_event_timestamp(seconds: float) -> str:
    total_seconds = int(round(seconds))
    hours = total_seconds // 3600
    minutes = (total_seconds % 3600) // 60
    secs = total_seconds % 60
    return f"{hours:02d}:{minutes:02d}:{secs:02d}"
