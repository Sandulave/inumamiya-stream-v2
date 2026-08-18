import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'child_process';
import { HighlightChapter } from './highlight-analysis.types';

type RawChapterNode = {
  durationMilliseconds?: unknown;
  positionMilliseconds?: unknown;
  type?: unknown;
  description?: unknown;
  subDescription?: unknown;
  thumbnailURL?: unknown;
  details?: {
    game?: {
      id?: unknown;
      displayName?: unknown;
      boxArtURL?: unknown;
    };
  };
};

@Injectable()
export class HighlightChaptersService {
  constructor(private readonly configService: ConfigService) {}

  async getChapters(
    vodId: string,
    durationSeconds: number | undefined,
  ): Promise<HighlightChapter[]> {
    const raw = await this.runTwitchDownloaderInfo(vodId);

    return parseTwitchDownloaderChapters(raw, durationSeconds);
  }

  private runTwitchDownloaderInfo(vodId: string): Promise<string> {
    const executable =
      this.configService.get<string>('TWITCH_DOWNLOADER_CLI') ??
      (process.platform === 'win32'
        ? 'TwitchDownloaderCLI.exe'
        : 'TwitchDownloaderCLI');
    const args = [
      'info',
      '--id',
      vodId,
      '--format',
      'Raw',
      '--banner',
      'false',
    ];

    return new Promise((resolvePromise, reject) => {
      const child = spawn(executable, args, {
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
      });
      let stdout = '';
      let stderr = '';

      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk) => {
        stdout += chunk;
      });
      child.stderr.on('data', (chunk) => {
        stderr += chunk;
      });
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) {
          resolvePromise(stdout);
          return;
        }

        reject(
          new Error(
            `TwitchDownloader info exited with code ${code}: ${stderr.trim()}`,
          ),
        );
      });
    });
  }
}

export function parseTwitchDownloaderChapters(
  raw: string,
  durationSeconds: number | undefined,
): HighlightChapter[] {
  const payloads = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('{'))
    .map(parseJsonLine)
    .filter(isRecord);
  const rawNodes: RawChapterNode[] = [];

  for (const payload of payloads) {
    const edges = getNestedValue(payload, [
      'data',
      'video',
      'moments',
      'edges',
    ]);

    if (!Array.isArray(edges)) {
      continue;
    }

    for (const edge of edges) {
      const node = isRecord(edge) ? edge.node : undefined;

      if (isRecord(node)) {
        rawNodes.push(node as RawChapterNode);
      }
    }
  }

  return normalizeChapterNodes(rawNodes, durationSeconds);
}

export function normalizeChapterNodes(
  nodes: RawChapterNode[],
  durationSeconds: number | undefined,
): HighlightChapter[] {
  const archiveDuration = parseDurationSeconds(durationSeconds);
  const sorted = nodes
    .map((node) => createChapterDraft(node))
    .filter((chapter): chapter is ChapterDraft => chapter !== null)
    .sort((a, b) => a.startSeconds - b.startSeconds);
  const chapters: HighlightChapter[] = [];

  for (const [index, draft] of sorted.entries()) {
    const nextStart = sorted[index + 1]?.startSeconds;
    const unclampedEnd =
      nextStart !== undefined
        ? nextStart
        : draft.durationSeconds !== undefined
          ? draft.startSeconds + draft.durationSeconds
          : archiveDuration;

    if (unclampedEnd === undefined) {
      continue;
    }

    const startSeconds = clampSeconds(draft.startSeconds, archiveDuration);
    const endSeconds = clampSeconds(unclampedEnd, archiveDuration);

    if (endSeconds <= startSeconds) {
      continue;
    }

    chapters.push({
      startSeconds,
      endSeconds,
      durationSeconds: roundSeconds(endSeconds - startSeconds),
      categoryName: draft.categoryName,
      ...(draft.gameName ? { gameName: draft.gameName } : {}),
      ...(draft.gameId ? { gameId: draft.gameId } : {}),
      ...(draft.type ? { type: draft.type } : {}),
      ...(draft.title ? { title: draft.title } : {}),
      ...(draft.thumbnailUrl ? { thumbnailUrl: draft.thumbnailUrl } : {}),
    });
  }

  return mergeAdjacentChapters(chapters);
}

type ChapterDraft = {
  startSeconds: number;
  durationSeconds?: number;
  categoryName: string;
  gameName?: string;
  gameId?: string;
  type?: string;
  title?: string;
  thumbnailUrl?: string;
};

function createChapterDraft(node: RawChapterNode): ChapterDraft | null {
  const startSeconds = millisecondsToSeconds(node.positionMilliseconds);

  if (startSeconds === null) {
    return null;
  }

  const game = isRecord(node.details?.game) ? node.details.game : undefined;
  const gameName = getString(game?.displayName);
  const description = getString(node.description);
  const subDescription = getString(node.subDescription);
  const categoryName = gameName ?? description ?? subDescription;

  if (!categoryName) {
    return null;
  }

  return {
    startSeconds,
    durationSeconds: millisecondsToSeconds(node.durationMilliseconds) ?? undefined,
    categoryName,
    ...(gameName ? { gameName } : {}),
    ...(getString(game?.id) ? { gameId: getString(game?.id) } : {}),
    ...(getString(node.type) ? { type: getString(node.type) } : {}),
    ...(description ? { title: description } : {}),
    ...(getString(game?.boxArtURL) || getString(node.thumbnailURL)
      ? { thumbnailUrl: getString(game?.boxArtURL) ?? getString(node.thumbnailURL) }
      : {}),
  };
}

function mergeAdjacentChapters(chapters: HighlightChapter[]): HighlightChapter[] {
  const merged: HighlightChapter[] = [];

  for (const chapter of chapters) {
    const previous = merged.at(-1);

    if (
      previous &&
      previous.categoryName === chapter.categoryName &&
      previous.gameId === chapter.gameId &&
      previous.type === chapter.type &&
      previous.endSeconds === chapter.startSeconds
    ) {
      previous.endSeconds = chapter.endSeconds;
      previous.durationSeconds = roundSeconds(
        previous.endSeconds - previous.startSeconds,
      );
      continue;
    }

    merged.push({ ...chapter });
  }

  return merged;
}

function parseJsonLine(line: string): unknown {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function getNestedValue(
  value: Record<string, unknown>,
  path: string[],
): unknown {
  let current: unknown = value;

  for (const key of path) {
    if (!isRecord(current)) {
      return undefined;
    }

    current = current[key];
  }

  return current;
}

function millisecondsToSeconds(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  return roundSeconds(Math.max(0, value / 1000));
}

function parseDurationSeconds(value: number | undefined): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }

  return roundSeconds(value);
}

function clampSeconds(value: number, durationSeconds: number | undefined): number {
  const nonNegative = Math.max(0, value);

  if (durationSeconds === undefined) {
    return roundSeconds(nonNegative);
  }

  return roundSeconds(Math.min(nonNegative, durationSeconds));
}

function roundSeconds(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function getString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== ''
    ? value.trim()
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
