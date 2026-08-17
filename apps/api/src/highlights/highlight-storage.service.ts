import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Dirent } from 'fs';
import { statSync } from 'fs';
import {
  mkdir,
  readFile,
  readdir,
  rename,
  unlink,
  writeFile,
} from 'fs/promises';
import { dirname, join, resolve } from 'path';
import { HighlightAnalysis } from './highlight-analysis.types';
import { parseHighlightAnalysisJson } from './highlight-analysis.validation';

type R2Config = {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
};

export type AnalysisRef = {
  vodId: string;
  ref: string;
};

export type LocalAnalysisCandidate = {
  vodId: string;
  filePath: string;
  raw: string;
  analysis: HighlightAnalysis;
};

export type LocalAnalysisInvalidFile = {
  filePath: string;
  reason: string;
};

@Injectable()
export class HighlightStorageService {
  private s3Client: S3Client | null = null;

  constructor(private readonly configService: ConfigService) {}

  getAnalysisObjectKey(vodId: string): string {
    return `highlights/${vodId}/result.json`;
  }

  getAnalysisPrefix(vodId: string): string {
    return `highlights/${vodId}/`;
  }

  isR2Enabled(): boolean {
    return this.getR2ConfigOrNull() !== null;
  }

  getLocalAnalysisDirectory(): string {
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

  async getAnalysis(
    vodId: string,
    localDirectory = this.getLocalAnalysisDirectory(),
  ): Promise<HighlightAnalysis | null> {
    if (this.isR2Enabled()) {
      return this.getR2Analysis(vodId);
    }

    return this.getLocalAnalysis(vodId, localDirectory);
  }

  async hasAnalysis(
    vodId: string,
    localDirectory = this.getLocalAnalysisDirectory(),
  ): Promise<boolean> {
    if (this.isR2Enabled()) {
      return (await this.getR2Analysis(vodId)) !== null;
    }

    try {
      return (await this.getLocalAnalysis(vodId, localDirectory)) !== null;
    } catch {
      return false;
    }
  }

  async putAnalysisJson(
    vodId: string,
    raw: string,
    localDirectory = this.getLocalAnalysisDirectory(),
  ): Promise<string> {
    parseHighlightAnalysisJson(raw, this.describeAnalysisRef(vodId), vodId);

    if (this.isR2Enabled()) {
      return this.putR2AnalysisJson(vodId, raw);
    }

    return this.putLocalAnalysisJson(vodId, raw, localDirectory);
  }

  async putAnalysisJsonToR2(vodId: string, raw: string): Promise<string> {
    parseHighlightAnalysisJson(raw, this.getAnalysisObjectKey(vodId), vodId);

    return this.putR2AnalysisJson(vodId, raw);
  }

  async listAnalysisRefs(
    localDirectory = this.getLocalAnalysisDirectory(),
  ): Promise<AnalysisRef[]> {
    if (this.isR2Enabled()) {
      return this.listR2AnalysisRefs();
    }

    return this.listLocalAnalysisRefs(localDirectory);
  }

  async deleteAnalysis(
    vodId: string,
    localDirectory = this.getLocalAnalysisDirectory(),
  ): Promise<string[]> {
    if (this.isR2Enabled()) {
      return this.deleteR2AnalysisPrefix(vodId);
    }

    const filePath = join(localDirectory, `${vodId}.json`);
    await unlink(filePath);

    return [filePath];
  }

  async collectLocalUploadCandidates(
    localDirectory = this.getLocalAnalysisDirectory(),
  ): Promise<{
    valid: LocalAnalysisCandidate[];
    invalid: LocalAnalysisInvalidFile[];
  }> {
    const entries = await this.readLocalEntries(localDirectory);
    const valid: LocalAnalysisCandidate[] = [];
    const invalid: LocalAnalysisInvalidFile[] = [];

    for (const entry of entries) {
      if (!entry.isFile() || !/^\d+\.json$/.test(entry.name)) {
        continue;
      }

      const vodId = entry.name.replace(/\.json$/, '');
      const filePath = join(localDirectory, entry.name);

      try {
        const raw = await readFile(filePath, 'utf8');
        const analysis = parseHighlightAnalysisJson(raw, filePath, vodId);
        valid.push({ vodId, filePath, raw, analysis });
      } catch (error) {
        invalid.push({
          filePath,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return { valid, invalid };
  }

  private async getLocalAnalysis(
    vodId: string,
    localDirectory: string,
  ): Promise<HighlightAnalysis | null> {
    const filePath = join(localDirectory, `${vodId}.json`);

    try {
      const raw = await readFile(filePath, 'utf8');

      return parseHighlightAnalysisJson(raw, filePath, vodId);
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        return null;
      }

      throw error;
    }
  }

  private async putLocalAnalysisJson(
    vodId: string,
    raw: string,
    localDirectory: string,
  ): Promise<string> {
    await mkdir(localDirectory, { recursive: true });

    const finalPath = join(localDirectory, `${vodId}.json`);
    const tempFinalPath = join(localDirectory, `${vodId}.json.tmp`);

    await writeFile(tempFinalPath, raw);
    await rename(tempFinalPath, finalPath);

    return finalPath;
  }

  private async listLocalAnalysisRefs(
    localDirectory: string,
  ): Promise<AnalysisRef[]> {
    const entries = await this.readLocalEntries(localDirectory);
    const refs: AnalysisRef[] = [];

    for (const entry of entries) {
      if (!entry.isFile() || !/^\d+\.json$/.test(entry.name)) {
        continue;
      }

      const vodId = entry.name.replace(/\.json$/, '');
      const filePath = join(localDirectory, entry.name);

      try {
        parseHighlightAnalysisJson(
          await readFile(filePath, 'utf8'),
          filePath,
          vodId,
        );
        refs.push({ vodId, ref: filePath });
      } catch {
        // Invalid local files are ignored for completion/obsolete decisions.
      }
    }

    return refs;
  }

  private async readLocalEntries(localDirectory: string): Promise<Dirent[]> {
    try {
      return await readdir(localDirectory, { withFileTypes: true });
    } catch {
      return [];
    }
  }

  private async getR2Analysis(
    vodId: string,
  ): Promise<HighlightAnalysis | null> {
    const key = this.getAnalysisObjectKey(vodId);

    try {
      const response = await this.getS3Client().send(
        new GetObjectCommand({
          Bucket: this.getRequiredR2Config().bucket,
          Key: key,
        }),
      );
      const raw = await response.Body?.transformToString();

      if (!raw) {
        throw new InternalServerErrorException(
          `R2 object body was empty: ${key}`,
        );
      }

      return parseHighlightAnalysisJson(raw, key, vodId);
    } catch (error) {
      if (isMissingObjectError(error)) {
        return null;
      }

      throw new InternalServerErrorException(
        `R2 analysis read failed: ${key}`,
        {
          cause: error,
        },
      );
    }
  }

  private async putR2AnalysisJson(vodId: string, raw: string): Promise<string> {
    const key = this.getAnalysisObjectKey(vodId);

    try {
      await this.getS3Client().send(
        new PutObjectCommand({
          Bucket: this.getRequiredR2Config().bucket,
          Key: key,
          Body: raw,
          ContentType: 'application/json; charset=utf-8',
        }),
      );
    } catch (error) {
      throw new InternalServerErrorException(
        `R2 analysis upload failed: ${key}`,
        {
          cause: error,
        },
      );
    }

    return key;
  }

  private async listR2AnalysisRefs(): Promise<AnalysisRef[]> {
    const config = this.getRequiredR2Config();
    const refs = new Map<string, AnalysisRef>();
    let continuationToken: string | undefined;

    do {
      const response = await this.getS3Client().send(
        new ListObjectsV2Command({
          Bucket: config.bucket,
          Prefix: 'highlights/',
          ContinuationToken: continuationToken,
        }),
      );

      for (const object of response.Contents ?? []) {
        const key = object.Key;

        if (typeof key !== 'string') {
          continue;
        }

        const match = key.match(/^highlights\/(\d+)\/result\.json$/);

        if (match) {
          refs.set(match[1], { vodId: match[1], ref: key });
        }
      }

      continuationToken = response.IsTruncated
        ? response.NextContinuationToken
        : undefined;
    } while (continuationToken);

    return [...refs.values()].sort((a, b) => a.vodId.localeCompare(b.vodId));
  }

  private async deleteR2AnalysisPrefix(vodId: string): Promise<string[]> {
    const config = this.getRequiredR2Config();
    const prefix = this.getAnalysisPrefix(vodId);
    const deleted: string[] = [];
    let continuationToken: string | undefined;

    do {
      const response = await this.getS3Client().send(
        new ListObjectsV2Command({
          Bucket: config.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );
      const objects = (response.Contents ?? [])
        .map((object) => object.Key)
        .filter((key): key is string => typeof key === 'string');

      for (let index = 0; index < objects.length; index += 1000) {
        const chunk = objects.slice(index, index + 1000);

        if (chunk.length === 0) {
          continue;
        }

        await this.getS3Client().send(
          new DeleteObjectsCommand({
            Bucket: config.bucket,
            Delete: {
              Objects: chunk.map((Key) => ({ Key })),
              Quiet: true,
            },
          }),
        );
        deleted.push(...chunk);
      }

      continuationToken = response.IsTruncated
        ? response.NextContinuationToken
        : undefined;
    } while (continuationToken);

    if (deleted.length === 0) {
      const key = this.getAnalysisObjectKey(vodId);
      await this.getS3Client().send(
        new DeleteObjectsCommand({
          Bucket: config.bucket,
          Delete: { Objects: [{ Key: key }], Quiet: true },
        }),
      );
      deleted.push(key);
    }

    return deleted;
  }

  private getS3Client(): S3Client {
    if (!this.s3Client) {
      const config = this.getRequiredR2Config();
      this.s3Client = new S3Client({
        region: 'auto',
        endpoint: config.endpoint,
        credentials: {
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretAccessKey,
        },
      });
    }

    return this.s3Client;
  }

  private getRequiredR2Config(): R2Config {
    const config = this.getR2ConfigOrNull();

    if (!config) {
      throw new InternalServerErrorException('R2 storage is not configured');
    }

    return config;
  }

  private getR2ConfigOrNull(): R2Config | null {
    const endpoint = this.configService.get<string>('R2_ENDPOINT');
    const accessKeyId = this.configService.get<string>('R2_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>(
      'R2_SECRET_ACCESS_KEY',
    );
    const bucket = this.configService.get<string>('R2_BUCKET');
    const values = [endpoint, accessKeyId, secretAccessKey, bucket];
    const present = values.filter((value) => value && value.trim().length > 0);

    if (present.length === 0) {
      return null;
    }

    if (present.length !== values.length) {
      throw new InternalServerErrorException(
        'R2 storage configuration is incomplete. Set R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET together.',
      );
    }

    return {
      endpoint: endpoint as string,
      accessKeyId: accessKeyId as string,
      secretAccessKey: secretAccessKey as string,
      bucket: bucket as string,
    };
  }

  private describeAnalysisRef(vodId: string): string {
    return this.isR2Enabled()
      ? this.getAnalysisObjectKey(vodId)
      : join(this.getLocalAnalysisDirectory(), `${vodId}.json`);
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

function isMissingObjectError(error: unknown): boolean {
  if (!isRecord(error)) {
    return false;
  }

  const metadata = isRecord(error.$metadata) ? error.$metadata : undefined;

  return (
    error.name === 'NoSuchKey' ||
    error.name === 'NotFound' ||
    metadata?.httpStatusCode === 404
  );
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
