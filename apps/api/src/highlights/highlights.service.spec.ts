import { Test, TestingModule } from '@nestjs/testing';
import { HighlightAnalysisLoader } from './highlight-analysis.loader';
import { HighlightsService } from './highlights.service';
import { TwitchService } from '../twitch/twitch.service';
import { HighlightAnalysis } from './highlight-analysis.types';
import { AppTwitchClip } from '../twitch/twitch.service';
import { HighlightStorageService } from './highlight-storage.service';

function createAnalysis(): HighlightAnalysis {
  return {
    vodId: '2845096588',
    momentCandidates: [
      {
        timestampSeconds: 120,
        timestamp: '00:02:00',
        audioScore: 85,
        chatScore: 10,
        audioPeakTimestampSeconds: 120,
        chatPeakTimestampSeconds: null,
      },
      {
        timestampSeconds: 240,
        timestamp: '00:04:00',
        audioScore: 20,
        chatScore: 90,
        audioPeakTimestampSeconds: null,
        chatPeakTimestampSeconds: 242,
      },
      {
        timestampSeconds: 360,
        timestamp: '00:06:00',
        audioScore: 40,
        chatScore: 40,
      },
    ],
  };
}

function createClip(overrides: Partial<AppTwitchClip> = {}): AppTwitchClip {
  return {
    id: 'clip-a',
    url: 'https://clips.twitch.tv/clip-a',
    embedUrl: 'https://clips.twitch.tv/embed?clip=clip-a',
    broadcasterId: 'broadcaster',
    broadcasterName: 'いぬまみや',
    creatorId: 'creator',
    creatorName: 'creator',
    videoId: '2845096588',
    title: 'clip title',
    viewCount: 10,
    createdAt: '2026-08-13T00:00:00Z',
    thumbnailUrl: 'https://example.com/thumb.jpg',
    duration: 30,
    vodOffset: 100,
    isFeatured: false,
    ...overrides,
  };
}

