import { Module } from '@nestjs/common';
import { TwitchModule } from '../twitch/twitch.module';
import { HighlightAnalysisLoader } from './highlight-analysis.loader';
import { HighlightWorkerService } from './highlight-worker.service';
import { HighlightsController } from './highlights.controller';
import { HighlightsService } from './highlights.service';

@Module({
  imports: [TwitchModule],
  controllers: [HighlightsController],
  providers: [HighlightAnalysisLoader, HighlightsService, HighlightWorkerService],
  exports: [HighlightWorkerService],
})
export class HighlightsModule {}
