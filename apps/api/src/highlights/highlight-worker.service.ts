import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'child_process';
import { constants } from 'fs';
import { accessSync } from 'fs';
import {
  access,
  copyFile,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  unlink,
  writeFile,
} from 'fs/promises';
import { dirname, join, resolve } from 'path';
import { AppTwitchVideo, TwitchService } from '../twitch/twitch.service';

const WORKER_LOGIN = 'inumamiya';
const DEFAULT_LOCK_MAX_AGE_HOURS = 12;

type WorkerOptions = {
  maxVods?: number;
  dryRun?: boolean;
  mode?: 'server-incremental' | 'local-reanalyze-all';
  reanalyzeAll?: boolean;
};

export type HighlightWorkerSummary = {
  mode: 'server-incremental' | 'local-reanalyze-all';
  twitchArchives: number;
  alreadyAnalyzed: number;
  target: number;
  succeeded: number;
  failed: { vodId: string; reason: string }[];
  skippedLive: number;
  cleanupWarnings: { vodId: string; reason: string }[];
  obsoleteAnalysisJson: number;
  obsoleteDeleted: number;
  obsoleteDeleteWarnings: { filePath: string; reason: string }[];
  dryRun: boolean;
};

type AnalysisJson = {
  vodId?: unknown;
  momentCandidates?: unknown;
};

type WorkerPaths = {
  workspaceRoot: string;
  analyzerDir: string;
  analyzerOutputDir: string;
  tempRoot: string;
};

@Injectable()
export class HighlightWorkerService {
  constructor(
    private readonly configService: ConfigService,
    private readonly twitchService: TwitchService,
  ) {}

  async run(options: WorkerOptions = {}): Promise<HighlightWorkerSummary> {
    const paths = this.resolvePaths();
    await mkdir(paths.tempRoot, { recursive: true });

    const lockPath = join(paths.tempRoot, '.worker.lock');
    const lockAcquired = await this.acquireLock(lockPath);

    if (!lockAcquired) {
      console.warn('[Highlight Worker] 既にworkerが実行中のため終了します。');
      return {
        twitchArchives: 0,
        mode: this.resolveMode(options),
        alreadyAnalyzed: 0,
        target: 0,
        succeeded: 0,
        failed: [{ vodId: 'worker-lock', reason: 'worker already running' }],
        skippedLive: 0,
        cleanupWarnings: [],
        obsoleteAnalysisJson: 0,
        obsoleteDeleted: 0,
        obsoleteDeleteWarnings: [],
        dryRun: Boolean(options.dryRun),
      };
    }

    const heartbeat = this.startLockHeartbeat(lockPath);

    try {
      return await this.runUnlocked(paths, options);
    } finally {
      clearInterval(heartbeat);
      await this.releaseLock(lockPath);
    }
  }

