import {
  mkdir,
  mkdtemp,
  readFile,
  stat,
  utimes,
  writeFile,
} from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { ConfigService } from '@nestjs/config';
import { HighlightWorkerService } from './highlight-worker.service';
import { AppTwitchVideo, TwitchService } from '../twitch/twitch.service';

function createVideo(overrides: Partial<AppTwitchVideo> = {}): AppTwitchVideo {
  return {
    id: '2845096588',
    streamId: 'stream-1',
    userId: 'user-id',
    userLogin: 'inumamiya',
    userName: 'いぬまみや',
    title: 'test vod',
    description: '',
    createdAt: '2026-08-13T00:00:00Z',
    publishedAt: '2026-08-13T00:00:00Z',
    url: 'https://www.twitch.tv/videos/2845096588',
    thumbnailUrl: '',
    viewCount: 1,
    language: 'ja',
    type: 'archive',
    duration: '5h13m',
    ...overrides,
  };
}

function createService(env: Record<string, string | undefined> = {}) {
  const configService = {
    get: jest.fn((key: string) => env[key]),
  } as unknown as ConfigService;
  const twitchService = {
    getArchiveVideosByLogin: jest.fn(),
    getAllArchiveVideosByLogin: jest.fn(),
    getStreamByLogin: jest.fn(),
  } as unknown as jest.Mocked<TwitchService>;
  const service = new HighlightWorkerService(configService, twitchService);

  return { service, twitchService };
}

