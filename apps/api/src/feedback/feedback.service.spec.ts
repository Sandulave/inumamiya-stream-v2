import { BadRequestException } from '@nestjs/common';
import { FeedbackStorageService } from './feedback-storage.service';
import { FeedbackService } from './feedback.service';
import { FeedbackPost } from './feedback.types';

describe('FeedbackService', () => {
  const storageService = {
    listPosts: jest.fn<Promise<FeedbackPost[]>, []>(),
    putPost: jest.fn<Promise<string>, [FeedbackPost]>(),
  } as unknown as jest.Mocked<FeedbackStorageService>;

  let service: FeedbackService;

  beforeEach(() => {
    jest.clearAllMocks();
    storageService.listPosts.mockResolvedValue([]);
    storageService.putPost.mockResolvedValue('feedback/posts/test.json');
    service = new FeedbackService(storageService);
  });

  it('lists posts from storage', async () => {
    const posts = [
      {
        id: 'post-1',
        name: 'name',
        message: 'message',
        createdAt: '2026-08-18T00:00:00.000Z',
      },
    ];
    storageService.listPosts.mockResolvedValue(posts);

    await expect(service.listPosts()).resolves.toEqual({ posts });
  });

  it('creates a trimmed post with an optional name', async () => {
    const post = await service.createPost({
      name: '  お名前  ',
      message: '  こんにちは  ',
    });

    expect(post).toMatchObject({
      name: 'お名前',
      message: 'こんにちは',
    });
    expect(post.id).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(storageService.putPost).toHaveBeenCalledWith(post);
  });

  it('uses the default name when name is blank', async () => {
    const post = await service.createPost({
      name: '   ',
      message: '本文',
    });

    expect(post.name).toBe('名無しさん');
  });

  it('rejects blank messages', async () => {
    await expect(
      service.createPost({ name: 'name', message: '   ' }),
    ).rejects.toThrow(BadRequestException);
    expect(storageService.putPost).not.toHaveBeenCalled();
  });

  it('rejects too long input', async () => {
    await expect(
      service.createPost({ name: 'a'.repeat(31), message: 'body' }),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.createPost({ message: 'a'.repeat(501) }),
    ).rejects.toThrow(BadRequestException);
  });
});
