import { Test, TestingModule } from '@nestjs/testing';
import { TwitchController } from './twitch.controller';
import { TwitchService } from './twitch.service';

describe('TwitchController', () => {
  let controller: TwitchController;

  const twitchServiceMock = {
    getAppAccessToken: jest.fn(),
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
});
