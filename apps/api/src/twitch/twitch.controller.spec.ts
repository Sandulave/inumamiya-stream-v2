import { Test, TestingModule } from '@nestjs/testing';
import { TwitchController } from './twitch.controller';
import { TwitchService } from './twitch.service';

describe('TwitchController', () => {
  let controller: TwitchController;

  const twitchServiceMock = {
    getAppAccessToken: jest.fn(),
    getUserByLogin: jest.fn(),
    getStreamByLogin: jest.fn(),
    getClipsByLogin: jest.fn(),
    getVideosByLogin: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TwitchController],
      providers: [
        {
          provide: TwitchService,
          useValue: twitchServiceMock,
        },
      ],
    }).compile();

    controller = module.get<TwitchController>(TwitchController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return clips from the Twitch service', async () => {
    const clips = [{ id: 'clip1', url: 'https://clips.twitch.tv/clip1' }];
    twitchServiceMock.getClipsByLogin.mockResolvedValue({
      data: clips,
      pagination: { cursor: 'next-clips' },
      hasMore: true,
      sort: 'views',
    });

    const result = await controller.getClips(
      'inumamiya',
      '6',
      'after-clips',
      'views',
    );

    expect(result).toEqual({
      clips,
      pagination: { cursor: 'next-clips' },
      hasMore: true,
      sort: 'views',
    });
    expect(twitchServiceMock.getClipsByLogin).toHaveBeenCalledWith(
      'inumamiya',
      6,
      'after-clips',
      'views',
    );
  });

  it('should default clips sort to latest', async () => {
    twitchServiceMock.getClipsByLogin.mockResolvedValue({
      data: [],
      pagination: {},
      hasMore: false,
      sort: 'latest',
    });

    await controller.getClips('inumamiya');

    expect(twitchServiceMock.getClipsByLogin).toHaveBeenCalledWith(
      'inumamiya',
      6,
      undefined,
      'latest',
    );
  });

  it('should reject invalid clips sort', async () => {
    await expect(
      controller.getClips('inumamiya', '6', undefined, 'popular'),
    ).rejects.toThrow('sort must be latest or views');
  });

  it('should reject invalid first values', async () => {
    await expect(controller.getClips('inumamiya', '0')).rejects.toThrow(
      'first must be a positive integer',
    );
  });

  it('should return videos from the Twitch service', async () => {
    const videos = [
      { id: 'video1', url: 'https://www.twitch.tv/videos/video1' },
    ];
    twitchServiceMock.getVideosByLogin.mockResolvedValue({
      data: videos,
      pagination: { cursor: 'next-videos' },
      hasMore: true,
      sort: 'views',
    });

    const result = await controller.getVideos(
      'inumamiya',
      '6',
      'after-videos',
      'views',
    );

    expect(result).toEqual({
      videos,
      pagination: { cursor: 'next-videos' },
      hasMore: true,
      sort: 'views',
    });
    expect(twitchServiceMock.getVideosByLogin).toHaveBeenCalledWith(
      'inumamiya',
      6,
      'after-videos',
      'views',
    );
  });
});
