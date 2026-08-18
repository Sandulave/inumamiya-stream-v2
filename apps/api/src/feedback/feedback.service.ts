import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { FeedbackStorageService } from './feedback-storage.service';
import {
  CreateFeedbackInput,
  FeedbackListResponse,
  FeedbackPost,
} from './feedback.types';

const DEFAULT_NAME = '名無しさん';
const MAX_NAME_LENGTH = 30;
const MAX_MESSAGE_LENGTH = 500;

@Injectable()
export class FeedbackService {
  constructor(private readonly storageService: FeedbackStorageService) {}

  async listPosts(): Promise<FeedbackListResponse> {
    return { posts: await this.storageService.listPosts() };
  }

  async createPost(input: CreateFeedbackInput): Promise<FeedbackPost> {
    const now = new Date();
    const post: FeedbackPost = {
      id: this.createPostId(now),
      name: this.normalizeName(input.name),
      message: this.normalizeMessage(input.message),
      createdAt: now.toISOString(),
    };

    await this.storageService.putPost(post);

    return post;
  }

  private normalizeName(value: unknown): string {
    if (value === undefined || value === null) {
      return DEFAULT_NAME;
    }

    if (typeof value !== 'string') {
      throw new BadRequestException('name must be a string');
    }

    const trimmed = value.trim();

    if (trimmed.length === 0) {
      return DEFAULT_NAME;
    }

    if (trimmed.length > MAX_NAME_LENGTH) {
      throw new BadRequestException(
        `name must be ${MAX_NAME_LENGTH} characters or fewer`,
      );
    }

    return trimmed;
  }

  private normalizeMessage(value: unknown): string {
    if (typeof value !== 'string') {
      throw new BadRequestException('message is required');
    }

    const trimmed = value.trim();

    if (trimmed.length === 0) {
      throw new BadRequestException('message is required');
    }

    if (trimmed.length > MAX_MESSAGE_LENGTH) {
      throw new BadRequestException(
        `message must be ${MAX_MESSAGE_LENGTH} characters or fewer`,
      );
    }

    return trimmed;
  }

  private createPostId(date: Date): string {
    return `${date.toISOString().replace(/[:.]/g, '-')}-${randomUUID()}`;
  }
}
