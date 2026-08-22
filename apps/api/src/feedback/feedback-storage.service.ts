import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Dirent } from 'fs';
import { mkdir, readFile, readdir, rename, unlink, writeFile } from 'fs/promises';
import { dirname, join, resolve } from 'path';
import { FeedbackPost } from './feedback.types';

type R2Config = {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
};

@Injectable()
export class FeedbackStorageService {
  private s3Client: S3Client | null = null;

  constructor(private readonly configService: ConfigService) {}

  getPostObjectKey(id: string): string {
    return `feedback/posts/${id}.json`;
  }

  isR2Enabled(): boolean {
    return this.getR2ConfigOrNull() !== null;
  }

  getLocalPostDirectory(): string {
    const configured = this.configService.get<string>('FEEDBACK_STORAGE_DIR');

    if (configured) {
      return resolve(configured);
    }

    return resolve(process.cwd(), 'data', 'feedback', 'posts');
  }

  async listPosts(): Promise<FeedbackPost[]> {
    const posts = this.isR2Enabled()
      ? await this.listR2Posts()
      : await this.listLocalPosts();

    return posts
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 50);
  }

  async putPost(post: FeedbackPost): Promise<string> {
    if (this.isR2Enabled()) {
      return this.putR2Post(post);
    }

    return this.putLocalPost(post);
  }

  async deletePost(id: string): Promise<void> {
    if (this.isR2Enabled()) {
      await this.deleteR2Post(id);
      return;
    }

    await this.deleteLocalPost(id);
  }

  private async listLocalPosts(): Promise<FeedbackPost[]> {
    const directory = this.getLocalPostDirectory();
    const entries = await this.readLocalEntries(directory);
    const posts: FeedbackPost[] = [];

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) {
        continue;
      }

      try {
        const raw = await readFile(join(directory, entry.name), 'utf8');
        const post = parseFeedbackPost(raw);

        if (post) {
          posts.push(post);
        }
      } catch {
        // Ignore malformed local files so one bad post cannot break the board.
      }
    }

    return posts;
  }

  private async putLocalPost(post: FeedbackPost): Promise<string> {
    const directory = this.getLocalPostDirectory();
    const filePath = join(directory, `${post.id}.json`);
    const tempPath = `${filePath}.tmp`;

    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(tempPath, JSON.stringify(post, null, 2), 'utf8');
    await rename(tempPath, filePath);

    return filePath;
  }

  private async deleteLocalPost(id: string): Promise<void> {
    const filePath = join(this.getLocalPostDirectory(), `${id}.json`);

    await unlink(filePath).catch((error: unknown) => {
      if (isNodeError(error) && error.code === 'ENOENT') {
        return;
      }

      throw error;
    });
  }

  private async readLocalEntries(directory: string): Promise<Dirent[]> {
    try {
      return await readdir(directory, { withFileTypes: true });
    } catch {
      return [];
    }
  }

  private async listR2Posts(): Promise<FeedbackPost[]> {
    const config = this.getRequiredR2Config();
    const keys: string[] = [];
    let continuationToken: string | undefined;

    do {
      const response = await this.getS3Client().send(
        new ListObjectsV2Command({
          Bucket: config.bucket,
          Prefix: 'feedback/posts/',
          ContinuationToken: continuationToken,
        }),
      );

      for (const object of response.Contents ?? []) {
        const key = object.Key;

        if (typeof key === 'string' && /^feedback\/posts\/.+\.json$/.test(key)) {
          keys.push(key);
        }
      }

      continuationToken = response.IsTruncated
        ? response.NextContinuationToken
        : undefined;
    } while (continuationToken);

    const posts: FeedbackPost[] = [];

    for (const key of keys) {
      const post = await this.getR2Post(key);

      if (post) {
        posts.push(post);
      }
    }

    return posts;
  }

  private async getR2Post(key: string): Promise<FeedbackPost | null> {
    try {
      const response = await this.getS3Client().send(
        new GetObjectCommand({
          Bucket: this.getRequiredR2Config().bucket,
          Key: key,
        }),
      );
      const raw = await response.Body?.transformToString();

      return raw ? parseFeedbackPost(raw) : null;
    } catch (error) {
      if (isMissingObjectError(error)) {
        return null;
      }

      throw new InternalServerErrorException(`R2 feedback read failed: ${key}`, {
        cause: error,
      });
    }
  }

  private async putR2Post(post: FeedbackPost): Promise<string> {
    const key = this.getPostObjectKey(post.id);

    try {
      await this.getS3Client().send(
        new PutObjectCommand({
          Bucket: this.getRequiredR2Config().bucket,
          Key: key,
          Body: JSON.stringify(post, null, 2),
          ContentType: 'application/json; charset=utf-8',
        }),
      );
    } catch (error) {
      throw new InternalServerErrorException(
        `R2 feedback upload failed: ${key}`,
        { cause: error },
      );
    }

    return key;
  }

  private async deleteR2Post(id: string): Promise<void> {
    const key = this.getPostObjectKey(id);

    try {
      await this.getS3Client().send(
        new DeleteObjectCommand({
          Bucket: this.getRequiredR2Config().bucket,
          Key: key,
        }),
      );
    } catch (error) {
      throw new InternalServerErrorException(
        `R2 feedback delete failed: ${key}`,
        { cause: error },
      );
    }
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
}

function parseFeedbackPost(raw: string): FeedbackPost | null {
  const parsed: unknown = JSON.parse(raw);

  if (!isRecord(parsed)) {
    return null;
  }

  const { id, name, message, createdAt } = parsed;

  if (
    typeof id !== 'string' ||
    typeof name !== 'string' ||
    typeof message !== 'string' ||
    typeof createdAt !== 'string'
  ) {
    return null;
  }

  return { id, name, message, createdAt };
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
