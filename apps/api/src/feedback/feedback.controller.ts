import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { FeedbackService } from './feedback.service';
import type { CreateFeedbackInput } from './feedback.types';

@Controller('feedback')
export class FeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  @Get()
  async listPosts() {
    return this.feedbackService.listPosts();
  }

  @Post()
  async createPost(@Body() body: CreateFeedbackInput) {
    return this.feedbackService.createPost(body);
  }

  @Delete(':id')
  async deletePost(@Param('id') id: string) {
    return this.feedbackService.deletePost(id);
  }
}
