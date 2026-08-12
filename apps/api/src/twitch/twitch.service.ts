import { BadRequestException, Injectable } from '@nestjs/common';
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

type TwitchClip = {
  id: string;
  url: string;
  embed_url: string;
  broadcaster_id: string;
  broadcaster_name: string;
  creator_id: string;
  creator_name: string;
  video_id: string;
  game_id: string;
  language: string;
  title: string;
  view_count: number;
  created_at: string;
  thumbnail_url: string;
};

type TwitchClipsResponse = {
  data: TwitchClip[];
  pagination?: {
    cursor?: string;
  };
};

type SortMode = 'latest' | 'views';

type ClipCursor =
  | {
      version: 1;
      sort: 'views';
      twitchCursor: string;
    }
  | {
      version: 1;
      sort: 'latest';
      before: string;
    };

type TwitchVideo = {
  id: string;
  user_id: string;
  user_name: string;
  title: string;
  description: string;
  created_at: string;
  published_at: string;
  url: string;
  thumbnail_url: string;
  view_count: number;
  language: string;
  type: string;
  duration: string;
};

type TwitchVideosResponse = {
  data: TwitchVideo[];
  pagination?: {
    cursor?: string;
  };
};

type TwitchPaginatedResult<T> = {
  data: T[];
  pagination: {
    cursor?: string;
  };
  hasMore?: boolean;
  sort?: SortMode;
};

@Injectable()
export class TwitchService {
  private readonly latestClipWindowMs = 30 * 24 * 60 * 60 * 1000;
  private readonly maxLatestClipWindows = 24;

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

