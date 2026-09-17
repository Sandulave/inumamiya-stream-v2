import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AnalyticsModule } from './analytics/analytics.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { FeedbackModule } from './feedback/feedback.module';
import { HighlightsModule } from './highlights/highlights.module';
import { TwitchModule } from './twitch/twitch.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    AnalyticsModule,
    FeedbackModule,
    HighlightsModule,
    TwitchModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