  private async runUnlocked(
    paths: WorkerPaths,
    options: WorkerOptions,
  ): Promise<HighlightWorkerSummary> {
    const mode = this.resolveMode(options);
    const isLocalReanalyzeAll = mode === 'local-reanalyze-all';
    const maxVods = isLocalReanalyzeAll ? options.maxVods : 1;

    console.log('[Highlight Worker]');
    console.log(`Mode: ${mode}`);
    console.log('Twitch上のarchiveを取得しています...');
    const [videos, stream] = await Promise.all([
      this.twitchService.getAllArchiveVideosByLogin(WORKER_LOGIN),
      this.twitchService.getStreamByLogin(WORKER_LOGIN),
    ]);

    const summary: HighlightWorkerSummary = {
      mode,
      twitchArchives: videos.length,
      alreadyAnalyzed: 0,
      target: 0,
      succeeded: 0,
      failed: [],
      skippedLive: 0,
      cleanupWarnings: [],
      obsoleteAnalysisJson: 0,
      obsoleteDeleted: 0,
      obsoleteDeleteWarnings: [],
      dryRun: Boolean(options.dryRun),
    };
    const archiveIds = new Set(videos.map((video) => video.id));
    const syncResult = await this.syncObsoleteAnalysisJson(
      archiveIds,
      paths.analyzerOutputDir,
      Boolean(options.dryRun),
    );
    summary.obsoleteAnalysisJson = syncResult.obsolete.length;
    summary.obsoleteDeleted = syncResult.deleted.length;
    summary.obsoleteDeleteWarnings = syncResult.warnings;

    if (videos.length === 0) {
      console.log('Twitch archives: 0');
      console.log('解析対象のアーカイブはありません。');
      this.printSummary(summary);
      return summary;
    }

    const targetVideos: AppTwitchVideo[] = [];

    for (const video of videos) {
      if (this.isCurrentLiveVod(video, stream?.id)) {
        summary.skippedLive += 1;
        console.warn(
          `[Highlight Worker] 配信中のstreamに対応する可能性があるためskipします: ${video.id}`,
        );
        continue;
      }

      const isComplete = await this.isAnalysisComplete(
        video.id,
        paths.analyzerOutputDir,
      );

      if (isComplete) {
        summary.alreadyAnalyzed += 1;
      }

      if (!isLocalReanalyzeAll && isComplete) {
        continue;
      }

      targetVideos.push(video);
    }

    const sortedTargets = targetVideos.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    const limitedTargets =
      maxVods === undefined ? sortedTargets : sortedTargets.slice(0, maxVods);

    summary.target = limitedTargets.length;

    console.log(`Archive count: ${summary.twitchArchives}`);
    console.log(`Twitch archives: ${summary.twitchArchives}`);
    console.log(`Already analyzed: ${summary.alreadyAnalyzed}`);
    console.log(
      isLocalReanalyzeAll
        ? `Reanalysis target: ${sortedTargets.length}`
        : `Unanalyzed: ${sortedTargets.length}`,
    );
    if (maxVods !== undefined) {
      console.log(`Target limited by --max-vods/env: ${summary.target}`);
    }

    if (limitedTargets.length === 0) {
      if (isLocalReanalyzeAll) {
        console.log('解析対象のアーカイブはありません。');
      } else {
        console.log('New unanalyzed archive: 0');
        console.log('No analysis required.');
      }
      this.printSummary(summary);
      return summary;
    }

    if (options.dryRun) {
      this.printDryRunTargets(limitedTargets);
      this.printSummary(summary);
      return summary;
    }

    for (const [index, video] of limitedTargets.entries()) {
      console.log('');
      console.log(`[${index + 1}/${limitedTargets.length}]`);
      try {
        const result = await this.processVod(video, paths);
        summary.succeeded += 1;

        if (result.cleanupWarning) {
          summary.cleanupWarnings.push({
            vodId: video.id,
            reason: result.cleanupWarning,
          });
        }
      } catch (error) {
        summary.failed.push({
          vodId: video.id,
          reason: formatErrorReason(error),
        });
        console.error(
          `[Highlight Worker] VOD ${video.id} failed: ${formatErrorReason(error)}`,
        );
      }
    }

    this.printSummary(summary);
    return summary;
  }

  async processVod(
    video: AppTwitchVideo,
    paths: WorkerPaths,
  ): Promise<{ cleanupWarning?: string }> {
    const vodTempDir = join(paths.tempRoot, video.id);
    const videoPath = join(vodTempDir, 'video.mp4');
    const chatPath = join(vodTempDir, 'chat.json');

    await mkdir(vodTempDir, { recursive: true });
    console.log('');
    console.log(`[Highlight Worker] VOD: ${video.id}`);
    console.log(`[Highlight Worker] Title: ${video.title}`);
    console.log(`[Highlight Worker] Created: ${video.createdAt}`);
    console.log('[Highlight Worker] 未解析VODを検出しました。');

    try {
      if (await this.hasNonEmptyFile(videoPath)) {
        console.log('[Highlight Worker] [1/4] 既存のVOD動画を再利用します。');
      } else {
        console.log('[Highlight Worker] [1/4] VODをダウンロードしています...');
        await this.downloadVideo(video.id, videoPath);
      }

      if (await this.hasValidJsonFile(chatPath)) {
        console.log('[Highlight Worker] [2/4] 既存のChat JSONを再利用します。');
      } else {
        console.log('[Highlight Worker] [2/4] Chatをダウンロードしています...');
        await this.downloadChat(video.id, chatPath);
      }

      console.log('[Highlight Worker] [3/4] 解析しています...');
      await this.runAnalyzer(video.id, videoPath, chatPath, paths.analyzerDir);

      console.log('[Highlight Worker] [4/4] 解析結果を保存しています...');
      const finalPath = await this.finalizeAnalysisResult(
        video.id,
        paths.analyzerOutputDir,
      );

      try {
        await rm(vodTempDir, { recursive: true, force: true });
      } catch (error) {
        const cleanupWarning = `[cleanup] 一時ファイルの削除に失敗しました: ${formatErrorReason(error)}`;
        console.warn(`[Highlight Worker] ${cleanupWarning}`);
        console.log(`[Highlight Worker] 解析完了: ${finalPath}`);
        return { cleanupWarning };
      }

      console.log(`[Highlight Worker] 解析完了: ${finalPath}`);
      console.log('[Highlight Worker] 一時ファイルを削除しました。');
      return {};
    } catch (error) {
      console.error(
        '[Highlight Worker] 解析に失敗したため一時ファイルを残しました。',
      );
      throw error;
    }
  }

