import { Controller, Get, Param, Query } from '@nestjs/common';
import { HighlightsService } from './highlights.service';

@Controller('highlights')
export class HighlightsController {
  constructor(private readonly highlightsService: HighlightsService) {}

  @Get('vods/:vodId/moments')
  async getVodMoments(
    @Param('vodId') vodId: string,
    @Query('sort') sort?: string,
    @Query('minAudioStars') minAudioStars?: string,
    @Query('minChatStars') minChatStars?: string,
    @Query('hasClips') hasClips?: string,
  ) {
    return this.highlightsService.getVodMoments(vodId, {
      sort: this.highlightsService.parseSort(sort),
      minAudioStars: this.highlightsService.parseStars(
        minAudioStars,
        'minAudioStars',
      ),
      minChatStars: this.highlightsService.parseStars(
        minChatStars,
        'minChatStars',
      ),
      hasClips: this.highlightsService.parseHasClips(hasClips),
    });
  }
}
