import { Controller, Get } from '@nestjs/common';
import { TwitchService } from './twitch.service';

@Controller('twitch')
export class TwitchController {
  constructor(private readonly twitchService: TwitchService) {}

  @Get('auth-check')
  async checkAuth() {
    await this.twitchService.getAppAccessToken();

    return {
      authenticated: true,
    };
  }
}