  async getClipsByLogin(
    login: string,
    limit = 6,
    after?: string,
    sort: SortMode = 'latest',
  ): Promise<TwitchPaginatedResult<TwitchClip>> {
    const user = await this.getUserByLogin(login);

    if (!user) {
      throw new Error('Twitchユーザーが見つかりません');
    }

    const clientId = this.configService.get<string>('TWITCH_CLIENT_ID');

    if (!clientId) {
      throw new Error('Twitch Client ID が未設定です');
    }

    const accessToken = await this.getAppAccessToken();

    if (sort === 'latest') {
      return this.getLatestClips(user.id, accessToken, clientId, limit, after);
    }

    const cursor = after ? this.decodeClipCursor(after, sort) : null;

    const params = new URLSearchParams({
      broadcaster_id: user.id,
      first: String(limit),
    });

    if (cursor?.sort === 'views') {
      params.set('after', cursor.twitchCursor);
    }

    const response = await fetch(
      `https://api.twitch.tv/helix/clips?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Client-Id': clientId,
        },
      },
    );

    if (!response.ok) {
      throw new Error(`Twitch clips request failed: ${response.status}`);
    }

    const data = (await response.json()) as TwitchClipsResponse;

    return {
      data: data.data,
      pagination: {
        cursor: data.pagination?.cursor
          ? this.encodeClipCursor({
              version: 1,
              sort: 'views',
              twitchCursor: data.pagination.cursor,
            })
          : undefined,
      },
      hasMore: Boolean(data.pagination?.cursor),
      sort: 'views',
    };
  }

  private async getLatestClips(
    broadcasterId: string,
    accessToken: string,
    clientId: string,
    limit: number,
    after?: string,
  ): Promise<TwitchPaginatedResult<TwitchClip>> {
    const cursor = after ? this.decodeClipCursor(after, 'latest') : null;
    let before = cursor?.sort === 'latest' ? new Date(cursor.before) : new Date();

    if (Number.isNaN(before.getTime())) {
      throw new BadRequestException('Invalid clip cursor');
    }

    const collected: TwitchClip[] = [];
    let exploredWindows = 0;

    while (collected.length < limit && exploredWindows < this.maxLatestClipWindows) {
      const endedAt = before;
      const startedAt = new Date(endedAt.getTime() - this.latestClipWindowMs);
      const windowClips = await this.getAllClipsInWindow(
        broadcasterId,
        accessToken,
        clientId,
        startedAt,
        endedAt,
      );

      collected.push(
        ...windowClips.filter(
          (clip) => new Date(clip.created_at).getTime() < before.getTime(),
        ),
      );
      before = startedAt;
      exploredWindows += 1;
    }

    const sorted = this.dedupeClips(collected).sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
    const page = sorted.slice(0, limit);
    const oldestReturned = page.at(-1);
    const nextCursor =
      oldestReturned && (sorted.length > limit || exploredWindows < this.maxLatestClipWindows)
        ? this.encodeClipCursor({
            version: 1,
            sort: 'latest',
            before: oldestReturned.created_at,
          })
        : undefined;

    return {
      data: page,
      pagination: {
        cursor: nextCursor,
      },
      hasMore: Boolean(nextCursor),
      sort: 'latest',
    };
  }

  private async getAllClipsInWindow(
    broadcasterId: string,
    accessToken: string,
    clientId: string,
    startedAt: Date,
    endedAt: Date,
  ) {
    const clips: TwitchClip[] = [];
    let after: string | undefined;

    do {
      const params = new URLSearchParams({
        broadcaster_id: broadcasterId,
        first: '100',
        started_at: startedAt.toISOString(),
        ended_at: endedAt.toISOString(),
      });

      if (after) {
        params.set('after', after);
      }

      const response = await fetch(
        `https://api.twitch.tv/helix/clips?${params.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Client-Id': clientId,
          },
        },
      );

      if (!response.ok) {
        throw new Error(`Twitch clips request failed: ${response.status}`);
      }

      const data = (await response.json()) as TwitchClipsResponse;
      clips.push(...data.data);
      after = data.pagination?.cursor;
    } while (after);

    return clips;
  }

  private dedupeClips(clips: TwitchClip[]) {
    const seen = new Set<string>();

    return clips.filter((clip) => {
      if (seen.has(clip.id)) {
        return false;
      }

      seen.add(clip.id);
      return true;
    });
  }

  private encodeClipCursor(cursor: ClipCursor) {
    return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
  }

  private decodeClipCursor(cursorValue: string, sort: SortMode): ClipCursor {
    try {
      const decoded = JSON.parse(
        Buffer.from(cursorValue, 'base64url').toString('utf8'),
      ) as ClipCursor;

      if (decoded.version !== 1 || decoded.sort !== sort) {
        throw new Error('Cursor mismatch');
      }

      if (decoded.sort === 'views' && !decoded.twitchCursor) {
        throw new Error('Invalid views cursor');
      }

      if (decoded.sort === 'latest' && Number.isNaN(Date.parse(decoded.before))) {
        throw new Error('Invalid latest cursor');
      }

      return decoded;
    } catch {
      throw new BadRequestException('Invalid clip cursor');
    }
  }

  async getVideosByLogin(
    login: string,
    limit = 6,
    after?: string,
    sort: SortMode = 'latest',
  ): Promise<TwitchPaginatedResult<TwitchVideo>> {
    const user = await this.getUserByLogin(login);

    if (!user) {
      throw new Error('Twitchユーザーが見つかりません');
    }

    const clientId = this.configService.get<string>('TWITCH_CLIENT_ID');

    if (!clientId) {
      throw new Error('Twitch Client ID が未設定です');
    }

    const accessToken = await this.getAppAccessToken();

    const params = new URLSearchParams({
      user_id: user.id,
      first: String(limit),
      type: 'archive',
      sort: sort === 'views' ? 'views' : 'time',
    });

    if (after) {
      params.set('after', after);
    }

    const response = await fetch(
      `https://api.twitch.tv/helix/videos?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Client-Id': clientId,
        },
      },
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `Twitch videos request failed: ${response.status} - ${errorBody}`,
      );
    }

    const data = (await response.json()) as TwitchVideosResponse;

    return {
      data: data.data,
      pagination: {
        cursor: data.pagination?.cursor,
      },
      hasMore: Boolean(data.pagination?.cursor),
      sort,
    };
  }
}
