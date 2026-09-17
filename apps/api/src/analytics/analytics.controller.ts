import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  Post,
  Query,
} from '@nestjs/common';
import { AnalyticsService } from './analytics.service';

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Post('login')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  login(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: unknown,
  ) {
    this.analytics.assertAccess(authorization);
    return this.analytics.authenticate(body);
  }

  @Post('pageview')
  @HttpCode(204)
  record(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: unknown,
  ) {
    this.analytics.assertAccess(authorization);
    this.analytics.recordPageView(body);
  }

  @Get('summary')
  @Header('Cache-Control', 'private, no-store')
  summary(
    @Headers('authorization') authorization: string | undefined,
    @Query('days') days?: string,
  ) {
    this.analytics.assertAccess(authorization);
    return this.analytics.summary(days);
  }
}
