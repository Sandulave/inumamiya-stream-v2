import { InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdtemp, readFile, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { FeedbackStorageService } from './feedback-storage.service';
import { FeedbackPost } from './feedback.types';

type MockS3Command = {
  input: Record<string, unknown>;
};

function createConfig(env: Record<string, string | undefined> = {}) {
  return {
    get: jest.fn((key: string) => env[key]),
  } as unknown as ConfigService;
}

function createR2Env() {
  return {
    R2_ENDPOINT: 'https://example.r2.cloudflarestorage.com',
    R2_ACCESS_KEY_ID: 'test-access-key',
    R2_SECRET_ACCESS_KEY: 'test-secret-key',
    R2_BUCKET: 'test-bucket',
  };
}

function createPost(id: string, createdAt: string): FeedbackPost {
  return {
    id,
    name: '名無しさん',
    message: `message ${id}`,
    createdAt,
  };
}

function attachMockS3(service: FeedbackStorageService, send: jest.Mock) {
  (service as unknown as { s3Client: { send: jest.Mock } }).s3Client = { send };
}

function getCommandInput(
  send: jest.Mock,
  index: number,
): Record<string, unknown> {
  const calls = send.mock.calls as unknown as Array<[MockS3Command]>;
  const command = calls[index]?.[0];

  if (!command) {
    throw new Error(`S3 command was not called at index ${index}`);
  }

  return command.input;
}

describe('FeedbackStorageService', () => {
  it('uses local storage when R2 env is absent', async () => {
    const root = await mkdtemp(join(tmpdir(), 'feedback-storage-'));
    const service = new FeedbackStorageService(
      createConfig({ FEEDBACK_STORAGE_DIR: root }),
    );

    expect(service.isR2Enabled()).toBe(false);
  });

  it('writes and lists local posts newest first', async () => {
    const root = await mkdtemp(join(tmpdir(), 'feedback-storage-'));
    const service = new FeedbackStorageService(
      createConfig({ FEEDBACK_STORAGE_DIR: root }),
    );
    const older = createPost('older', '2026-08-18T00:00:00.000Z');
    const newer = createPost('newer', '2026-08-18T00:01:00.000Z');

    await service.putPost(older);
    await service.putPost(newer);

    await expect(service.listPosts()).resolves.toEqual([newer, older]);
    await expect(readFile(join(root, 'newer.json'), 'utf8')).resolves.toContain(
      '"message": "message newer"',
    );
  });

  it('ignores malformed local post files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'feedback-storage-'));
    const service = new FeedbackStorageService(
      createConfig({ FEEDBACK_STORAGE_DIR: root }),
    );
    await writeFile(join(root, 'bad.json'), '{bad json', 'utf8');

    await expect(service.listPosts()).resolves.toEqual([]);
  });

  it('throws when only part of the R2 env is configured', () => {
    const service = new FeedbackStorageService(
      createConfig({ R2_ENDPOINT: 'https://example.invalid' }),
    );

    expect(() => service.isR2Enabled()).toThrow(InternalServerErrorException);
  });

  it('puts feedback posts to the feedback R2 prefix', async () => {
    const service = new FeedbackStorageService(createConfig(createR2Env()));
    const send = jest.fn().mockResolvedValue({});
    attachMockS3(service, send);

    await expect(
      service.putPost(createPost('abc', '2026-08-18T00:00:00.000Z')),
    ).resolves.toBe('feedback/posts/abc.json');
    expect(getCommandInput(send, 0)).toMatchObject({
      Bucket: 'test-bucket',
      Key: 'feedback/posts/abc.json',
      ContentType: 'application/json; charset=utf-8',
    });
  });

  it('lists R2 posts without touching highlight objects', async () => {
    const service = new FeedbackStorageService(createConfig(createR2Env()));
    const older = createPost('older', '2026-08-18T00:00:00.000Z');
    const newer = createPost('newer', '2026-08-18T00:01:00.000Z');
    const send = jest
      .fn()
      .mockResolvedValueOnce({
        IsTruncated: false,
        Contents: [
          { Key: 'feedback/posts/older.json' },
          { Key: 'feedback/posts/newer.json' },
          { Key: 'highlights/123/result.json' },
        ],
      })
      .mockResolvedValueOnce({
        Body: { transformToString: () => Promise.resolve(JSON.stringify(older)) },
      })
      .mockResolvedValueOnce({
        Body: { transformToString: () => Promise.resolve(JSON.stringify(newer)) },
      });
    attachMockS3(service, send);

    await expect(service.listPosts()).resolves.toEqual([newer, older]);
    expect(getCommandInput(send, 0)).toMatchObject({
      Bucket: 'test-bucket',
      Prefix: 'feedback/posts/',
    });
    expect(send).toHaveBeenCalledTimes(3);
  });
});
