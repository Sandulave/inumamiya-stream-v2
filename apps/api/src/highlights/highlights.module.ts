import { Module } from '@nestjs/common';
import { TwitchModule } from '../twitch/twitch.module';
import { HighlightAnalysisLoader } from './highlight-analysis.loader';
import { HighlightChaptersService } from './highlight-chapters.service';
import { HighlightStorageService } from './highlight-storage.service';
import { HighlightWorkerService } from './highlight-worker.service';
import { HighlightsController } from './highlights.controller';
import { HighlightsService } from './highlights.service';

@Module({
  imports: [TwitchModule],
  controllers: [HighlightsController],
  providers: [
    HighlightAnalysisLoader,
    HighlightChaptersService,
    HighlightStorageService,
    HighlightsService,
    HighlightWorkerService,
  ],
  exports: [HighlightStorageService, HighlightWorkerService],
})
export class HighlightsModule {}
