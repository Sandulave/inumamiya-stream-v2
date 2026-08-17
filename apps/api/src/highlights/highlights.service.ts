import { BadRequestException, Injectable } from '@nestjs/common';
import { HighlightAnalysisLoader } from './highlight-analysis.loader';
import { scoreToStars } from './highlight-stars';
import {
  findClipsForMoment,
  isClipForVod,
  MomentClip,
} from './highlight-clips';
import { AppTwitchClip, TwitchService } from '../twitch/twitch.service';
import { MomentCandidate } from './highlight-analysis.types';

const DEFAULT_HIGHLIGHT_BROADCASTER_LOGIN = 'inumamiya';

export type HighlightMomentSort = 'timestamp' | 'audio' | 'chat' | 'clips';

export type HighlightMomentQuery = {
  sort: HighlightMomentSort;
  minAudioStars?: number;
  minChatStars?: number;
  hasClips?: boolean;
};

export type HighlightMomentResponse = {
  timestampSeconds: number;
  timestamp: string;
  playbackStartSeconds?: number;
  playbackStartTimestamp?: string;
  audioScore: number;
  audioRawScore?: number;
  audioStars: number;
  chatScore: number;
  chatRawScore?: number;
  chatStars: number;
  audioPeakTimestampSeconds?: number | null;
  audioPeakTimestamp?: string | null;
  chatPeakTimestampSeconds?: number | null;
  chatPeakTimestamp?: string | null;
  chatMessageCount10s?: number;
  chatMessageCount30s?: number;
  clipCount: number;
  clips: MomentClip[];
};

export type HighlightMomentsResponse = {
  vodId: string;
  momentCount: number;
  moments: HighlightMomentResponse[];
};

@Injectable()
export class HighlightsService {
  constructor(
    private readonly analysisLoader: HighlightAnalysisLoader,
    private readonly twitchService: TwitchService,
  ) {}

  async getVodMoments(
    vodId: string,
    query: HighlightMomentQuery,
  ): Promise<HighlightMomentsResponse> {
    const analysis = await this.analysisLoader.findByVodId(vodId);
    const clips = (
      await this.twitchService.getAllClipsByLogin(
        DEFAULT_HIGHLIGHT_BROADCASTER_LOGIN,
      )
    ).filter((clip) => isClipForVod(clip, analysis.vodId));

    const moments = analysis.momentCandidates
      .map((candidate) => this.createMomentResponse(candidate, clips))
      .filter((moment) => this.matchesFilters(moment, query));

    this.sortMoments(moments, query.sort);

    return {
      vodId: analysis.vodId,
      momentCount: moments.length,
      moments,
    };
  }

  parseSort(sort?: string): HighlightMomentSort {
    if (!sort || sort === 'timestamp') {
      return 'timestamp';
    }

    if (sort === 'audio' || sort === 'chat' || sort === 'clips') {
      return sort;
    }

    throw new BadRequestException(
      'sort must be timestamp, audio, chat, or clips',
    );
  }

  parseStars(value: string | undefined, fieldName: string): number | undefined {
    if (value === undefined) {
      return undefined;
    }

    const parsed = Number(value);

    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 5) {
      throw new BadRequestException(
        `${fieldName} must be an integer from 0 to 5`,
      );
    }

    return parsed;
  }

  parseHasClips(value?: string): boolean | undefined {
    if (value === undefined) {
      return undefined;
    }

    if (value === 'true') {
      return true;
    }

    if (value === 'false') {
      return false;
    }

    throw new BadRequestException('hasClips must be true or false');
  }

  private createMomentResponse(
    candidate: MomentCandidate,
    clips: AppTwitchClip[],
  ): HighlightMomentResponse {
    const matchedClips = findClipsForMoment(candidate, clips);

    return {
      timestampSeconds: candidate.timestampSeconds,
      timestamp: candidate.timestamp,
      playbackStartSeconds: candidate.playbackStartSeconds,
      playbackStartTimestamp: candidate.playbackStartTimestamp,
      audioScore: candidate.audioScore,
      audioRawScore: candidate.audioRawScore,
      audioStars: scoreToStars(candidate.audioScore),
      chatScore: candidate.chatScore,
      chatRawScore: candidate.chatRawScore,
      chatStars: scoreToStars(candidate.chatScore),
      audioPeakTimestampSeconds: candidate.audioPeakTimestampSeconds,
      audioPeakTimestamp: candidate.audioPeakTimestamp,
      chatPeakTimestampSeconds: candidate.chatPeakTimestampSeconds,
      chatPeakTimestamp: candidate.chatPeakTimestamp,
      chatMessageCount10s: candidate.chatMessageCount10s,
      chatMessageCount30s: candidate.chatMessageCount30s,
      clipCount: matchedClips.length,
      clips: matchedClips,
    };
  }

  private matchesFilters(
    moment: HighlightMomentResponse,
    query: HighlightMomentQuery,
  ): boolean {
    if (
      query.minAudioStars !== undefined &&
      moment.audioStars < query.minAudioStars
    ) {
      return false;
    }

    if (
      query.minChatStars !== undefined &&
      moment.chatStars < query.minChatStars
    ) {
      return false;
    }

    if (query.hasClips === true && moment.clipCount === 0) {
      return false;
    }

    if (query.hasClips === false && moment.clipCount > 0) {
      return false;
    }

    return true;
  }

  private sortMoments(
    moments: HighlightMomentResponse[],
    sort: HighlightMomentSort,
  ) {
    moments.sort((a, b) => {
      if (sort === 'audio') {
        return (
          b.audioScore - a.audioScore || a.timestampSeconds - b.timestampSeconds
        );
      }

      if (sort === 'chat') {
        return (
          b.chatScore - a.chatScore || a.timestampSeconds - b.timestampSeconds
        );
      }

      if (sort === 'clips') {
        return (
          b.clipCount - a.clipCount || a.timestampSeconds - b.timestampSeconds
        );
      }

      return a.timestampSeconds - b.timestampSeconds;
    });
  }
}
