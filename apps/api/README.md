<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ pnpm install
```

## Compile and run the project

```bash
# development
$ pnpm run start

# watch mode
$ pnpm run start:dev

# production mode
$ pnpm run start:prod
```

## Run tests

```bash
# unit tests
$ pnpm run test

# e2e tests
$ pnpm run test:e2e

# test coverage
$ pnpm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ pnpm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
# Highlight Worker

Twitch VODの見どころ解析は、サーバー定期WorkerとローカルPC用の全件再解析でコマンドを分けています。

## Server

```powershell
pnpm --filter api highlight:worker
pnpm --filter api highlight:worker -- --dry-run
```

本番サーバーの定期実行用です。毎回Twitch上に現在存在するarchiveを全ページ取得し、obsolete JSONを同期したうえで、最新の未解析VODを最大1件だけ解析して終了します。

```text
Twitch archive一覧取得
↓
obsolete JSON同期
↓
解析済み判定
↓
最新の未解析VODを最大1件だけ解析
↓
終了
```

未解析VODが複数ある場合も、1回のrunでは最新1件だけ処理します。次回runで次の未解析VODを処理します。未解析が0件なら `No analysis required.` として正常終了します。

`--dry-run` はarchive取得、解析済み判定、obsolete検出、次の対象表示だけを行い、download / chat download / analyzer / finalize / obsolete削除は実行しません。

build後に実行する場合:

```powershell
pnpm --filter api build
pnpm --filter api highlight:worker:prod
```

## Local PC

採点アルゴリズム、candidate抽出、merge方法などを変更したあとに、現在Twitch上に存在する全archiveをローカルPCで強制的に再解析するためのコマンドです。

```powershell
pnpm --filter api highlight:reanalyze-all
pnpm --filter api highlight:reanalyze-all -- --dry-run
```

試験用に先頭N件だけ再解析する場合:

```powershell
pnpm --filter api highlight:reanalyze-all -- --max-vods 2
```

`highlight:reanalyze-all` は、既存の `tools/highlight-analyzer/output/<vodId>.json` が存在していてもskipせず、createdAtの新しい順に1本ずつ逐次処理します。並列処理はしません。

処理フローはserver/localで共通です。

```text
TwitchDownloaderCLI videodownload
↓
TwitchDownloaderCLI chatdownload
↓
tools/highlight-analyzer/analyze.py
↓
tools/highlight-analyzer/output/<vodId>.json へ保存
↓
成功時のみ一時ファイル削除
```

再解析時も既存JSONは解析開始前に削除しません。`analyze.py` が新しい `output/highlights.json` を生成し、`vodId` と `momentCandidates` のvalidationに成功した場合だけ、`output/<vodId>.json.tmp` を経由してatomic replaceします。再解析に失敗したVODは以前の `<vodId>.json` を維持し、tempを残して次回resumeできるようにします。

出力先:

```text
tools/highlight-analyzer/output/
  <vodId>.json
  <vodId>.json
  ...
```

一時出力の `output/highlights.json` は各VOD処理ごとに `output/<vodId>.json` へ変換されます。

workerは1本ずつ逐次処理します。local reanalyze-allでは1件失敗しても残りのVODは可能な限り処理し、最後にsummaryを表示します。失敗が1件以上あった場合はexit code 1になります。

多重起動防止:

```text
tools/highlight-worker-temp/.worker.lock
```

実行中workerのPIDが生存している場合、lock ageだけではstale扱いしません。worker稼働中はheartbeatでlockを更新します。

serverで処理対象がない場合:

```text
Twitch archives: 14
Unanalyzed: 0

New unanalyzed archive: 0
No analysis required.
```

archiveが0件の場合も正常終了します。

Resume:

```text
tools/highlight-worker-temp/<vodId>/video.mp4  が存在しsize > 0 → video download skip
tools/highlight-worker-temp/<vodId>/chat.json  がvalid JSON     → chat download skip
```

途中失敗時は再試行しやすいよう一時ファイルを残します。成功して `<vodId>.json` の保存まで完了した場合のみ削除します。

Archive同期:

WorkerはTwitch archive一覧を全ページ正常取得できた場合だけ、現在Twitch上に存在しないVODのfinal JSONを削除します。

削除対象は `tools/highlight-analyzer/output/` の `^\d+\.json$` に一致するVOD用JSONだけです。`highlights.json`、`timeline.csv`、`timeline.png`、数字以外のJSONは削除しません。

```text
Twitch:
  123
  456

output:
  123.json
  456.json
  789.json

=> 789.json をobsoleteとして削除
```

