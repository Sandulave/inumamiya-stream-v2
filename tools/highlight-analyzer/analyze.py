from __future__ import annotations

import argparse
import csv
from dataclasses import asdict
import json
from pathlib import Path
import shutil
import sys
import time

from models import AnalyzerConfig, EnhancedHighlightEvent, EventHighlightEvent, HighlightEvent, MomentCandidate, Roi, SampleMetrics
from scoring import (
    compute_audio_scores,
    compute_enhanced_highlight_scores,
    compute_event_highlight_scores,
    compute_highlight_scores,
    compute_observation_scores,
    compute_raw_score_statistics,
    compute_score_statistics,
    merge_enhanced_peaks,
    merge_event_peaks,
    merge_moment_candidates,
    merge_peaks,
)


class UserFacingError(RuntimeError):
    pass


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    try:
        if sys.version_info < (3, 11):
            raise UserFacingError("Python 3.11以上で実行してください。")
        if shutil.which("ffmpeg") is None:
            raise UserFacingError("FFmpegがPATHにありません。FFmpegをインストールしてPATHへ追加してください。")

        input_path = Path(args.input).expanduser()
        if not input_path.exists():
            raise UserFacingError(f"動画ファイルが存在しません: {input_path}")

        config_path = Path(args.config)
        config = AnalyzerConfig.load(config_path)
        apply_cli_overrides(config, args)

        video_info = get_video_info(input_path)
        if args.select_roi:
            roi_time_seconds = parse_roi_time(args.roi_time) if args.roi_time else None
            if roi_time_seconds is not None and roi_time_seconds >= video_info["duration"]:
                raise UserFacingError(
                    f"--roi-time が動画時間を超えています: {args.roi_time} / 動画長 {format_timestamp(video_info['duration'])}"
                )
            config.chat_roi = select_roi(
                input_path,
                video_info["width"],
                video_info["height"],
                video_info["duration"],
                roi_time_seconds,
            )
            config.save(config_path)
            print(f"ROI設定を保存しました: {config_path}")

        if config.chat_roi is None:
            raise UserFacingError(
                "ROI設定がありません。先に `python analyze.py --input \"...\" --select-roi` を実行してください。"
            )
        config.chat_roi.validate()

        output_dir = Path(args.output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)

        samples = analyze_video(input_path, config, video_info)
        if args.chat_json:
            attach_chat_json(args.chat_json, samples, config.sample_interval_seconds, args.vod_offset)
        attach_audio(input_path, config, video_info["duration"], samples)
        compute_audio_scores(samples, config.baseline_window_seconds)
        compute_highlight_scores(samples, config.highlight_weights)
        compute_enhanced_highlight_scores(samples, config.enhanced_highlight_weights)
        compute_event_highlight_scores(
            samples,
            config.event_highlight_weights,
            config.chat_event_window_before_seconds,
            config.chat_event_window_after_seconds,
            config.scene_change_penalty_multiplier,
        )
        compute_observation_scores(samples)
        score_statistics = compute_score_statistics(samples)
        raw_score_statistics = compute_raw_score_statistics(samples)
        highlights = merge_peaks(samples, config.merge_window_seconds, config.top_n)
        enhanced_highlights = merge_enhanced_peaks(samples, config.merge_window_seconds, config.top_n)
        event_highlights = merge_event_peaks(samples, config.merge_window_seconds, config.top_n, config.playback_preroll_seconds)
        moment_candidates = merge_moment_candidates(
            samples,
            config.merge_window_seconds,
            config.max_audio_candidates,
            config.max_chat_candidates,
            config.min_audio_candidate_score,
            config.min_chat_candidate_score,
            config.playback_preroll_seconds,
        )

        write_timeline_csv(output_dir / "timeline.csv", samples)
        write_highlights_json(
            output_dir / "highlights.json",
            input_path,
            video_info["duration"],
            config.sample_interval_seconds,
            highlights,
            enhanced_highlights,
            event_highlights,
            moment_candidates,
            score_statistics,
            raw_score_statistics,
            args.chat_json,
            args.vod_offset,
            args.vod_id,
        )
        write_timeline_png(output_dir / "timeline.png", samples, highlights, enhanced_highlights, event_highlights)
        print_highlights(highlights)
        print_enhanced_highlights(enhanced_highlights)
        print_event_highlights(event_highlights)
        print_moment_candidates(moment_candidates)
        print_score_statistics(score_statistics)
        print(f"\n出力しました: {output_dir / 'timeline.csv'}, {output_dir / 'highlights.json'}, {output_dir / 'timeline.png'}")
        return 0
    except (UserFacingError, RuntimeError, ValueError, OSError, json.JSONDecodeError) as exc:
        print(f"エラー: {exc}", file=sys.stderr)
        return 1


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Twitchアーカイブの盛り上がり候補をローカル解析します。")
    parser.add_argument("--input", required=True, help="解析するローカル動画ファイル")
    parser.add_argument("--config", default="config.json", help="ROIや重みを保存するJSON設定ファイル")
    parser.add_argument("--output-dir", default="output", help="CSV/JSON/PNGの出力ディレクトリ")
    parser.add_argument("--select-roi", action="store_true", help="OpenCVウィンドウでチャット欄ROIを選択して保存します")
    parser.add_argument("--roi-time", help="ROI選択に使う動画時刻（HH:MM:SS）。--select-roiと一緒に使います")
    parser.add_argument("--chat-json", help="TwitchDownloaderのChat Download(JSON)で保存したJSONファイル")
    parser.add_argument("--vod-offset", type=float, default=0.0, help="動画先頭がVOD全体の何秒地点か。デフォルトは0")
    parser.add_argument("--vod-id", help="将来Clip照合に使うTwitch VOD ID。指定時はJSON rootへ保存します")
    parser.add_argument("--sample-interval", type=float, help="解析サンプル間隔（秒）。デフォルトは設定または1.0")
    parser.add_argument("--baseline-window", type=float, help="音量急上昇検出の直前基準時間（秒）")
    parser.add_argument("--merge-window", type=float, help="近接peakを同一イベント扱いにする時間（秒）")
    parser.add_argument("--top", type=int, help="抽出する候補数")
    return parser


