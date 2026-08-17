import { Injectable, NotFoundException } from '@nestjs/common';
import { HighlightAnalysis } from './highlight-analysis.types';
import { HighlightStorageService } from './highlight-storage.service';

@Injectable()
export class HighlightAnalysisLoader {
  constructor(private readonly storageService: HighlightStorageService) {}

  async findByVodId(vodId: string): Promise<HighlightAnalysis> {
    const analysis = await this.storageService.getAnalysis(vodId);

    if (!analysis) {
      throw new NotFoundException(
        `Analysis JSON for vodId ${vodId} was not found`,
      );
    }

    return analysis;
  }
}
