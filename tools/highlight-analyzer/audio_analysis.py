from __future__ import annotations

from pathlib import Path
import math
import subprocess

import numpy as np


class AudioAnalysisError(RuntimeError):
    pass


def analyze_audio_db(
    input_path: Path,
    duration_seconds: float,
    sample_interval_seconds: float,
    sample_rate: int = 16000,
) -> list[float]:
    command = [
        "ffmpeg",
        "-v",
        "error",
        "-i",
        str(input_path),
        "-vn",
        "-ac",
        "1",
        "-ar",
        str(sample_rate),
        "-f",
        "s16le",
        "pipe:1",
    ]
    process = subprocess.Popen(
        command,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    if process.stdout is None:
        raise AudioAnalysisError("FFmpegの音声読み取りに失敗しました。")

    samples_per_chunk = max(1, int(round(sample_rate * sample_interval_seconds)))
    bytes_per_chunk = samples_per_chunk * 2
    expected_chunks = max(1, int(math.ceil(duration_seconds / sample_interval_seconds)))
    db_values: list[float] = []

    try:
        for _ in range(expected_chunks):
            chunk = process.stdout.read(bytes_per_chunk)
            if not chunk:
                break
            db_values.append(_pcm16_chunk_to_db(chunk))
    finally:
        if process.stdout:
            process.stdout.close()
        stderr = process.stderr.read().decode("utf-8", errors="replace") if process.stderr else ""
        process.wait()

    if not db_values:
        message = stderr.strip() or "音声データを読み取れませんでした。音声トラックが存在しない可能性があります。"
        raise AudioAnalysisError(f"音声解析に失敗しました: {message}")

    while len(db_values) < expected_chunks:
        db_values.append(-100.0)
    return db_values[:expected_chunks]


def _pcm16_chunk_to_db(chunk: bytes) -> float:
    if len(chunk) < 2:
        return -100.0
    audio = np.frombuffer(chunk, dtype=np.int16).astype(np.float32)
    if audio.size == 0:
        return -100.0
    normalized = audio / 32768.0
    rms = float(np.sqrt(np.mean(np.square(normalized))))
    if not np.isfinite(rms) or rms <= 0.0:
        return -100.0
    return max(-100.0, 20.0 * math.log10(rms))
