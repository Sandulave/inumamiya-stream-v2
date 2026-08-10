import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type TwitchTokenResponse = {
  access_token: string;
  expires_in: number;
  token_type: string;
};

type TwitchUser = {
  id: string;
  login: string;
  display_name: string;
  broadcaster_type: string;
  description: string;
  profile_image_url: string;
  offline_image_url: string;
  created_at: string;
};

type TwitchUsersResponse = {
  data: TwitchUser[];
};

type TwitchStream = {
  id: string;
  user_id: string;
  user_login: string;
  user_name: string;
  game_id: string;
  game_name: string;
  type: string;
  title: string;
  tags: string[];
  viewer_count: number;
  started_at: string;
  language: string;
  thumbnail_url: string;
  is_mature: boolean;
};

type TwitchStreamsResponse = {
  data: TwitchStream[];
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

  async getUserByLogin(login: string): Promise<TwitchUser | null> {
    const clientId = this.configService.get<string>('TWITCH_CLIENT_ID');

    if (!clientId) {
      throw new Error('Twitch Client ID が未設定です');
    }

    const accessToken = await this.getAppAccessToken();

    const params = new URLSearchParams({
      login,
    });

    const response = await fetch(
      `https://api.twitch.tv/helix/users?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Client-Id': clientId,
        },
      },
    );

    if (!response.ok) {
      throw new Error(`Twitch user request failed: ${response.status}`);
    }

    const data = (await response.json()) as TwitchUsersResponse;

    return data.data[0] ?? null;
  }

  async getStreamByLogin(login: string): Promise<TwitchStream | null> {
    const clientId = this.configService.get<string>('TWITCH_CLIENT_ID');

    if (!clientId) {
      throw new Error('Twitch Client ID が未設定です');
    }

    const accessToken = await this.getAppAccessToken();

    const params = new URLSearchParams({
      user_login: login,
    });

    const response = await fetch(
      `https://api.twitch.tv/helix/streams?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Client-Id': clientId,
        },
      },
    );

    if (!response.ok) {
      throw new Error(`Twitch stream request failed: ${response.status}`);
    }

    const data = (await response.json()) as TwitchStreamsResponse;

    return data.data[0] ?? null;
  }
}