  async isAnalysisComplete(
    vodId: string,
    analyzerOutputDir = this.resolvePaths().analyzerOutputDir,
  ): Promise<boolean> {
    const finalPath = join(analyzerOutputDir, `${vodId}.json`);
    const parsed = await this.readJsonIfValid(finalPath);

    if (!parsed) {
      return false;
    }

    return parsed.vodId === vodId && Array.isArray(parsed.momentCandidates);
  }

  async finalizeAnalysisResult(
    vodId: string,
    analyzerOutputDir = this.resolvePaths().analyzerOutputDir,
  ): Promise<string> {
    const highlightsPath = join(analyzerOutputDir, 'highlights.json');
    const parsed = await this.readJsonIfValid(highlightsPath);

    if (!parsed) {
      throw new Error('[finalize] highlights.jsonが生成されていないか、JSONとして不正です。');
    }

    if (parsed.vodId !== vodId) {
      throw new Error(
        `[finalize] highlights.jsonのvodIdが一致しません: expected=${vodId}`,
      );
    }

    if (!Array.isArray(parsed.momentCandidates)) {
      throw new Error('[finalize] highlights.jsonにmomentCandidates配列がありません。');
    }

    const finalPath = join(analyzerOutputDir, `${vodId}.json`);
    const tempFinalPath = join(analyzerOutputDir, `${vodId}.json.tmp`);

    await copyFile(highlightsPath, tempFinalPath);
    await rename(tempFinalPath, finalPath);

    return finalPath;
  }

  async syncObsoleteAnalysisJson(
    archiveIds: Set<string>,
    analyzerOutputDir = this.resolvePaths().analyzerOutputDir,
    dryRun = false,
  ): Promise<{
    local: string[];
    obsolete: string[];
    deleted: string[];
    warnings: { filePath: string; reason: string }[];
  }> {
    const localFiles = await this.listVodAnalysisJsonFiles(analyzerOutputDir);
    const obsolete = localFiles.filter((filePath) => {
      const vodId = this.getVodIdFromFinalJsonPath(filePath);

      return vodId ? !archiveIds.has(vodId) : false;
    });
    const deleted: string[] = [];
    const warnings: { filePath: string; reason: string }[] = [];

    console.log('');
    console.log('[Highlight Worker]');
    console.log('Archive sync:');
    console.log(`Current Twitch archives: ${archiveIds.size}`);
    console.log(`Local analysis JSON: ${localFiles.length}`);
    console.log(`Obsolete analysis JSON: ${obsolete.length}`);

    if (archiveIds.size === 0 && localFiles.length > 0) {
      const reason =
        'Twitch archive=0かつlocal VOD JSONが存在するため、安全のため自動全削除を行いません。';
      console.warn(`[Highlight Worker] ${reason}`);
      warnings.push({ filePath: analyzerOutputDir, reason });
      return { local: localFiles, obsolete, deleted, warnings };
    }

    if (dryRun) {
      if (obsolete.length > 0) {
        console.log('削除予定:');
        for (const filePath of obsolete) {
          console.log(`- ${filePath}`);
        }
        console.log('Dry runのため削除しません。');
      }

      return { local: localFiles, obsolete, deleted, warnings };
    }

    if (obsolete.length === 0) {
      return { local: localFiles, obsolete, deleted, warnings };
    }

    console.log('Deleted:');
    for (const filePath of obsolete) {
      try {
        await unlink(filePath);
        deleted.push(filePath);
        console.log(`- ${filePath}`);
      } catch (error) {
        const reason = `Failed to delete ${filePath}: ${formatErrorReason(error)}`;
        warnings.push({ filePath, reason });
        console.warn(`[Highlight Worker] ${reason}`);
      }
    }

    return { local: localFiles, obsolete, deleted, warnings };
  }

