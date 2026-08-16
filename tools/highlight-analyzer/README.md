# Twitchアーカイブ解析エンジン

このツールは、Twitchアーカイブ動画とTwitchDownloaderのChat JSONから、音声・チャットのraw観測値と0〜100のscoreを出力するローカル解析エンジンです。

Pythonは「ここが面白い」「見どころ」「Clipあり」「★1〜5」を判断しません。Pythonのscoreは面白さの点数ではなく、そのVOD内で観測された音の変化やチャット反応の強さを表す数値です。

責務分担:

- Python: 動画解析、音声解析、Chat JSON解析、0〜100のscore生成、候補時刻抽出、raw値出力
- NestJS: scoreから★1〜5への変換、Twitch Clip取得とVOD紐付け、ソート、フィルター、UI向けレスポンス生成
- Next.js: ★表示、Clipあり表示、操作UI

今回はAI、OCR、Whisper、OpenAI API、Twitch API、Clip取得は使いません。

## 必要なもの

- Python 3.11以上
- FFmpegコマンド
- OpenCV
- NumPy
- matplotlib

FFmpegはPythonパッケージとして同梱しません。`ffmpeg` コマンドがPATHから実行できる状態にしてください。

## セットアップ

Windows PowerShellの例です。

```powershell
cd C:\dev\streamer-portal\tools\highlight-analyzer

python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

## ROI選択

動画内チャット欄の画面変化量も解析する場合、最初にROIを選択します。

```powershell
python analyze.py --input "C:\videos\test.mp4" --select-roi
python analyze.py --input "C:\videos\test.mp4" --select-roi --roi-time 00:10:00
```

`--roi-time` を指定すると、その時刻のフレームでROIを選択できます。選択結果は `config.json` に動画サイズ比率で保存されます。

## 解析実行

```powershell
python analyze.py --input "C:\videos\test.mp4"
```

TwitchDownloaderで保存したChat JSONがある場合:

```powershell
py analyze.py ^
  --input "C:\videos\test.mp4" ^
  --chat-json "C:\videos\chat.json"
```

VOD IDを保存したい場合:

```powershell
py analyze.py ^
  --input "C:\videos\archive.mp4" ^
  --chat-json "C:\videos\archive-chat.json" ^
  --vod-id "2845096588"
```

動画がVOD全体の途中から切り出されている場合は `--vod-offset` で動画先頭がVOD全体の何秒地点かを指定します。

## Scoreの意味

`audio_raw_score` は、解析内部で使っている元の音声scoreです。現時点では `audio_spike_score` と同じ値です。

`chat_raw_score` は、解析内部で使っている元のチャットscoreです。現時点では `event_chat_score` と同じ値です。

`audio_score` は、そのVOD内における急激な音量変化の強さを0〜100で表します。正規化には `audio_delta` の正の値を使い、そのVOD内で最大の `audio_delta` を100とします。

`chat_score` は、そのVOD内におけるチャット反応・加速の強さを0〜100で表します。正規化には `event_chat_score` の正の値を使い、そのVOD内で最大の `event_chat_score` を100とします。

正規化はVODごとの相対評価です。

```text
audio_score = audio_delta / maxAudioDelta * 100
chat_score  = event_chat_score / maxEventChatScore * 100
```

たとえば `audio_score = 100` は「この配信で最も強い音の変化」、`audio_score = 50` は「この配信最大の音変化strengthに対して約50%」という意味です。別VODの `audio_score = 100` と絶対的な強さが同じとは限りません。

どちらも面白さの点数ではありません。NestJS側で将来、これらのscoreや分布統計を使って★1〜5などのUI向け評価へ変換します。

## 候補抽出

Pythonは `momentCandidates` を出力します。これは「特徴が観測された時刻候補」であり、見どころ確定ではありません。

候補生成は単一の総合scoreに依存しません。

- `audioCandidates`: `audio_score` が高いlocal peak
- `chatCandidates`: `chat_score` が高いlocal peak

この2種類を独立して最大件数まで抽出し、unionしたあと、30秒程度の近接候補を1つのmomentに統合します。統合後も、window内の最大 `audio_score` と最大 `chat_score`、それぞれのpeak timestampを保持します。

## 出力ファイル

解析結果は `output/` に出力されます。

- `output/timeline.csv`: 全サンプルの時系列raw値とscore
- `output/highlights.json`: `momentCandidates`、`scoreStatistics`、`rawScoreStatistics`、比較用の旧ランキング
- `output/timeline.png`: chat JSON score、event chat score、audio spike score、event highlight scoreのグラフ

`highlights.json` rootには、指定された場合 `vodId` を保存します。PythonはClip取得やClip照合を行いません。将来NestJS側で `vodId` と `timestampSeconds` を使ってClipと照合します。

`scoreStatistics` は `audio_score` / `chat_score` の `p50`, `p70`, `p85`, `p95`, `max` です。これは★基準ではなく、後段が判断するための純粋な数値統計です。

`rawScoreStatistics` は `audioDelta` / `eventChatScore` の `p50`, `p70`, `p85`, `p95`, `p99_5`, `max` です。正規化のreference確認に使います。

CSVの主な列:

```text
timestamp_seconds
timestamp
audio_score
audio_raw_score
chat_score
chat_raw_score
audio_spike_score
audio_level_score
audio_db
audio_delta
chat_json_score
event_chat_score
chat_activity_percentile_score
chat_local_burst_score
chat_message_count_10s
chat_message_count_30s
event_chat_peak_offset_seconds
event_highlight_score
possible_scene_change
```

## Console表示

解析後は数値のみを表示します。

```text
Moment Candidates
01:26:30
   Audio score: 82.4
   Audio raw  : 41.5
   Chat score : 64.1
   Chat raw   : 48.2
   Playback   : 01:26:10
```

## 今回やらないこと

- Web UI
- Next.js実装
- NestJS API実装
- DB保存
- Twitch Clip取得
- Clipとの紐付け
- OCR
- Whisper
- AI内容理解
- 動画内容の意味判定
- 「これは面白い」という分類

## 簡単な動作確認

```powershell
python analyze.py --help
python analyze.py --input "C:\videos\not-found.mp4"
python -m unittest test_scoring.py
python -m unittest test_chat_json.py
python -m unittest test_event_scoring.py
python -m unittest test_moment_candidates.py
python -m unittest test_output_contract.py
python -m unittest test_score_normalization.py
```
