import { Module } from '@nestjs/common';
import { FeedbackController } from './feedback.controller';
import { FeedbackStorageService } from './feedback-storage.service';
import { FeedbackService } from './feedback.service';

@Module({
  controllers: [FeedbackController],
  providers: [FeedbackService, FeedbackStorageService],
})
export class FeedbackModule {}