  async acquireLock(lockPath: string): Promise<boolean> {
    await mkdir(dirname(lockPath), { recursive: true });

    if (await this.isStaleLock(lockPath)) {
      console.warn('[Highlight Worker] stale lockを回収します。');
      await unlink(lockPath).catch(() => undefined);
    }

    try {
      await writeFile(
        lockPath,
        JSON.stringify({
          pid: process.pid,
          startedAt: new Date().toISOString(),
          mode: 'highlight-worker',
        }),
        { flag: 'wx' },
      );
      return true;
    } catch (error) {
      if (isNodeError(error) && error.code === 'EEXIST') {
        return false;
      }

      throw error;
    }
  }

  async releaseLock(lockPath: string): Promise<void> {
    await unlink(lockPath).catch(() => undefined);
  }

  isCurrentLiveVod(video: AppTwitchVideo, liveStreamId?: string): boolean {
    return Boolean(liveStreamId && video.streamId && video.streamId === liveStreamId);
  }

  resolvePaths(): WorkerPaths {
    const workspaceRoot = this.findWorkspaceRoot(process.cwd());
    const analyzerDir = join(workspaceRoot, 'tools', 'highlight-analyzer');
    const analyzerOutputDir = join(analyzerDir, 'output');
    const tempRoot = resolve(
      this.configService.get<string>('HIGHLIGHT_WORKER_TEMP_DIR') ??
        join(workspaceRoot, 'tools', 'highlight-worker-temp'),
    );

    return {
      workspaceRoot,
      analyzerDir,
      analyzerOutputDir,
      tempRoot,
    };
  }

  private async downloadVideo(vodId: string, outputPath: string): Promise<void> {
    const args = ['videodownload', '--id', vodId, '-o', outputPath];
    const quality = this.configService.get<string>('HIGHLIGHT_VOD_QUALITY');

    if (quality) {
      args.push('--quality', quality);
    }

    await this.runTwitchDownloader(args, 'video download');
  }

  private async downloadChat(vodId: string, outputPath: string): Promise<void> {
    await this.runTwitchDownloader(
      ['chatdownload', '--id', vodId, '-o', outputPath],
      'chat download',
    );
  }

