import { InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, mkdtemp, readFile, stat, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { HighlightStorageService } from './highlight-storage.service';

type MockS3Command = {
  input: Record<string, unknown>;
};

function createConfig(env: Record<string, string | undefined> = {}) {
  return {
    get: jest.fn((key: string) => env[key]),
  } as unknown as ConfigService;
}

function createAnalysis(vodId = '123') {
  return JSON.stringify({
    vodId,
    momentCandidates: [
      {
        timestampSeconds: 10,
        timestamp: '00:00:10',
        audioScore: 50,
        chatScore: 20,
      },
    ],
  });
}

function createR2Env() {
  return {
    R2_ENDPOINT: 'https://example.r2.cloudflarestorage.com',
    R2_ACCESS_KEY_ID: 'test-access-key',
    R2_SECRET_ACCESS_KEY: 'test-secret-key',
    R2_BUCKET: 'test-bucket',
  };
}

function attachMockS3(service: HighlightStorageService, send: jest.Mock) {
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

describe('HighlightStorageService', () => {
  it('uses local storage when R2 env is absent', async () => {
    const root = await mkdtemp(join(tmpdir(), 'highlight-storage-'));
    const service = new HighlightStorageService(
      createConfig({ HIGHLIGHT_ANALYSIS_DIR: root }),
    );
    await writeFile(join(root, '123.json'), createAnalysis('123'));

    expect(service.isR2Enabled()).toBe(false);
    await expect(service.getAnalysis('123')).resolves.toMatchObject({
      vodId: '123',
    });
    await expect(service.getAnalysis('999')).resolves.toBeNull();
  });

  it('throws when only part of the R2 env is configured', () => {
    const service = new HighlightStorageService(
      createConfig({ R2_ENDPOINT: 'https://example.invalid' }),
    );

    expect(() => service.isR2Enabled()).toThrow(InternalServerErrorException);
  });

  it('gets analysis JSON from R2', async () => {
    const service = new HighlightStorageService(createConfig(createR2Env()));
    const send = jest.fn().mockResolvedValue({
      Body: { transformToString: () => Promise.resolve(createAnalysis('123')) },
    });
    attachMockS3(service, send);

    await expect(service.getAnalysis('123')).resolves.toMatchObject({
      vodId: '123',
    });
    expect(getCommandInput(send, 0)).toMatchObject({
      Bucket: 'test-bucket',
      Key: 'highlights/123/result.json',
    });
  });

  it('returns null for missing R2 object', async () => {
    const service = new HighlightStorageService(createConfig(createR2Env()));
    const send = jest.fn().mockRejectedValue({
      name: 'NoSuchKey',
      $metadata: { httpStatusCode: 404 },
    });
    attachMockS3(service, send);

    await expect(service.getAnalysis('123')).resolves.toBeNull();
  });

  it('does not hide R2 service errors as missing analysis', async () => {
    const service = new HighlightStorageService(createConfig(createR2Env()));
    const send = jest.fn().mockRejectedValue(new Error('R2 unavailable'));
    attachMockS3(service, send);

    await expect(service.getAnalysis('123')).rejects.toThrow(
      InternalServerErrorException,
    );
  });

  it('puts validated analysis JSON to R2', async () => {
    const service = new HighlightStorageService(createConfig(createR2Env()));
    const send = jest.fn().mockResolvedValue({});
    attachMockS3(service, send);

    await expect(
      service.putAnalysisJsonToR2('123', createAnalysis('123')),
    ).resolves.toBe('highlights/123/result.json');
    expect(getCommandInput(send, 0)).toMatchObject({
      Bucket: 'test-bucket',
      Key: 'highlights/123/result.json',
      ContentType: 'application/json; charset=utf-8',
    });
  });

  it('fails R2 put when upload fails', async () => {
    const service = new HighlightStorageService(createConfig(createR2Env()));
    const send = jest.fn().mockRejectedValue(new Error('put failed'));
    attachMockS3(service, send);

    await expect(
      service.putAnalysisJsonToR2('123', createAnalysis('123')),
    ).rejects.toThrow(InternalServerErrorException);
  });

  it('lists paginated R2 analyses and only extracts numeric VOD result objects', async () => {
    const service = new HighlightStorageService(createConfig(createR2Env()));
    const send = jest
      .fn()
      .mockResolvedValueOnce({
        IsTruncated: true,
        NextContinuationToken: 'next',
        Contents: [
          { Key: 'highlights/123/result.json' },
          { Key: 'highlights/123/thumbnails/10.webp' },
          { Key: 'highlights/abc/result.json' },
          { Key: 'highlights/456/metadata.json' },
        ],
      })
      .mockResolvedValueOnce({
        IsTruncated: false,
        Contents: [{ Key: 'highlights/456/result.json' }],
      });
    attachMockS3(service, send);

    await expect(service.listAnalysisRefs()).resolves.toEqual([
      { vodId: '123', ref: 'highlights/123/result.json' },
      { vodId: '456', ref: 'highlights/456/result.json' },
    ]);
    expect(send).toHaveBeenCalledTimes(2);
    expect(getCommandInput(send, 1)).toMatchObject({
      ContinuationToken: 'next',
    });
  });

  it('deletes R2 analysis prefix contents', async () => {
    const service = new HighlightStorageService(createConfig(createR2Env()));
    const send = jest
      .fn()
      .mockResolvedValueOnce({
        IsTruncated: false,
        Contents: [
          { Key: 'highlights/123/result.json' },
          { Key: 'highlights/123/thumbnails/10.webp' },
        ],
      })
      .mockResolvedValueOnce({});
    attachMockS3(service, send);

    await expect(service.deleteAnalysis('123')).resolves.toEqual([
      'highlights/123/result.json',
      'highlights/123/thumbnails/10.webp',
    ]);
    expect(getCommandInput(send, 1)).toMatchObject({
      Delete: {
        Objects: [
          { Key: 'highlights/123/result.json' },
          { Key: 'highlights/123/thumbnails/10.webp' },
        ],
      },
    });
  });

  it('collects local upload candidates and skips invalid files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'highlight-storage-'));
    const service = new HighlightStorageService(
      createConfig({ HIGHLIGHT_ANALYSIS_DIR: root }),
    );
    await mkdir(root, { recursive: true });
    await writeFile(join(root, '123.json'), createAnalysis('123'));
    await writeFile(join(root, '456.json'), createAnalysis('999'));
    await writeFile(join(root, 'highlights.json'), createAnalysis('789'));

    const result = await service.collectLocalUploadCandidates();

    expect(result.valid.map((candidate) => candidate.vodId)).toEqual(['123']);
    expect(result.invalid).toHaveLength(1);
  });

  it('writes local analysis atomically when R2 is disabled', async () => {
    const root = await mkdtemp(join(tmpdir(), 'highlight-storage-'));
    const service = new HighlightStorageService(
      createConfig({ HIGHLIGHT_ANALYSIS_DIR: root }),
    );

    const finalPath = await service.putAnalysisJson(
      '123',
      createAnalysis('123'),
    );

    expect(finalPath).toBe(join(root, '123.json'));
    await expect(readFile(finalPath, 'utf8')).resolves.toContain(
      '"vodId":"123"',
    );
    await expect(stat(join(root, '123.json.tmp'))).rejects.toThrow();
  });
});
