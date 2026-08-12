import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
} from '@nestjs/common';
import { TwitchService } from './twitch.service';

type SortMode = 'latest' | 'views';

@Controller('twitch')
export class TwitchController {
  constructor(private readonly twitchService: TwitchService) {}

  private parseFirst(first?: string) {
    if (!first) {
      return 6;
    }

    const parsed = Number(first);

    if (!Number.isInteger(parsed) || parsed < 1) {
      throw new BadRequestException('first must be a positive integer');
    }

    return Math.min(parsed, 30);
  }

  private parseSort(sort?: string): SortMode {
    if (!sort || sort === 'latest') {
      return 'latest';
    }

    if (sort === 'views') {
      return 'views';
    }

    throw new BadRequestException('sort must be latest or views');
  }

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
  async getClips(
    @Param('login') login: string,
    @Query('first') first?: string,
    @Query('after') after?: string,
    @Query('sort') sort?: string,
  ) {
    const clipSort = this.parseSort(sort);
    const result = await this.twitchService.getClipsByLogin(
      login,
      this.parseFirst(first),
      after,
      clipSort,
    );

    return {
      clips: result.data,
      pagination: result.pagination,
      hasMore: result.hasMore ?? Boolean(result.pagination.cursor),
      sort: result.sort ?? clipSort,
    };
  }

  @Get('videos/:login')
  async getVideos(
    @Param('login') login: string,
    @Query('first') first?: string,
    @Query('after') after?: string,
    @Query('sort') sort?: string,
  ) {
    const videoSort = this.parseSort(sort);
    const result = await this.twitchService.getVideosByLogin(
      login,
      this.parseFirst(first),
      after,
      videoSort,
    );

    return {
      videos: result.data,
      pagination: result.pagination,
      hasMore: result.hasMore ?? Boolean(result.pagination.cursor),
      sort: result.sort ?? videoSort,
    };
  }
}
