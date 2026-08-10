import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { TwitchService } from './twitch.service';

describe('TwitchService', () => {
  let service: TwitchService;

  const configServiceMock = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TwitchService,
        {
          provide: ConfigService,
          useValue: configServiceMock,
        },
      ],
    }).compile();

    service = module.get<TwitchService>(TwitchService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
