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
    twitchServiceMock.getClipsByLogin.mockResolvedValue(clips);

    const result = await controller.getClips('inumamiya');

    expect(result).toEqual({ clips });
    expect(twitchServiceMock.getClipsByLogin).toHaveBeenCalledWith('inumamiya');
  });

  it('should return videos from the Twitch service', async () => {
    const videos = [{ id: 'video1', url: 'https://www.twitch.tv/videos/video1' }];
    twitchServiceMock.getVideosByLogin.mockResolvedValue(videos);

    const result = await controller.getVideos('inumamiya');

    expect(result).toEqual({ videos });
    expect(twitchServiceMock.getVideosByLogin).toHaveBeenCalledWith('inumamiya');
  });
});