describe('HighlightWorkerService', () => {
  async function createTempPaths() {
    const root = await mkdtemp(join(tmpdir(), 'highlight-worker-'));
    const analyzerDir = join(root, 'tools', 'highlight-analyzer');
    const analyzerOutputDir = join(analyzerDir, 'output');
    const tempRoot = join(root, 'tools', 'highlight-worker-temp');

    return {
      workspaceRoot: root,
      analyzerDir,
      analyzerOutputDir,
      tempRoot,
    };
  }

  function useTempPaths(service: HighlightWorkerService, paths: Awaited<ReturnType<typeof createTempPaths>>) {
    jest.spyOn(service, 'resolvePaths').mockReturnValue(paths);
  }

  it('skips a VOD when a valid finalized analysis JSON already exists', async () => {
    const paths = await createTempPaths();
    const { service } = createService();
    await mkdir(paths.analyzerOutputDir, { recursive: true });
    await writeFile(
      join(paths.analyzerOutputDir, '2845096588.json'),
      JSON.stringify({ vodId: '2845096588', momentCandidates: [] }),
    );

    await expect(
      service.isAnalysisComplete('2845096588', paths.analyzerOutputDir),
    ).resolves.toBe(true);
  });

  it('treats vodId mismatch and broken JSON as not analyzed', async () => {
    const paths = await createTempPaths();
    const { service } = createService();
    await mkdir(paths.analyzerOutputDir, { recursive: true });
    await writeFile(
      join(paths.analyzerOutputDir, '2845096588.json'),
      JSON.stringify({ vodId: '999', momentCandidates: [] }),
    );

    await expect(
      service.isAnalysisComplete('2845096588', paths.analyzerOutputDir),
    ).resolves.toBe(false);

    await writeFile(join(paths.analyzerOutputDir, '2845096588.json'), '{broken');

    await expect(
      service.isAnalysisComplete('2845096588', paths.analyzerOutputDir),
    ).resolves.toBe(false);
  });

  it('runs video download, chat download, analyzer, and finalize for an unanalyzed VOD', async () => {
    const paths = await createTempPaths();
    const { service } = createService();
    const calls: string[] = [];

    jest.spyOn(service as any, 'downloadVideo').mockImplementation(async () => {
      calls.push('video');
    });
    jest.spyOn(service as any, 'downloadChat').mockImplementation(async () => {
      calls.push('chat');
    });
    jest.spyOn(service as any, 'runAnalyzer').mockImplementation(async () => {
      calls.push('analyzer');
    });
    jest.spyOn(service, 'finalizeAnalysisResult').mockImplementation(async () => {
      calls.push('finalize');
      return join(paths.analyzerOutputDir, '2845096588.json');
    });

    await service.processVod(createVideo(), paths);

    expect(calls).toEqual(['video', 'chat', 'analyzer', 'finalize']);
  });

  it('reuses existing video and valid chat temp files', async () => {
    const paths = await createTempPaths();
    const { service } = createService();
    const vodTempDir = join(paths.tempRoot, '2845096588');

    await mkdir(vodTempDir, { recursive: true });
    await writeFile(join(vodTempDir, 'video.mp4'), 'video');
    await writeFile(join(vodTempDir, 'chat.json'), JSON.stringify({ comments: [] }));

    const videoDownload = jest
      .spyOn(service as any, 'downloadVideo')
      .mockResolvedValue(undefined);
    const chatDownload = jest
      .spyOn(service as any, 'downloadChat')
      .mockResolvedValue(undefined);
    jest.spyOn(service as any, 'runAnalyzer').mockResolvedValue(undefined);
    jest.spyOn(service, 'finalizeAnalysisResult').mockResolvedValue(
      join(paths.analyzerOutputDir, '2845096588.json'),
    );

    await service.processVod(createVideo(), paths);

    expect(videoDownload).not.toHaveBeenCalled();
    expect(chatDownload).not.toHaveBeenCalled();
  });

  it('finalizes analyzer output only when vodId matches', async () => {
    const paths = await createTempPaths();
    const { service } = createService();

    await mkdir(paths.analyzerOutputDir, { recursive: true });
    await writeFile(
      join(paths.analyzerOutputDir, 'highlights.json'),
      JSON.stringify({ vodId: '2845096588', momentCandidates: [] }),
    );

    const finalPath = await service.finalizeAnalysisResult(
      '2845096588',
      paths.analyzerOutputDir,
    );

    expect(finalPath.endsWith('2845096588.json')).toBe(true);
    await expect(readFile(finalPath, 'utf8')).resolves.toContain('2845096588');

    await writeFile(
      join(paths.analyzerOutputDir, 'highlights.json'),
      JSON.stringify({ vodId: '999', momentCandidates: [] }),
    );

    await expect(
      service.finalizeAnalysisResult('2845096588', paths.analyzerOutputDir),
    ).rejects.toThrow('vodIdが一致しません');
  });

  it('keeps temp files when analysis fails and removes them on success', async () => {
    const paths = await createTempPaths();
    const { service } = createService();
    const vodTempDir = join(paths.tempRoot, '2845096588');
    const videoPath = join(vodTempDir, 'video.mp4');

    jest.spyOn(service as any, 'downloadVideo').mockImplementation(async () => {
      await writeFile(videoPath, 'video');
    });
    jest.spyOn(service as any, 'downloadChat').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'runAnalyzer').mockRejectedValueOnce(
      new Error('analysis failed'),
    );

    await expect(service.processVod(createVideo(), paths)).rejects.toThrow(
      'analysis failed',
    );
    await expect(stat(videoPath)).resolves.toBeDefined();

    jest.spyOn(service as any, 'runAnalyzer').mockResolvedValue(undefined);
    jest.spyOn(service, 'finalizeAnalysisResult').mockResolvedValue(
      join(paths.analyzerOutputDir, '2845096588.json'),
    );

    await service.processVod(createVideo(), paths);
    await expect(stat(vodTempDir)).rejects.toThrow();
  });

  it('does not run twice when a fresh worker lock already exists', async () => {
    const paths = await createTempPaths();
    const { service, twitchService } = createService({
      HIGHLIGHT_WORKER_TEMP_DIR: paths.tempRoot,
    });
    useTempPaths(service, paths);
    const lockPath = join(paths.tempRoot, '.worker.lock');

    await mkdir(paths.tempRoot, { recursive: true });
    await writeFile(lockPath, 'locked');

    await service.run();

    expect(twitchService.getAllArchiveVideosByLogin).not.toHaveBeenCalled();
  });

  it('recovers a stale worker lock', async () => {
    const paths = await createTempPaths();
    const { service } = createService({
      HIGHLIGHT_WORKER_LOCK_MAX_AGE_HOURS: '0.001',
    });
    const lockPath = join(paths.tempRoot, '.worker.lock');

    await mkdir(paths.tempRoot, { recursive: true });
    await writeFile(lockPath, 'locked');
    const oldTime = new Date(Date.now() - 60 * 60 * 1000);
    await utimes(lockPath, oldTime, oldTime);

    await expect(service.acquireLock(lockPath)).resolves.toBe(true);
    await service.releaseLock(lockPath);
  });

  it('skips the current live stream VOD', async () => {
    const paths = await createTempPaths();
    const { service, twitchService } = createService({
      HIGHLIGHT_WORKER_TEMP_DIR: paths.tempRoot,
    });
    useTempPaths(service, paths);
    twitchService.getAllArchiveVideosByLogin.mockResolvedValue([
      createVideo({ streamId: 'live-stream' }),
    ]);
    twitchService.getStreamByLogin.mockResolvedValue({
      id: 'live-stream',
    } as Awaited<ReturnType<TwitchService['getStreamByLogin']>>);
    const processVod = jest.spyOn(service, 'processVod');

    await service.run();

    expect(processVod).not.toHaveBeenCalled();
  });

  it('server targets only the newest unanalyzed archive and skips already analyzed archives', async () => {
    const paths = await createTempPaths();
    const { service, twitchService } = createService({
      HIGHLIGHT_WORKER_TEMP_DIR: paths.tempRoot,
    });
    useTempPaths(service, paths);
    await mkdir(paths.analyzerOutputDir, { recursive: true });
    await writeFile(
      join(paths.analyzerOutputDir, 'vod-2.json'),
      JSON.stringify({ vodId: 'vod-2', momentCandidates: [] }),
    );
    twitchService.getAllArchiveVideosByLogin.mockResolvedValue([
      createVideo({ id: 'vod-1', createdAt: '2026-08-15T00:00:00Z' }),
      createVideo({ id: 'vod-2', createdAt: '2026-08-14T00:00:00Z' }),
      createVideo({ id: 'vod-3', createdAt: '2026-08-13T00:00:00Z' }),
    ]);
    twitchService.getStreamByLogin.mockResolvedValue(null);
    const processed: string[] = [];
    jest.spyOn(service, 'processVod').mockImplementation(async (video) => {
      processed.push(video.id);
      return {};
    });

    const summary = await service.run();

    expect(processed).toEqual(['vod-1']);
    expect(summary).toMatchObject({
      mode: 'server-incremental',
      twitchArchives: 3,
      alreadyAnalyzed: 1,
      target: 1,
      succeeded: 1,
    });
  });

  it('server next run targets the next unanalyzed archive', async () => {
    const paths = await createTempPaths();
    const { service, twitchService } = createService({
      HIGHLIGHT_WORKER_TEMP_DIR: paths.tempRoot,
    });
    useTempPaths(service, paths);
    await mkdir(paths.analyzerOutputDir, { recursive: true });
    twitchService.getAllArchiveVideosByLogin.mockResolvedValue([
      createVideo({ id: 'vod-1', createdAt: '2026-08-15T00:00:00Z' }),
      createVideo({ id: 'vod-2', createdAt: '2026-08-14T00:00:00Z' }),
      createVideo({ id: 'vod-3', createdAt: '2026-08-13T00:00:00Z' }),
    ]);
    twitchService.getStreamByLogin.mockResolvedValue(null);
    const processed: string[] = [];
    jest.spyOn(service, 'processVod').mockImplementation(async (video) => {
      processed.push(video.id);
      await writeFile(
        join(paths.analyzerOutputDir, `${video.id}.json`),
        JSON.stringify({ vodId: video.id, momentCandidates: [] }),
      );
      return {};
    });

    await service.run();
    const summary = await service.run();

    expect(processed).toEqual(['vod-1', 'vod-2']);
    expect(summary).toMatchObject({
      alreadyAnalyzed: 1,
      target: 1,
      succeeded: 1,
    });
  });

  it('processes unanalyzed archives newest first', async () => {
    const paths = await createTempPaths();
    const { service, twitchService } = createService({
      HIGHLIGHT_WORKER_TEMP_DIR: paths.tempRoot,
    });
    useTempPaths(service, paths);
    twitchService.getAllArchiveVideosByLogin.mockResolvedValue([
      createVideo({ id: 'old', createdAt: '2026-08-08T00:00:00Z' }),
      createVideo({ id: 'new', createdAt: '2026-08-15T00:00:00Z' }),
      createVideo({ id: 'middle', createdAt: '2026-08-12T00:00:00Z' }),
    ]);
    twitchService.getStreamByLogin.mockResolvedValue(null);
    const processed: string[] = [];
    jest.spyOn(service, 'processVod').mockImplementation(async (video) => {
      processed.push(video.id);
      return {};
    });

    await service.run();

    expect(processed).toEqual(['new']);
  });

  it('server records a failure summary for the selected VOD', async () => {
    const paths = await createTempPaths();
    const { service, twitchService } = createService({
      HIGHLIGHT_WORKER_TEMP_DIR: paths.tempRoot,
    });
    useTempPaths(service, paths);
    twitchService.getAllArchiveVideosByLogin.mockResolvedValue([
      createVideo({ id: 'vod-1', createdAt: '2026-08-15T00:00:00Z' }),
      createVideo({ id: 'vod-2', createdAt: '2026-08-14T00:00:00Z' }),
      createVideo({ id: 'vod-3', createdAt: '2026-08-13T00:00:00Z' }),
    ]);
    twitchService.getStreamByLogin.mockResolvedValue(null);
    const processed: string[] = [];
    jest.spyOn(service, 'processVod').mockImplementation(async (video) => {
      processed.push(video.id);
      throw new Error('analyze.py failed');
    });

    const summary = await service.run();

    expect(processed).toEqual(['vod-1']);
    expect(summary.succeeded).toBe(0);
    expect(summary.failed).toEqual([
      { vodId: 'vod-1', reason: 'analyze.py failed' },
    ]);
  });

  it('server targets nothing when all archives are already analyzed', async () => {
    const paths = await createTempPaths();
    const { service, twitchService } = createService({
      HIGHLIGHT_WORKER_TEMP_DIR: paths.tempRoot,
    });
    useTempPaths(service, paths);
    await mkdir(paths.analyzerOutputDir, { recursive: true });
    for (const vodId of ['vod-1', 'vod-2', 'vod-3']) {
      await writeFile(
        join(paths.analyzerOutputDir, `${vodId}.json`),
        JSON.stringify({ vodId, momentCandidates: [] }),
      );
    }
    twitchService.getAllArchiveVideosByLogin.mockResolvedValue([
      createVideo({ id: 'vod-1', createdAt: '2026-08-15T00:00:00Z' }),
      createVideo({ id: 'vod-2', createdAt: '2026-08-14T00:00:00Z' }),
      createVideo({ id: 'vod-3', createdAt: '2026-08-13T00:00:00Z' }),
    ]);
    twitchService.getStreamByLogin.mockResolvedValue(null);
    const processVod = jest.spyOn(service, 'processVod');

    const summary = await service.run();

    expect(processVod).not.toHaveBeenCalled();
    expect(summary).toMatchObject({
      mode: 'server-incremental',
      alreadyAnalyzed: 3,
      target: 0,
      succeeded: 0,
    });
  });

  it('local reanalyze-all targets every archive', async () => {
    const paths = await createTempPaths();
    const { service, twitchService } = createService({
      HIGHLIGHT_WORKER_TEMP_DIR: paths.tempRoot,
    });
    useTempPaths(service, paths);
    const videos = Array.from({ length: 37 }, (_, index) =>
      createVideo({
        id: `vod-${index + 1}`,
        createdAt: new Date(Date.UTC(2026, 7, 15 - index)).toISOString(),
      }),
    );
    twitchService.getAllArchiveVideosByLogin.mockResolvedValue(videos);
    twitchService.getStreamByLogin.mockResolvedValue(null);
    const processed: string[] = [];
    jest.spyOn(service, 'processVod').mockImplementation(async (video) => {
      processed.push(video.id);
      return {};
    });

    const summary = await service.run({ mode: 'local-reanalyze-all' });

    expect(processed).toHaveLength(37);
    expect(processed[0]).toBe('vod-1');
    expect(summary.target).toBe(37);
    expect(summary.succeeded).toBe(37);
  });

  it('server dry-run computes the next target without processing VODs', async () => {
    const paths = await createTempPaths();
    const { service, twitchService } = createService({
      HIGHLIGHT_WORKER_TEMP_DIR: paths.tempRoot,
    });
    useTempPaths(service, paths);
    twitchService.getAllArchiveVideosByLogin.mockResolvedValue([
      createVideo({ id: 'vod-1' }),
      createVideo({ id: 'vod-2' }),
    ]);
    twitchService.getStreamByLogin.mockResolvedValue(null);
    const processVod = jest.spyOn(service, 'processVod');

    const summary = await service.run({ dryRun: true });

    expect(processVod).not.toHaveBeenCalled();
    expect(summary).toMatchObject({
      twitchArchives: 2,
      target: 1,
      succeeded: 0,
      dryRun: true,
    });
  });

  it('reanalyze-all targets already analyzed archives', async () => {
    const paths = await createTempPaths();
    const { service, twitchService } = createService({
      HIGHLIGHT_WORKER_TEMP_DIR: paths.tempRoot,
    });
    useTempPaths(service, paths);
    await mkdir(paths.analyzerOutputDir, { recursive: true });
    await writeFile(
      join(paths.analyzerOutputDir, 'vod-1.json'),
      JSON.stringify({ vodId: 'vod-1', momentCandidates: [] }),
    );
    twitchService.getAllArchiveVideosByLogin.mockResolvedValue([
      createVideo({ id: 'vod-1' }),
      createVideo({ id: 'vod-2' }),
    ]);
    twitchService.getStreamByLogin.mockResolvedValue(null);
    const processed: string[] = [];
    jest.spyOn(service, 'processVod').mockImplementation(async (video) => {
      processed.push(video.id);
      return {};
    });

    const summary = await service.run({ mode: 'local-reanalyze-all' });

    expect(processed).toEqual(['vod-1', 'vod-2']);
    expect(summary).toMatchObject({
      mode: 'local-reanalyze-all',
      alreadyAnalyzed: 1,
      target: 2,
      succeeded: 2,
    });
  });

  it('reanalyze-all with maxVods only targets the requested prefix', async () => {
    const paths = await createTempPaths();
    const { service, twitchService } = createService({
      HIGHLIGHT_WORKER_TEMP_DIR: paths.tempRoot,
    });
    useTempPaths(service, paths);
    twitchService.getAllArchiveVideosByLogin.mockResolvedValue([
      createVideo({ id: 'vod-1', createdAt: '2026-08-15T00:00:00Z' }),
      createVideo({ id: 'vod-2', createdAt: '2026-08-14T00:00:00Z' }),
      createVideo({ id: 'vod-3', createdAt: '2026-08-13T00:00:00Z' }),
    ]);
    twitchService.getStreamByLogin.mockResolvedValue(null);
    const processed: string[] = [];
    jest.spyOn(service, 'processVod').mockImplementation(async (video) => {
      processed.push(video.id);
      return {};
    });

    const summary = await service.run({
      mode: 'local-reanalyze-all',
      maxVods: 2,
    });

    expect(processed).toEqual(['vod-1', 'vod-2']);
    expect(summary.target).toBe(2);
  });

  it('reanalyze-all dry-run does not process archives', async () => {
    const paths = await createTempPaths();
    const { service, twitchService } = createService({
      HIGHLIGHT_WORKER_TEMP_DIR: paths.tempRoot,
    });
    useTempPaths(service, paths);
    twitchService.getAllArchiveVideosByLogin.mockResolvedValue([
      createVideo({ id: 'vod-1' }),
    ]);
    twitchService.getStreamByLogin.mockResolvedValue(null);
    const processVod = jest.spyOn(service, 'processVod');

    const summary = await service.run({
      mode: 'local-reanalyze-all',
      dryRun: true,
    });

    expect(processVod).not.toHaveBeenCalled();
    expect(summary).toMatchObject({
      mode: 'local-reanalyze-all',
      target: 1,
      dryRun: true,
    });
  });

  it('reanalysis success atomically replaces an existing final JSON', async () => {
    const paths = await createTempPaths();
    const { service } = createService();

    await mkdir(paths.analyzerOutputDir, { recursive: true });
    const finalPath = join(paths.analyzerOutputDir, '2845096588.json');
    await writeFile(
      finalPath,
      JSON.stringify({ vodId: '2845096588', momentCandidates: ['old'] }),
    );
    await writeFile(
      join(paths.analyzerOutputDir, 'highlights.json'),
      JSON.stringify({ vodId: '2845096588', momentCandidates: ['new'] }),
    );

    await service.finalizeAnalysisResult('2845096588', paths.analyzerOutputDir);

    await expect(readFile(finalPath, 'utf8')).resolves.toContain('new');
  });

  it('reanalysis failure keeps the existing final JSON', async () => {
    const paths = await createTempPaths();
    const { service } = createService();
    const finalPath = join(paths.analyzerOutputDir, '2845096588.json');

    await mkdir(paths.analyzerOutputDir, { recursive: true });
    await writeFile(
      finalPath,
      JSON.stringify({ vodId: '2845096588', momentCandidates: ['old'] }),
    );
    jest.spyOn(service as any, 'downloadVideo').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'downloadChat').mockResolvedValue(undefined);
    jest
      .spyOn(service as any, 'runAnalyzer')
      .mockRejectedValue(new Error('reanalyze failed'));

    await expect(service.processVod(createVideo(), paths)).rejects.toThrow(
      'reanalyze failed',
    );
    await expect(readFile(finalPath, 'utf8')).resolves.toContain('old');
  });

  it('continues reanalysis after one analyzed VOD fails', async () => {
    const paths = await createTempPaths();
    const { service, twitchService } = createService({
      HIGHLIGHT_WORKER_TEMP_DIR: paths.tempRoot,
    });
    useTempPaths(service, paths);
    twitchService.getAllArchiveVideosByLogin.mockResolvedValue([
      createVideo({ id: 'vod-1', createdAt: '2026-08-15T00:00:00Z' }),
      createVideo({ id: 'vod-2', createdAt: '2026-08-14T00:00:00Z' }),
      createVideo({ id: 'vod-3', createdAt: '2026-08-13T00:00:00Z' }),
    ]);
    twitchService.getStreamByLogin.mockResolvedValue(null);
    const processed: string[] = [];
    jest.spyOn(service, 'processVod').mockImplementation(async (video) => {
      processed.push(video.id);
      if (video.id === 'vod-2') {
        throw new Error('failed');
      }
      return {};
    });

    const summary = await service.run({ reanalyzeAll: true });

    expect(processed).toEqual(['vod-1', 'vod-2', 'vod-3']);
    expect(summary.failed).toEqual([{ vodId: 'vod-2', reason: 'failed' }]);
  });

  it('deletes only obsolete numeric VOD JSON files', async () => {
    const paths = await createTempPaths();
    const { service } = createService();
    const fileA = join(paths.analyzerOutputDir, '111.json');
    const fileB = join(paths.analyzerOutputDir, '222.json');
    const fileC = join(paths.analyzerOutputDir, '333.json');
    const highlights = join(paths.analyzerOutputDir, 'highlights.json');
    const other = join(paths.analyzerOutputDir, 'notes.json');

    await mkdir(paths.analyzerOutputDir, { recursive: true });
    await writeFile(fileA, JSON.stringify({ vodId: '111', momentCandidates: [] }));
    await writeFile(fileB, JSON.stringify({ vodId: '222', momentCandidates: [] }));
    await writeFile(fileC, JSON.stringify({ vodId: '333', momentCandidates: [] }));
    await writeFile(highlights, JSON.stringify({ vodId: '999' }));
    await writeFile(other, JSON.stringify({ vodId: '222', momentCandidates: [] }));

    const result = await service.syncObsoleteAnalysisJson(
      new Set(['111', '222']),
      paths.analyzerOutputDir,
      false,
    );

    expect(result.deleted).toEqual([fileC]);
    await expect(stat(fileA)).resolves.toBeDefined();
    await expect(stat(fileB)).resolves.toBeDefined();
    await expect(stat(fileC)).rejects.toThrow();
    await expect(stat(highlights)).resolves.toBeDefined();
    await expect(stat(other)).resolves.toBeDefined();
  });

  it('does not delete obsolete JSON during dry-run', async () => {
    const paths = await createTempPaths();
    const { service } = createService();
    const filePath = join(paths.analyzerOutputDir, '333.json');

    await mkdir(paths.analyzerOutputDir, { recursive: true });
    await writeFile(filePath, JSON.stringify({ vodId: '333', momentCandidates: [] }));

    const result = await service.syncObsoleteAnalysisJson(
      new Set(['111']),
      paths.analyzerOutputDir,
      true,
    );

    expect(result.obsolete).toEqual([filePath]);
    expect(result.deleted).toEqual([]);
    await expect(stat(filePath)).resolves.toBeDefined();
  });

  it('does not run obsolete sync when Twitch archive fetch fails', async () => {
    const paths = await createTempPaths();
    const { service, twitchService } = createService({
      HIGHLIGHT_WORKER_TEMP_DIR: paths.tempRoot,
    });
    useTempPaths(service, paths);
    twitchService.getAllArchiveVideosByLogin.mockRejectedValue(
      new Error('Twitch API failed'),
    );
    twitchService.getStreamByLogin.mockResolvedValue(null);
    const sync = jest.spyOn(service, 'syncObsoleteAnalysisJson');

    await expect(service.run()).rejects.toThrow('Twitch API failed');
    expect(sync).not.toHaveBeenCalled();
  });

  it('continues processing when obsolete delete reports a warning', async () => {
    const paths = await createTempPaths();
    const { service, twitchService } = createService({
      HIGHLIGHT_WORKER_TEMP_DIR: paths.tempRoot,
    });
    useTempPaths(service, paths);
    twitchService.getAllArchiveVideosByLogin.mockResolvedValue([
      createVideo({ id: 'vod-1' }),
    ]);
    twitchService.getStreamByLogin.mockResolvedValue(null);
    jest.spyOn(service, 'syncObsoleteAnalysisJson').mockResolvedValue({
      local: ['old.json'],
      obsolete: ['old.json'],
      deleted: [],
      warnings: [{ filePath: 'old.json', reason: 'delete failed' }],
    });
    const processVod = jest
      .spyOn(service, 'processVod')
      .mockResolvedValue({});

    const summary = await service.run();

    expect(processVod).toHaveBeenCalled();
    expect(summary.obsoleteDeleteWarnings).toEqual([
      { filePath: 'old.json', reason: 'delete failed' },
    ]);
  });

  it('keeps local VOD JSON when archive list is normally empty but local analyses exist', async () => {
    const paths = await createTempPaths();
    const { service } = createService();
    const filePath = join(paths.analyzerOutputDir, '333.json');

    await mkdir(paths.analyzerOutputDir, { recursive: true });
    await writeFile(filePath, JSON.stringify({ vodId: '333', momentCandidates: [] }));

    const result = await service.syncObsoleteAnalysisJson(
      new Set(),
      paths.analyzerOutputDir,
      false,
    );

    expect(result.obsolete).toEqual([filePath]);
    expect(result.deleted).toEqual([]);
    expect(result.warnings).toHaveLength(1);
    await expect(stat(filePath)).resolves.toBeDefined();
  });

  it('does not delete a live-skipped archive analysis because it still exists on Twitch', async () => {
    const paths = await createTempPaths();
    const { service } = createService();
    const filePath = join(paths.analyzerOutputDir, '333.json');

    await mkdir(paths.analyzerOutputDir, { recursive: true });
    await writeFile(filePath, JSON.stringify({ vodId: '333', momentCandidates: [] }));

    const result = await service.syncObsoleteAnalysisJson(
      new Set(['333']),
      paths.analyzerOutputDir,
      false,
    );

    expect(result.obsolete).toEqual([]);
    await expect(stat(filePath)).resolves.toBeDefined();
  });

  it('returns success when all archives are already analyzed', async () => {
    const paths = await createTempPaths();
    const { service, twitchService } = createService({
      HIGHLIGHT_WORKER_TEMP_DIR: paths.tempRoot,
    });
    useTempPaths(service, paths);
    await mkdir(paths.analyzerOutputDir, { recursive: true });
    await writeFile(
      join(paths.analyzerOutputDir, 'vod-1.json'),
      JSON.stringify({ vodId: 'vod-1', momentCandidates: [] }),
    );
    twitchService.getAllArchiveVideosByLogin.mockResolvedValue([
      createVideo({ id: 'vod-1' }),
    ]);
    twitchService.getStreamByLogin.mockResolvedValue(null);

    const summary = await service.run();

    expect(summary.target).toBe(0);
    expect(summary.failed).toEqual([]);
  });

  it('returns success when Twitch has no archives', async () => {
    const paths = await createTempPaths();
    const { service, twitchService } = createService({
      HIGHLIGHT_WORKER_TEMP_DIR: paths.tempRoot,
    });
    useTempPaths(service, paths);
    twitchService.getAllArchiveVideosByLogin.mockResolvedValue([]);
    twitchService.getStreamByLogin.mockResolvedValue(null);

    const summary = await service.run();

    expect(summary.twitchArchives).toBe(0);
    expect(summary.failed).toEqual([]);
  });

  it('does not treat an old lock as stale while its pid is alive', async () => {
    const paths = await createTempPaths();
    const { service } = createService({
      HIGHLIGHT_WORKER_LOCK_MAX_AGE_HOURS: '0.001',
    });
    const lockPath = join(paths.tempRoot, '.worker.lock');

    await mkdir(paths.tempRoot, { recursive: true });
    await writeFile(lockPath, JSON.stringify({ pid: process.pid }));
    const oldTime = new Date(Date.now() - 60 * 60 * 1000);
    await utimes(lockPath, oldTime, oldTime);

    await expect(service.acquireLock(lockPath)).resolves.toBe(false);
  });
});