describe('HighlightsService', () => {
  let service: HighlightsService;
  const analysisLoaderMock = {
    findByVodId: jest.fn(),
  };
  const twitchServiceMock = {
    getAllClipsByLogin: jest.fn(),
  };
  const storageServiceMock = {
    listThumbnailTimestamps: jest.fn(),
    getThumbnail: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    analysisLoaderMock.findByVodId.mockResolvedValue(createAnalysis());
    storageServiceMock.listThumbnailTimestamps.mockResolvedValue(new Set());
    storageServiceMock.getThumbnail.mockResolvedValue(null);
    twitchServiceMock.getAllClipsByLogin.mockResolvedValue([
      createClip({ id: 'clip-a', vodOffset: 100 }),
      createClip({ id: 'clip-b', videoId: '999', vodOffset: 230 }),
      createClip({ id: 'clip-c', videoId: '', vodOffset: 230 }),
      createClip({ id: 'clip-d', vodOffset: null }),
      createClip({ id: 'clip-e', vodOffset: 225 }),
    ]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HighlightsService,
        {
          provide: HighlightAnalysisLoader,
          useValue: analysisLoaderMock,
        },
        {
          provide: TwitchService,
          useValue: twitchServiceMock,
        },
        {
          provide: HighlightStorageService,
          useValue: storageServiceMock,
        },
      ],
    }).compile();

    service = module.get<HighlightsService>(HighlightsService);
  });

  it('returns moments with stars and matched clips', async () => {
    const result = await service.getVodMoments('2845096588', {
      sort: 'timestamp',
    });

    expect(result.vodId).toBe('2845096588');
    expect(result.momentCount).toBe(3);
    expect(result.moments[0]).toMatchObject({
      timestampSeconds: 120,
      audioStars: 5,
      chatStars: 1,
      clipCount: 1,
    });
    expect(result.moments[1]).toMatchObject({
      timestampSeconds: 240,
      audioStars: 2,
      chatStars: 5,
      clipCount: 1,
    });
  });

  it('sorts by audio, chat, clips, and timestamp', async () => {
    await expect(
      service.getVodMoments('2845096588', { sort: 'audio' }),
    ).resolves.toMatchObject({
      moments: [
        { timestampSeconds: 120 },
        { timestampSeconds: 360 },
        { timestampSeconds: 240 },
      ],
    });

    await expect(
      service.getVodMoments('2845096588', { sort: 'chat' }),
    ).resolves.toMatchObject({
      moments: [
        { timestampSeconds: 240 },
        { timestampSeconds: 360 },
        { timestampSeconds: 120 },
      ],
    });

    await expect(
      service.getVodMoments('2845096588', { sort: 'clips' }),
    ).resolves.toMatchObject({
      moments: [
        { timestampSeconds: 120 },
        { timestampSeconds: 240 },
        { timestampSeconds: 360 },
      ],
    });

    await expect(
      service.getVodMoments('2845096588', { sort: 'timestamp' }),
    ).resolves.toMatchObject({
      moments: [
        { timestampSeconds: 120 },
        { timestampSeconds: 240 },
        { timestampSeconds: 360 },
      ],
    });
  });

  it('filters by min stars and clip presence', async () => {
    await expect(
      service.getVodMoments('2845096588', {
        sort: 'timestamp',
        minAudioStars: 5,
      }),
    ).resolves.toMatchObject({
      moments: [{ timestampSeconds: 120 }],
    });

    await expect(
      service.getVodMoments('2845096588', {
        sort: 'timestamp',
        minChatStars: 5,
      }),
    ).resolves.toMatchObject({
      moments: [{ timestampSeconds: 240 }],
    });

    await expect(
      service.getVodMoments('2845096588', {
        sort: 'timestamp',
        hasClips: true,
      }),
    ).resolves.toMatchObject({
      moments: [{ timestampSeconds: 120 }, { timestampSeconds: 240 }],
    });

    await expect(
      service.getVodMoments('2845096588', {
        sort: 'timestamp',
        hasClips: false,
      }),
    ).resolves.toMatchObject({
      moments: [{ timestampSeconds: 360 }],
    });
  });

  it('rejects invalid query values', () => {
    expect(() => service.parseSort('overall')).toThrow(
      'sort must be timestamp, audio, chat, or clips',
    );
    expect(() => service.parseStars('6', 'minAudioStars')).toThrow(
      'minAudioStars must be an integer from 0 to 5',
    );
    expect(() => service.parseHasClips('yes')).toThrow(
      'hasClips must be true or false',
    );
  });

  it('adds thumbnailUrl only for existing moment thumbnails', async () => {
    storageServiceMock.listThumbnailTimestamps.mockResolvedValue(new Set([120]));

    const result = await service.getVodMoments('2845096588', {
      sort: 'timestamp',
    });

    expect(storageServiceMock.listThumbnailTimestamps).toHaveBeenCalledWith(
      '2845096588',
    );
    expect(result.moments[0]).toMatchObject({
      timestampSeconds: 120,
      thumbnailUrl: '/highlights/vods/2845096588/thumbnails/120',
    });
    expect(result.moments[1].thumbnailUrl).toBeNull();
  });

  it('returns thumbnail bytes for the thumbnail endpoint', async () => {
    const data = Buffer.from('webp');
    storageServiceMock.getThumbnail.mockResolvedValue(data);

    await expect(
      service.getVodThumbnail('2845096588', '120'),
    ).resolves.toBe(data);
    expect(storageServiceMock.getThumbnail).toHaveBeenCalledWith(
      '2845096588',
      120,
    );
  });

  it('returns visualization timeline when present', async () => {
    analysisLoaderMock.findByVodId.mockResolvedValue({
      ...createAnalysis(),
      visualizationTimeline: {
        durationSeconds: 360,
        maxPoints: 1800,
        source: 'timeline.csv',
        points: [
          {
            timestampSeconds: 120,
            audio: {
              level: 80,
              rawDelta: 12,
              peakTimestampSeconds: 120,
            },
            chat: {
              level: 40,
              messageCount10s: 2,
              rawScore: 5,
              peakTimestampSeconds: 121,
            },
          },
        ],
      },
    });

    await expect(service.getVodTimeline('2845096588')).resolves.toEqual({
      vodId: '2845096588',
      durationSeconds: 360,
      points: [
        {
          timestampSeconds: 120,
          audio: {
            level: 80,
            rawDelta: 12,
            peakTimestampSeconds: 120,
          },
          chat: {
            level: 40,
            messageCount10s: 2,
            rawScore: 5,
            peakTimestampSeconds: 121,
          },
        },
      ],
    });
  });

  it('returns chapters when present', async () => {
    analysisLoaderMock.findByVodId.mockResolvedValue({
      ...createAnalysis(),
      durationSeconds: 24874,
      chapters: [
        {
          startSeconds: 0,
          endSeconds: 10740,
          durationSeconds: 10740,
          categoryName: 'Star Fox',
          gameName: 'Star Fox',
          gameId: '123',
        },
        {
          startSeconds: 10740,
          endSeconds: 24874,
          durationSeconds: 14134,
          categoryName: 'Splatoon 3',
          gameName: 'Splatoon 3',
          gameId: '456',
        },
      ],
    });

    await expect(service.getVodChapters('2845096588')).resolves.toEqual({
      vodId: '2845096588',
      durationSeconds: 24874,
      chapters: [
        {
          startSeconds: 0,
          endSeconds: 10740,
          durationSeconds: 10740,
          categoryName: 'Star Fox',
          gameName: 'Star Fox',
          gameId: '123',
        },
        {
          startSeconds: 10740,
          endSeconds: 24874,
          durationSeconds: 14134,
          categoryName: 'Splatoon 3',
          gameName: 'Splatoon 3',
          gameId: '456',
        },
      ],
    });
  });

  it('returns empty chapters for older results without chapter metadata', async () => {
    await expect(service.getVodChapters('2845096588')).resolves.toEqual({
      vodId: '2845096588',
      durationSeconds: 0,
      chapters: [],
    });
  });

  it('returns not found when visualization timeline is absent', async () => {
    await expect(service.getVodTimeline('2845096588')).rejects.toThrow(
      'Timeline for vodId 2845096588 was not found',
    );
  });

  it('rejects missing and invalid thumbnail endpoint requests', async () => {
    storageServiceMock.getThumbnail.mockResolvedValue(null);

    await expect(service.getVodThumbnail('2845096588', '120')).rejects.toThrow(
      'was not found',
    );
    await expect(service.getVodThumbnail('2845096588', '12.5')).rejects.toThrow(
      'timestampSeconds must be a non-negative integer',
    );
  });
});