`--dry-run` では削除予定だけを表示し、実ファイルは変更しません。Twitch archive取得が失敗した場合は、obsolete削除処理自体を実行しません。

安全策として、Twitch archiveが正常に0件取得された一方でlocal VOD JSONが存在する場合は、自動全削除せずwarningとして停止します。

旧 `--all-existing` option はありません。serverは最新の未解析VODを最大1件だけ処理し、全件再解析は `highlight:reanalyze-all` で明示的に実行します。

必要なenv:

- `TWITCH_CLIENT_ID`
- `TWITCH_CLIENT_SECRET`
- `TWITCH_DOWNLOADER_CLI`: 例 `C:\tools\TwitchDownloaderCLI.exe`。未指定時はPATH上の `TwitchDownloaderCLI.exe` / `TwitchDownloaderCLI` を使います。

optional env:

- `HIGHLIGHT_ANALYZER_PYTHON`: analyzer実行に使うPython。未指定時は `tools/highlight-analyzer/.venv`、Windowsの `py`、それ以外の `python3` の順に探します。
- `HIGHLIGHT_WORKER_TEMP_DIR`: 一時download先。defaultは `tools/highlight-worker-temp`。
- `HIGHLIGHT_WORKER_LOCK_MAX_AGE_HOURS`: worker lockのstale判定時間。defaultは `12`。
- `HIGHLIGHT_VOD_QUALITY`: 指定時のみ `videodownload --quality` へ渡します。
- `FFMPEG_PATH`: 指定時のみ子processの環境変数へ渡します。

## Cloudflare R2

Cloudflare R2を使う場合、解析結果JSONはprivate bucketのS3互換APIへ保存します。VercelやブラウザからR2へ直接アクセスせず、NestJS APIがR2から読み込んで既存の `/highlights/vods/:vodId/moments` として返します。

R2 object key:

```text
highlights/<vodId>/result.json
highlights/<vodId>/thumbnails/<timestampSeconds>.webp
```

thumbnailは見どころの `timestampSeconds` 付近のフレームをWebPで保存します。Webの再生開始位置は従来どおり見どころ時刻の約5秒前ですが、thumbnailは `playbackStartSeconds` ではなく実際の見どころ時刻を使います。

R2を有効にするenv:

```text
R2_ENDPOINT=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=
```

4つすべてが設定されている場合のみR2を使用します。4つすべて未設定ならローカルの `tools/highlight-analyzer/output/<vodId>.json` を使用します。一部だけ設定されている場合は設定ミスとしてエラーになります。

ローカル解析済みJSONをR2へ初期投入する場合:

```powershell
pnpm --filter api highlight:r2-upload -- --dry-run
pnpm --filter api highlight:r2-upload
```

`--dry-run` はローカルJSONの検証とupload対象表示だけを行い、R2へは書き込みません。通常実行では `tools/highlight-analyzer/output/<numericVodId>.json` のうち、JSON parse、`vodId`一致、`momentCandidates` validationに成功したものを `highlights/<vodId>/result.json` へ上書きuploadします。

thumbnail配信:

```text
GET /highlights/vods/:vodId/thumbnails/:timestampSeconds
```

R2 bucketはprivateのままにし、ブラウザへR2 URLを直接返しません。`/moments` はthumbnailが存在するmomentだけ `thumbnailUrl` としてAPIのrelative pathを返します。APIは1つのVODにつき `highlights/<vodId>/thumbnails/` をlistして存在確認するため、momentごとのHeadObjectは行いません。

WorkerはVOD解析後、`tools/highlight-worker-temp/<vodId>/video.mp4` から `ffmpeg` で480x270程度のWebP thumbnailを生成し、thumbnail保存が完了してからresult JSONを保存します。`FFMPEG_PATH` を設定するとその実行ファイルを使い、未設定時はPATH上の `ffmpeg` を使います。

将来の既存アーカイブ補完用dry-run:

```powershell
pnpm --filter api highlight:enrich -- --dry-run
pnpm --filter api highlight:enrich -- --dry-run --vod-id 2845984263
pnpm --filter api highlight:enrich -- --dry-run --max-vods 1
```

現段階の `highlight:enrich` は対象確認用の土台だけで、VOD download、thumbnail生成、R2 uploadは行いません。

一時ファイル:

- `tools/highlight-worker-temp/<vodId>/video.mp4`
- `tools/highlight-worker-temp/<vodId>/chat.json`

途中失敗時は再試行しやすいよう一時ファイルを残します。成功して `<vodId>.json` の保存まで完了した場合のみ削除します。
