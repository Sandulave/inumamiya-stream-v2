import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Dirent } from 'fs';
import { statSync } from 'fs';
import { readdir, readFile, stat } from 'fs/promises';
import { dirname, join, resolve } from 'path';
import {
  HighlightAnalysis,
  MomentCandidate,
} from './highlight-analysis.types';

type AnalysisCache = {
  directory: string;
  signature: string;
  analysesByVodId: Map<string, HighlightAnalysis>;
};

@Injectable()
export class HighlightAnalysisLoader {
  private cache: AnalysisCache | null = null;

  constructor(private readonly configService: ConfigService) {}

  async findByVodId(vodId: string): Promise<HighlightAnalysis> {
    const analysesByVodId = await this.loadAnalysisIndex();
    const analysis = analysesByVodId.get(vodId);

    if (!analysis) {
      throw new NotFoundException(`Analysis JSON for vodId ${vodId} was not found`);
    }

    return analysis;
  }

  getAnalysisDirectory(): string {
    const configured = this.configService.get<string>('HIGHLIGHT_ANALYSIS_DIR');

    if (configured) {
      return resolve(configured);
    }

    const discovered = this.findDefaultAnalysisDirectory(process.cwd());

    if (discovered) {
      return discovered;
    }

    return resolve(process.cwd(), 'tools', 'highlight-analyzer', 'output');
  }

  private async loadAnalysisIndex(): Promise<Map<string, HighlightAnalysis>> {
    const directory = this.getAnalysisDirectory();
    const entries = await this.readJsonEntries(directory);
    const signature = await this.createDirectorySignature(directory, entries);

    if (
      this.cache &&
      this.cache.directory === directory &&
      this.cache.signature === signature
    ) {
      return this.cache.analysesByVodId;
    }

    const analysesByVodId = new Map<string, HighlightAnalysis>();

    for (const entry of entries) {
      const filePath = join(directory, entry.name);
      const analysis = await this.readAnalysisFile(filePath);
      analysesByVodId.set(analysis.vodId, analysis);
    }

    this.cache = {
      directory,
      signature,
      analysesByVodId,
    };

    return analysesByVodId;
  }

  private async readJsonEntries(directory: string): Promise<Dirent[]> {
    try {
      const entries = await readdir(directory, { withFileTypes: true });

      return entries.filter(
        (entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.json'),
      );
    } catch (error) {
      throw new InternalServerErrorException(
        `Highlight analysis directory cannot be read: ${directory}`,
        { cause: error },
      );
    }
  }

  private async createDirectorySignature(
    directory: string,
    entries: Dirent[],
  ): Promise<string> {
    const parts: string[] = [];

    for (const entry of entries) {
      const filePath = join(directory, entry.name);
      const fileStat = await stat(filePath);
      parts.push(`${entry.name}:${fileStat.mtimeMs}:${fileStat.size}`);
    }

    return parts.sort().join('|');
  }

  private async readAnalysisFile(filePath: string): Promise<HighlightAnalysis> {
    let raw: string;

    try {
      raw = await readFile(filePath, 'utf8');
    } catch (error) {
      throw new InternalServerErrorException(
        `Highlight analysis JSON cannot be read: ${filePath}`,
        { cause: error },
      );
    }

    let parsed: unknown;

    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      throw new InternalServerErrorException(
        `Highlight analysis JSON is invalid: ${filePath}`,
        { cause: error },
      );
    }

    return this.validateAnalysis(parsed, filePath);
  }

  private validateAnalysis(value: unknown, filePath: string): HighlightAnalysis {
    if (!isRecord(value)) {
      throw new InternalServerErrorException(
        `Highlight analysis JSON root must be an object: ${filePath}`,
      );
    }

    if (typeof value.vodId !== 'string' || value.vodId.length === 0) {
      throw new InternalServerErrorException(
        `Highlight analysis JSON must contain string vodId: ${filePath}`,
      );
    }

    if (!Array.isArray(value.momentCandidates)) {
      throw new InternalServerErrorException(
        `Highlight analysis JSON must contain momentCandidates array: ${filePath}`,
      );
    }

    const candidates = value.momentCandidates.map((candidate, index) =>
      this.validateMomentCandidate(candidate, filePath, index),
    );

    return {
      ...value,
      vodId: value.vodId,
      momentCandidates: candidates,
    } as HighlightAnalysis;
  }

  private validateMomentCandidate(
    value: unknown,
    filePath: string,
    index: number,
  ): MomentCandidate {
    if (!isRecord(value)) {
      throw new InternalServerErrorException(
        `momentCandidates[${index}] must be an object: ${filePath}`,
      );
    }

    for (const field of ['timestampSeconds', 'audioScore', 'chatScore']) {
      if (typeof value[field] !== 'number' || !Number.isFinite(value[field])) {
        throw new InternalServerErrorException(
          `momentCandidates[${index}].${field} must be a finite number: ${filePath}`,
        );
      }
    }

    return value as MomentCandidate;
  }

  private findDefaultAnalysisDirectory(startDirectory: string): string | null {
    let current = resolve(startDirectory);

    for (let depth = 0; depth < 6; depth += 1) {
      const candidate = join(current, 'tools', 'highlight-analyzer', 'output');

      try {
        const candidateStat = statSync(candidate);

        if (candidateStat.isDirectory()) {
          return candidate;
        }
      } catch {
        // Keep walking toward the workspace root.
      }

      const parent = dirname(current);

      if (parent === current) {
        break;
      }

      current = parent;
    }

    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