def apply_cli_overrides(config: AnalyzerConfig, args: argparse.Namespace) -> None:
    if args.sample_interval is not None:
        config.sample_interval_seconds = args.sample_interval
    if args.baseline_window is not None:
        config.baseline_window_seconds = args.baseline_window
    if args.merge_window is not None:
        config.merge_window_seconds = args.merge_window
    if args.top is not None:
        config.top_n = args.top
    if args.vod_offset < 0:
        raise UserFacingError("--vod-offsetは0以上の秒数を指定してください。")
    if config.sample_interval_seconds <= 0:
        raise UserFacingError("--sample-intervalは0より大きい値を指定してください。")
    if config.baseline_window_seconds <= 0:
        raise UserFacingError("--baseline-windowは0より大きい値を指定してください。")
    if config.merge_window_seconds < 0:
        raise UserFacingError("--merge-windowは0以上の値を指定してください。")
    if config.top_n <= 0:
        raise UserFacingError("--topは1以上の値を指定してください。")
    if config.chat_event_window_before_seconds < 0 or config.chat_event_window_after_seconds < 0:
        raise UserFacingError("chat event windowは0以上の秒数を指定してください。")
    if config.scene_change_penalty_multiplier < 0:
        raise UserFacingError("scene_change_penalty_multiplierは0以上の値を指定してください。")
    if config.playback_preroll_seconds < 0:
        raise UserFacingError("playback_preroll_secondsは0以上の値を指定してください。")
    if config.max_audio_candidates <= 0 or config.max_chat_candidates <= 0:
        raise UserFacingError("max_*_candidatesは1以上の値を指定してください。")
    if config.min_audio_candidate_score < 0 or config.min_chat_candidate_score < 0:
        raise UserFacingError("min_*_candidate_scoreは0以上の値を指定してください。")


def get_video_info(input_path: Path) -> dict[str, float | int]:
    import cv2

    capture = cv2.VideoCapture(str(input_path))
    if not capture.isOpened():
        raise UserFacingError(f"動画をOpenCVで開けません: {input_path}")
    try:
        fps = float(capture.get(cv2.CAP_PROP_FPS))
        frame_count = float(capture.get(cv2.CAP_PROP_FRAME_COUNT))
        width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
        if fps <= 0 or frame_count <= 0:
            raise UserFacingError("動画duration取得に失敗しました。FPSまたはフレーム数を取得できません。")
        duration = frame_count / fps
        if width <= 0 or height <= 0:
            raise UserFacingError("動画サイズ取得に失敗しました。")
        return {"fps": fps, "frame_count": frame_count, "duration": duration, "width": width, "height": height}
    finally:
        capture.release()


