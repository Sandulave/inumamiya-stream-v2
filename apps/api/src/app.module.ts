import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HighlightsModule } from './highlights/highlights.module';
import { TwitchModule } from './twitch/twitch.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    HighlightsModule,
    TwitchModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
