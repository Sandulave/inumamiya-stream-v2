import { Test, TestingModule } from '@nestjs/testing';
import { HighlightAnalysisLoader } from './highlight-analysis.loader';
import { HighlightsService } from './highlights.service';
import { TwitchService } from '../twitch/twitch.service';
import { HighlightAnalysis } from './highlight-analysis.types';
import { AppTwitchClip } from '../twitch/twitch.service';

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

  beforeEach(async () => {
    jest.clearAllMocks();
    analysisLoaderMock.findByVodId.mockResolvedValue(createAnalysis());
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
});