def select_roi(
    input_path: Path,
    frame_width: int,
    frame_height: int,
    duration_seconds: float,
    roi_time_seconds: float | None = None,
) -> Roi:
    import cv2

    capture = cv2.VideoCapture(str(input_path))
    if not capture.isOpened():
        raise UserFacingError(f"動画をOpenCVで開けません: {input_path}")
    try:
        seek_seconds = roi_time_seconds if roi_time_seconds is not None else min(duration_seconds * 0.1, 60.0)
        capture.set(cv2.CAP_PROP_POS_MSEC, seek_seconds * 1000.0)
        ok, frame = capture.read()
        if not ok:
            capture.set(cv2.CAP_PROP_POS_MSEC, 0)
            ok, frame = capture.read()
        if not ok:
            raise UserFacingError("ROI選択用の代表フレームを読み取れません。")
        rect = cv2.selectROI("Select chat ROI, then press Enter/Space", frame, showCrosshair=True, fromCenter=False)
        cv2.destroyAllWindows()
        x, y, width, height = rect
        if width <= 0 or height <= 0:
            raise UserFacingError("ROIが選択されませんでした。")
        return Roi(x / frame_width, y / frame_height, width / frame_width, height / frame_height)
    finally:
        capture.release()


def analyze_video(input_path: Path, config: AnalyzerConfig, video_info: dict[str, float | int]) -> list[SampleMetrics]:
    import cv2

    from chat_motion import chat_motion_ratio, preprocess_chat_frame
    from scoring import normalize_to_100

    duration = float(video_info["duration"])
    interval = config.sample_interval_seconds
    timestamps = []
    current = 0.0
    while current < duration:
        timestamps.append(current)
        current += interval

    print("Analyzing video...")
    capture = cv2.VideoCapture(str(input_path))
    if not capture.isOpened():
        raise UserFacingError(f"動画をOpenCVで開けません: {input_path}")

    samples: list[SampleMetrics] = []
    previous_chat = None
    raw_motion: list[float] = []
    last_progress = 0.0
    try:
        for timestamp_seconds in timestamps:
            capture.set(cv2.CAP_PROP_POS_MSEC, timestamp_seconds * 1000.0)
            ok, frame = capture.read()
            if not ok:
                break
            current_chat = preprocess_chat_frame(frame, config.chat_roi)
            motion = chat_motion_ratio(previous_chat, current_chat)
            previous_chat = current_chat
            raw_motion.append(motion)
            samples.append(
                SampleMetrics(
                    timestamp_seconds=timestamp_seconds,
                    timestamp=format_timestamp(timestamp_seconds),
                    chat_motion_raw=motion,
                )
            )
            now = time.monotonic()
            if now - last_progress >= 10.0:
                print_progress(timestamp_seconds, duration)
                last_progress = now
    finally:
        capture.release()

    chat_scores = normalize_to_100(raw_motion)
    for sample, score in zip(samples, chat_scores):
        sample.chat_score = score
    print_progress(samples[-1].timestamp_seconds if samples else 0.0, duration)
    return samples


def attach_audio(input_path: Path, config: AnalyzerConfig, duration_seconds: float, samples: list[SampleMetrics]) -> None:
    from audio_analysis import analyze_audio_db

    print("Analyzing audio...")
    db_values = analyze_audio_db(input_path, duration_seconds, config.sample_interval_seconds)
    for sample, audio_db in zip(samples, db_values):
        sample.audio_db = audio_db


def attach_chat_json(
    chat_json_path: str,
    samples: list[SampleMetrics],
    sample_interval_seconds: float,
    vod_offset_seconds: float,
) -> None:
    from chat_json import attach_chat_json_metrics, load_twitch_downloader_comments

    print("Analyzing Twitch chat JSON...")
    comments = load_twitch_downloader_comments(Path(chat_json_path).expanduser())
    attach_chat_json_metrics(samples, comments, sample_interval_seconds, vod_offset_seconds)


