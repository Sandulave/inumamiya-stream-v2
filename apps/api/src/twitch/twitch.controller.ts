import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
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

  @Get('users/:login')
  async getUser(@Param('login') login: string) {
    const user = await this.twitchService.getUserByLogin(login);

    if (!user) {
      throw new NotFoundException('Twitchユーザーが見つかりません');
    }

    return user;
  }

  @Get('streams/:login')
  async getStream(@Param('login') login: string) {
    const stream = await this.twitchService.getStreamByLogin(login);

    return {
      isLive: stream !== null,
      stream,
    };
  }

  @Get('clips/:login')
  async getClips(@Param('login') login: string) {
    const clips = await this.twitchService.getClipsByLogin(login);

    return {
      clips,
    };
  }
}