  private async runTwitchDownloader(
    args: string[],
    stage: string,
  ): Promise<void> {
    const executable = this.resolveTwitchDownloaderExecutable();
    const env = { ...process.env };
    const ffmpegPath = this.configService.get<string>('FFMPEG_PATH');

    if (ffmpegPath) {
      env.FFMPEG_PATH = ffmpegPath;
    }

    try {
      await this.runCommand(executable, args, {
        cwd: this.resolvePaths().workspaceRoot,
        env,
      });
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        throw new Error(
          '[twitch downloader] TwitchDownloaderCLIが見つかりません。TWITCH_DOWNLOADER_CLIを設定してください。',
        );
      }

      throw new Error(`[${stage}] TwitchDownloaderCLIの実行に失敗しました。`, {
        cause: error,
      });
    }
  }

  private async runAnalyzer(
    vodId: string,
    videoPath: string,
    chatPath: string,
    analyzerDir: string,
  ): Promise<void> {
    const outputPath = join(analyzerDir, 'output', 'highlights.json');
    await unlink(outputPath).catch(() => undefined);

    const python = await this.resolvePythonExecutable(analyzerDir);
    const args = [
      'analyze.py',
      '--input',
      videoPath,
      '--chat-json',
      chatPath,
      '--vod-id',
      vodId,
    ];

    try {
      await this.runCommand(python, args, { cwd: analyzerDir, env: process.env });
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        throw new Error(
          '[analyzer] Pythonが見つかりません。HIGHLIGHT_ANALYZER_PYTHONを設定してください。',
        );
      }

      throw new Error('[analyzer] analyze.pyの実行に失敗しました。', {
        cause: error,
      });
    }
  }

  private runCommand(
    command: string,
    args: string[],
    options: { cwd: string; env: NodeJS.ProcessEnv },
  ): Promise<void> {
    return new Promise((resolvePromise, reject) => {
      const child = spawn(command, args, {
        cwd: options.cwd,
        env: options.env,
        stdio: 'inherit',
        shell: false,
      });

      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) {
          resolvePromise();
          return;
        }

        reject(new Error(`${command} exited with code ${code}`));
      });
    });
  }

  private resolveTwitchDownloaderExecutable(): string {
    const configured = this.configService.get<string>('TWITCH_DOWNLOADER_CLI');

    if (configured) {
      return configured;
    }

    return process.platform === 'win32'
      ? 'TwitchDownloaderCLI.exe'
      : 'TwitchDownloaderCLI';
  }

  private async resolvePythonExecutable(analyzerDir: string): Promise<string> {
    const configured = this.configService.get<string>('HIGHLIGHT_ANALYZER_PYTHON');

    if (configured) {
      return configured;
    }

    const windowsVenv = join(analyzerDir, '.venv', 'Scripts', 'python.exe');
    const posixVenv = join(analyzerDir, '.venv', 'bin', 'python');

    if (process.platform === 'win32' && (await this.exists(windowsVenv))) {
      return windowsVenv;
    }

    if (await this.exists(posixVenv)) {
      return posixVenv;
    }

    return process.platform === 'win32' ? 'py' : 'python3';
  }

  private getLockMaxAgeHours(): number {
    const value = this.configService.get<string>(
      'HIGHLIGHT_WORKER_LOCK_MAX_AGE_HOURS',
    );
    const parsed = Number(value ?? DEFAULT_LOCK_MAX_AGE_HOURS);

    if (!Number.isFinite(parsed) || parsed <= 0) {
      return DEFAULT_LOCK_MAX_AGE_HOURS;
    }

    return parsed;
  }

  private async isStaleLock(lockPath: string): Promise<boolean> {
    try {
      const lock = await this.readLock(lockPath);

      if (lock?.pid && this.isProcessAlive(lock.pid)) {
        return false;
      }

      const lockStat = await stat(lockPath);
      const maxAgeMs = this.getLockMaxAgeHours() * 60 * 60 * 1000;

      return Date.now() - lockStat.mtimeMs > maxAgeMs;
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        return false;
      }

      throw error;
    }
  }

  private async hasNonEmptyFile(filePath: string): Promise<boolean> {
    try {
      const fileStat = await stat(filePath);

      return fileStat.isFile() && fileStat.size > 0;
    } catch {
      return false;
    }
  }

  private async hasValidJsonFile(filePath: string): Promise<boolean> {
    return Boolean(await this.readJsonIfValid(filePath));
  }

  private async readJsonIfValid(filePath: string): Promise<AnalysisJson | null> {
    try {
      const raw = await readFile(filePath, 'utf8');

      return JSON.parse(raw) as AnalysisJson;
    } catch {
      return null;
    }
  }

  private async listVodAnalysisJsonFiles(
    analyzerOutputDir: string,
  ): Promise<string[]> {
    let entries;
    try {
      entries = await readdir(analyzerOutputDir, { withFileTypes: true });
    } catch {
      return [];
    }

    const files: string[] = [];

    for (const entry of entries) {
      if (!entry.isFile() || !/^\d+\.json$/.test(entry.name)) {
        continue;
      }

      const filePath = join(analyzerOutputDir, entry.name);
      const filenameVodId = entry.name.replace(/\.json$/, '');
      const parsed = await this.readJsonIfValid(filePath);

      if (parsed?.vodId !== undefined && parsed.vodId !== filenameVodId) {
        continue;
      }

      files.push(filePath);
    }

    return files;
  }

  private getVodIdFromFinalJsonPath(filePath: string): string | null {
    const match = /(\d+)\.json$/.exec(filePath);

    return match?.[1] ?? null;
  }

  private async readLock(lockPath: string): Promise<{ pid?: number } | null> {
    try {
      const raw = await readFile(lockPath, 'utf8');
      const parsed = JSON.parse(raw) as { pid?: unknown };

      return typeof parsed.pid === 'number' ? { pid: parsed.pid } : null;
    } catch {
      return null;
    }
  }

  private isProcessAlive(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      if (isNodeError(error) && error.code === 'ESRCH') {
        return false;
      }

      return false;
    }
  }

  private startLockHeartbeat(lockPath: string): NodeJS.Timeout {
    return setInterval(() => {
      writeFile(
        lockPath,
        JSON.stringify({
          pid: process.pid,
          startedAt: new Date().toISOString(),
          mode: 'highlight-worker',
        }),
      ).catch(() => undefined);
    }, 60_000);
  }

  private printDryRunTargets(targets: AppTwitchVideo[]): void {
    console.log('');
    console.log(targets.length === 1 ? 'Next target:' : '処理予定:');

    for (const [index, video] of targets.entries()) {
      console.log(targets.length === 1 ? video.id : `${index + 1}. ${video.id}`);
      console.log(`   ${video.createdAt}`);
      console.log(`   ${video.title}`);
    }
  }

  private resolveMode(
    options: WorkerOptions,
  ): 'server-incremental' | 'local-reanalyze-all' {
    if (options.mode) {
      return options.mode;
    }

    return options.reanalyzeAll ? 'local-reanalyze-all' : 'server-incremental';
  }

  private printSummary(summary: HighlightWorkerSummary): void {
    console.log('');
    console.log('========================================');
    console.log('Highlight Worker completed');
    console.log('');
    console.log(`Mode            : ${summary.mode}`);
    console.log(`Twitch archives : ${summary.twitchArchives}`);
    if (summary.mode === 'local-reanalyze-all') {
      console.log(`Reanalysis target: ${summary.target}`);
    } else {
      console.log(`Already analyzed: ${summary.alreadyAnalyzed}`);
      console.log(`Target          : ${summary.target}`);
    }
    console.log(`Succeeded       : ${summary.succeeded}`);
    console.log(`Failed          : ${summary.failed.length}`);
    console.log(`Skipped live    : ${summary.skippedLive}`);
    console.log(`Obsolete deleted: ${summary.obsoleteDeleted}`);

    if (summary.dryRun) {
      console.log('Mode            : dry-run');
    }

    if (summary.failed.length > 0) {
      console.log('');
      console.log('Failed VOD:');
      for (const failure of summary.failed) {
        console.log(`- ${failure.vodId}`);
        console.log(`  ${failure.reason}`);
      }
    }

    if (summary.cleanupWarnings.length > 0) {
      console.log('');
      console.log('Cleanup warning:');
      for (const warning of summary.cleanupWarnings) {
        console.log(`- ${warning.vodId}`);
        console.log(`  ${warning.reason}`);
      }
    }

    if (summary.obsoleteDeleteWarnings.length > 0) {
      console.log('');
      console.log('Obsolete cleanup warning:');
      for (const warning of summary.obsoleteDeleteWarnings) {
        console.log(`- ${warning.filePath}`);
        console.log(`  ${warning.reason}`);
      }
    }

    console.log('');
    console.log('========================================');
  }

  private async exists(filePath: string): Promise<boolean> {
    try {
      await access(filePath, constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  private findWorkspaceRoot(startDirectory: string): string {
    let current = resolve(startDirectory);

    for (let depth = 0; depth < 8; depth += 1) {
      if (this.existsSync(join(current, 'pnpm-workspace.yaml'))) {
        return current;
      }

      const parent = dirname(current);

      if (parent === current) {
        break;
      }

      current = parent;
    }

    return resolve(startDirectory);
  }

  private existsSync(filePath: string): boolean {
    try {
      accessSync(filePath, constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error;
}

function formatErrorReason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