def write_timeline_csv(path: Path, samples: list[SampleMetrics]) -> None:
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=[
                "timestamp_seconds",
                "timestamp",
                "chat_motion_raw",
                "chat_motion_score",
                "audio_score",
                "audio_raw_score",
                "chat_score",
                "chat_raw_score",
                "chat_message_count",
                "chat_message_count_5s",
                "chat_message_count_10s",
                "chat_message_count_30s",
                "chat_message_rate",
                "chat_activity_percentile_score",
                "chat_local_burst_score",
                "chat_json_score",
                "audio_db",
                "audio_delta",
                "audio_level_score",
                "audio_spike_score",
                "highlight_score",
                "enhanced_highlight_score",
                "possible_scene_change",
                "event_chat_score",
                "event_chat_peak_offset_seconds",
                "event_highlight_score",
                "scene_change_penalty_applied",
            ],
        )
        writer.writeheader()
        for sample in samples:
            data = asdict(sample)
            row = {
                **data,
                "chat_score": sample.observation_chat_score,
                "audio_score": sample.audio_score,
            }
            writer.writerow({key: round(row[key], 3) if isinstance(row[key], float) else row[key] for key in writer.fieldnames})


def write_highlights_json(
    path: Path,
    input_path: Path,
    duration_seconds: float,
    sample_interval_seconds: float,
    highlights: list[HighlightEvent],
    enhanced_highlights: list[EnhancedHighlightEvent],
    event_highlights: list[EventHighlightEvent],
    moment_candidates: list[MomentCandidate],
    score_statistics: dict[str, dict[str, float]],
    raw_score_statistics: dict[str, dict[str, float]],
    chat_json_path: str | None,
    vod_offset_seconds: float,
    vod_id: str | None,
) -> None:
    payload = {
        "source": input_path.name,
        "durationSeconds": round(duration_seconds, 3),
        "sampleIntervalSeconds": sample_interval_seconds,
        "chatJsonSource": Path(chat_json_path).name if chat_json_path else None,
        "vodOffsetSeconds": vod_offset_seconds,
        "scoreStatistics": {
            signal: {key: round(value, 3) for key, value in stats.items()}
            for signal, stats in score_statistics.items()
        },
        "rawScoreStatistics": {
            signal: {key: round(value, 3) for key, value in stats.items()}
            for signal, stats in raw_score_statistics.items()
        },
        "momentCandidates": [
            {
                "timestampSeconds": round(item.timestamp_seconds, 3),
                "timestamp": item.timestamp,
                "playbackStartSeconds": round(item.playback_start_seconds, 3),
                "playbackStartTimestamp": item.playback_start_timestamp,
                "audioScore": round(item.audio_score, 3),
                "audioRawScore": round(item.audio_raw_score, 3),
                "chatScore": round(item.chat_score, 3),
                "chatRawScore": round(item.chat_raw_score, 3),
                "audioPeakTimestampSeconds": round(item.audio_peak_timestamp_seconds, 3) if item.audio_peak_timestamp_seconds is not None else None,
                "audioPeakTimestamp": item.audio_peak_timestamp,
                "chatPeakTimestampSeconds": round(item.chat_peak_timestamp_seconds, 3) if item.chat_peak_timestamp_seconds is not None else None,
                "chatPeakTimestamp": item.chat_peak_timestamp,
                "audioSpikeScore": round(item.audio_spike_score, 3),
                "audioLevelScore": round(item.audio_level_score, 3),
                "audioDb": round(item.audio_db, 3),
                "audioDelta": round(item.audio_delta, 3),
                "chatJsonScore": round(item.chat_json_score, 3),
                "eventChatScore": round(item.event_chat_score, 3),
                "chatActivityPercentileScore": round(item.chat_activity_percentile_score, 3),
                "chatLocalBurstScore": round(item.chat_local_burst_score, 3),
                "chatMessageCount10s": item.chat_message_count_10s,
                "chatMessageCount30s": item.chat_message_count_30s,
                "eventChatPeakOffsetSeconds": round(item.event_chat_peak_offset_seconds, 3),
                "possibleSceneChange": item.possible_scene_change,
                "eventHighlightScore": round(item.event_highlight_score, 3),
            }
            for item in moment_candidates
        ],
        "highlights": [
            {
                "timestampSeconds": round(item.timestamp_seconds, 3),
                "timestamp": item.timestamp,
                "score": round(item.score, 3),
                "chatScore": round(item.chat_score, 3),
                "audioSpikeScore": round(item.audio_spike_score, 3),
                "audioLevelScore": round(item.audio_level_score, 3),
                "audioDb": round(item.audio_db, 3),
                "audioDelta": round(item.audio_delta, 3),
            }
            for item in highlights
        ],
        "enhancedHighlights": [
            {
                "timestampSeconds": round(item.timestamp_seconds, 3),
                "timestamp": item.timestamp,
                "enhancedScore": round(item.enhanced_score, 3),
                "chatJsonScore": round(item.chat_json_score, 3),
                "chatMotionScore": round(item.chat_motion_score, 3),
                "audioSpikeScore": round(item.audio_spike_score, 3),
                "audioLevelScore": round(item.audio_level_score, 3),
                "chatMessageCount": item.chat_message_count,
                "chatMessageCount10s": item.chat_message_count_10s,
                "chatMessageCount30s": item.chat_message_count_30s,
                "chatMessageRate": round(item.chat_message_rate, 3),
                "chatActivityPercentileScore": round(item.chat_activity_percentile_score, 3),
                "chatLocalBurstScore": round(item.chat_local_burst_score, 3),
                "possibleSceneChange": item.possible_scene_change,
            }
            for item in enhanced_highlights
        ],
        "eventHighlights": [
            {
                "timestampSeconds": round(item.timestamp_seconds, 3),
                "timestamp": item.timestamp,
                "playbackStartSeconds": round(item.playback_start_seconds, 3),
                "playbackStartTimestamp": item.playback_start_timestamp,
                "eventHighlightScore": round(item.event_highlight_score, 3),
                "eventChatScore": round(item.event_chat_score, 3),
                "eventChatPeakOffsetSeconds": round(item.event_chat_peak_offset_seconds, 3),
                "chatJsonScore": round(item.chat_json_score, 3),
                "chatMessageCount10s": item.chat_message_count_10s,
                "chatMessageCount30s": item.chat_message_count_30s,
                "audioSpikeScore": round(item.audio_spike_score, 3),
                "audioLevelScore": round(item.audio_level_score, 3),
                "chatMotionScore": round(item.chat_motion_score, 3),
                "possibleSceneChange": item.possible_scene_change,
                "sceneChangePenaltyApplied": item.scene_change_penalty_applied,
            }
            for item in event_highlights
        ],
    }
    if vod_id is not None:
        payload["vodId"] = vod_id
    with path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
        f.write("\n")


