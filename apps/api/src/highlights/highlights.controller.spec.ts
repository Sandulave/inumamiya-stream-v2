import { StreamableFile } from '@nestjs/common';
import { HighlightsController } from './highlights.controller';
import { HighlightsService } from './highlights.service';

describe('HighlightsController', () => {
  it('serves thumbnail bytes with webp headers', async () => {
    const data = Buffer.from('webp');
    const highlightsService = {
      getVodThumbnail: jest.fn().mockResolvedValue(data),
      getVodChapters: jest.fn(),
      getVodMoments: jest.fn(),
      getVodTimeline: jest.fn(),
      parseSort: jest.fn(),
      parseStars: jest.fn(),
      parseHasClips: jest.fn(),
    } as unknown as HighlightsService;
    const controller = new HighlightsController(highlightsService);
    const response = {
      setHeader: jest.fn(),
    };

    const result = await controller.getVodThumbnail(
      '2845096588',
      '120',
      response as never,
    );

    expect(result).toBeInstanceOf(StreamableFile);
    expect(response.setHeader).toHaveBeenCalledWith('Content-Type', 'image/webp');
    expect(response.setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'public, max-age=86400',
    );
    expect(highlightsService.getVodThumbnail).toHaveBeenCalledWith(
      '2845096588',
      '120',
    );
  });

  it('returns VOD chapters', async () => {
    const chapters = {
      vodId: '2845096588',
      durationSeconds: 24874,
      chapters: [
        {
          startSeconds: 0,
          endSeconds: 24874,
          durationSeconds: 24874,
          categoryName: 'Super Mario Sunshine',
        },
      ],
    };
    const highlightsService = {
      getVodChapters: jest.fn().mockResolvedValue(chapters),
    } as unknown as HighlightsService;
    const controller = new HighlightsController(highlightsService);

    await expect(controller.getVodChapters('2845096588')).resolves.toBe(
      chapters,
    );
    expect(highlightsService.getVodChapters).toHaveBeenCalledWith('2845096588');
  });
});
