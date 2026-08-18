import { FeedbackController } from './feedback.controller';
import { FeedbackService } from './feedback.service';
import { FeedbackPost } from './feedback.types';

describe('FeedbackController', () => {
  const post: FeedbackPost = {
    id: 'post-1',
    name: '名無しさん',
    message: 'message',
    createdAt: '2026-08-18T00:00:00.000Z',
  };
  const feedbackService = {
    listPosts: jest.fn<Promise<{ posts: FeedbackPost[] }>, []>(),
    createPost: jest.fn<Promise<FeedbackPost>, [{ name?: string; message: string }]>(),
  } as unknown as jest.Mocked<FeedbackService>;
  const controller = new FeedbackController(feedbackService);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns feedback posts', async () => {
    feedbackService.listPosts.mockResolvedValue({ posts: [post] });

    await expect(controller.listPosts()).resolves.toEqual({ posts: [post] });
  });

  it('creates feedback posts', async () => {
    const body = { name: 'name', message: 'message' };
    feedbackService.createPost.mockResolvedValue(post);

    await expect(controller.createPost(body)).resolves.toBe(post);
    expect(feedbackService.createPost).toHaveBeenCalledWith(body);
  });
});