def write_timeline_png(
    path: Path,
    samples: list[SampleMetrics],
    highlights: list[HighlightEvent],
    enhanced_highlights: list[EnhancedHighlightEvent],
    event_highlights: list[EventHighlightEvent],
) -> None:
    import matplotlib.pyplot as plt

    if not samples:
        return
    times = [sample.timestamp_seconds / 60.0 for sample in samples]
    plt.figure(figsize=(14, 6))
    plt.plot(times, [sample.chat_json_score for sample in samples], label="chat JSON score", linewidth=1.2)
    plt.plot(times, [sample.event_chat_score for sample in samples], label="event chat score", linewidth=1.2)
    plt.plot(times, [sample.audio_spike_score for sample in samples], label="audio spike score", linewidth=1.2)
    plt.plot(times, [sample.event_highlight_score for sample in samples], label="event highlight score", linewidth=1.6)
    for highlight in highlights:
        plt.axvline(highlight.timestamp_seconds / 60.0, color="red", alpha=0.25, linewidth=1)
    for highlight in enhanced_highlights:
        plt.axvline(highlight.timestamp_seconds / 60.0, color="purple", alpha=0.18, linewidth=1)
    for highlight in event_highlights:
        plt.axvline(highlight.timestamp_seconds / 60.0, color="green", alpha=0.25, linewidth=1)
    plt.ylim(0, 100)
    plt.xlabel("time (minutes)")
    plt.ylabel("score")
    plt.title("Highlight analysis timeline")
    plt.legend()
    plt.grid(True, alpha=0.25)
    plt.tight_layout()
    plt.savefig(path, dpi=150)
    plt.close()


