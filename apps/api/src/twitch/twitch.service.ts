import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type TwitchTokenResponse = {
  access_token: string;
  expires_in: number;
  token_type: string;
};

@Injectable()
export class TwitchService {
  constructor(private readonly configService: ConfigService) {}

  async getAppAccessToken(): Promise<string> {
    const clientId = this.configService.get<string>('TWITCH_CLIENT_ID');

    const clientSecret = this.configService.get<string>('TWITCH_CLIENT_SECRET');

    if (!clientId || !clientSecret) {
      throw new Error('Twitch Client ID または Client Secret が未設定です');
    }

    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
    });

    const response = await fetch('https://id.twitch.tv/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });

    if (!response.ok) {
      throw new Error(`Twitch token request failed: ${response.status}`);
    }

    const data = (await response.json()) as TwitchTokenResponse;

    return data.access_token;
  }
}
