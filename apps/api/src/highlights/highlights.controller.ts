import { Controller, Get, Param, Query, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
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

  @Get('vods/:vodId/timeline')
  async getVodTimeline(@Param('vodId') vodId: string) {
    return this.highlightsService.getVodTimeline(vodId);
  }

  @Get('vods/:vodId/chapters')
  async getVodChapters(@Param('vodId') vodId: string) {
    return this.highlightsService.getVodChapters(vodId);
  }

  @Get('vods/:vodId/thumbnails/:timestampSeconds')
  async getVodThumbnail(
    @Param('vodId') vodId: string,
    @Param('timestampSeconds') timestampSeconds: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const thumbnail = await this.highlightsService.getVodThumbnail(
      vodId,
      timestampSeconds,
    );

    response.setHeader('Content-Type', 'image/webp');
    response.setHeader('Cache-Control', 'public, max-age=86400');

    return new StreamableFile(thumbnail);
  }
}