def print_highlights(highlights: list[HighlightEvent]) -> None:
    print("\nLegacy score candidates TOP")
    if not highlights:
        print("候補が見つかりませんでした。")
        return
    for index, highlight in enumerate(highlights, start=1):
        print(f"{index}. {highlight.timestamp}")
        print(f"   score: {highlight.score:.1f}")
        print(f"   chat: {highlight.chat_score:.1f}")
        print(f"   audio spike: {highlight.audio_spike_score:.1f}")
        print(f"   audio level: {highlight.audio_level_score:.1f}")
        print(f"   audio db: {highlight.audio_db:.1f}")
        print(f"   audio delta: {highlight.audio_delta:+.1f}")


def print_enhanced_highlights(highlights: list[EnhancedHighlightEvent]) -> None:
    print("\nEnhanced score candidates TOP")
    if not highlights:
        print("候補が見つかりませんでした。")
        return
    for index, highlight in enumerate(highlights, start=1):
        scene_note = " scene-change?" if highlight.possible_scene_change else ""
        print(f"{index}. {highlight.timestamp}{scene_note}")
        print(f"   enhanced score: {highlight.enhanced_score:.1f}")
        print(f"   chat JSON: {highlight.chat_json_score:.1f}")
        print(f"   chat motion: {highlight.chat_motion_score:.1f}")
        print(f"   audio spike: {highlight.audio_spike_score:.1f}")
        print(f"   chat count 10s: {highlight.chat_message_count_10s}")


def print_event_highlights(highlights: list[EventHighlightEvent]) -> None:
    print("\nEvent score candidates TOP10")
    if not highlights:
        print("候補が見つかりませんでした。")
        return
    for index, highlight in enumerate(highlights, start=1):
        penalty_note = " penalty" if highlight.scene_change_penalty_applied else ""
        print(f"{index}. {highlight.timestamp}{penalty_note}")
        print(f"   event score: {highlight.event_highlight_score:.1f}")
        print(f"   chat event: {highlight.event_chat_score:.1f}")
        print(f"   audio spike: {highlight.audio_spike_score:.1f}")
        print(f"   chat peak offset: {highlight.event_chat_peak_offset_seconds:+.0f}s")
        print(f"   playback start: {highlight.playback_start_timestamp}")


def print_moment_candidates(moments: list[MomentCandidate]) -> None:
    print("\nMoment Candidates")
    if not moments:
        print("候補が見つかりませんでした。")
        return
    for moment in moments[:10]:
        print(moment.timestamp)
        print(f"   Audio score: {moment.audio_score:.1f}")
        print(f"   Audio raw  : {moment.audio_raw_score:.1f}")
        print(f"   Chat score : {moment.chat_score:.1f}")
        print(f"   Chat raw   : {moment.chat_raw_score:.1f}")
        print(f"   Playback   : {moment.playback_start_timestamp}")


def print_score_statistics(score_statistics: dict[str, dict[str, float]]) -> None:
    print("\nScore statistics")
    for signal, stats in score_statistics.items():
        values = ", ".join(f"{key}={value:.1f}" for key, value in stats.items())
        print(f"   {signal}: {values}")


def print_progress(current_seconds: float, duration_seconds: float) -> None:
    percent = current_seconds / duration_seconds * 100.0 if duration_seconds else 0.0
    print(f"{format_timestamp(current_seconds)} / {format_timestamp(duration_seconds)} ({percent:.1f}%)")


def format_timestamp(seconds: float) -> str:
    total_seconds = int(round(seconds))
    hours = total_seconds // 3600
    minutes = (total_seconds % 3600) // 60
    secs = total_seconds % 60
    return f"{hours:02d}:{minutes:02d}:{secs:02d}"


def parse_roi_time(value: str) -> float:
    parts = value.split(":")
    if len(parts) != 3:
        raise UserFacingError("--roi-time は HH:MM:SS 形式で指定してください。例: --roi-time 00:10:00")
    try:
        hours, minutes, seconds = [int(part) for part in parts]
    except ValueError as exc:
        raise UserFacingError("--roi-time は HH:MM:SS 形式で指定してください。例: --roi-time 00:10:00") from exc
    if hours < 0 or minutes < 0 or seconds < 0 or minutes >= 60 or seconds >= 60:
        raise UserFacingError("--roi-time は HH:MM:SS 形式で指定してください。分と秒は00〜59です。")
    return float(hours * 3600 + minutes * 60 + seconds)


if __name__ == "__main__":
    raise SystemExit(main())
