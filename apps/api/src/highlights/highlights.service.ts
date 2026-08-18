import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { HighlightAnalysisLoader } from './highlight-analysis.loader';
import { scoreToStars } from './highlight-stars';
import {
  findClipsForMoment,
  isClipForVod,
  MomentClip,
} from './highlight-clips';
import { AppTwitchClip, TwitchService } from '../twitch/twitch.service';
import {
  HighlightChapter,
  MomentCandidate,
  VisualizationTimeline,
} from './highlight-analysis.types';
import { HighlightStorageService } from './highlight-storage.service';

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
  thumbnailUrl?: string | null;
  clipCount: number;
  clips: MomentClip[];
};

export type HighlightMomentsResponse = {
  vodId: string;
  momentCount: number;
  moments: HighlightMomentResponse[];
};

export type HighlightTimelineResponse = {
  vodId: string;
  durationSeconds: number;
  points: VisualizationTimeline['points'];
};

export type HighlightChaptersResponse = {
  vodId: string;
  durationSeconds: number;
  chapters: HighlightChapter[];
};

@Injectable()
export class HighlightsService {
  constructor(
    private readonly analysisLoader: HighlightAnalysisLoader,
    private readonly twitchService: TwitchService,
    private readonly storageService: HighlightStorageService,
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
    const thumbnailTimestamps =
      await this.storageService.listThumbnailTimestamps(analysis.vodId);

    const moments = analysis.momentCandidates
      .map((candidate) =>
        this.createMomentResponse(
          analysis.vodId,
          candidate,
          clips,
          thumbnailTimestamps,
        ),
      )
      .filter((moment) => this.matchesFilters(moment, query));

    this.sortMoments(moments, query.sort);

    return {
      vodId: analysis.vodId,
      momentCount: moments.length,
      moments,
    };
  }

  async getVodThumbnail(
    vodId: string,
    timestampSeconds: string,
  ): Promise<Buffer> {
    const timestamp = this.parseThumbnailTimestamp(timestampSeconds);
    const thumbnail = await this.storageService.getThumbnail(vodId, timestamp);

    if (!thumbnail) {
      throw new NotFoundException(
        `Thumbnail for vodId ${vodId} at ${timestamp} was not found`,
      );
    }

    return thumbnail;
  }

  async getVodTimeline(vodId: string): Promise<HighlightTimelineResponse> {
    const analysis = await this.analysisLoader.findByVodId(vodId);
    const timeline = analysis.visualizationTimeline;

    if (!timeline) {
      throw new NotFoundException(`Timeline for vodId ${vodId} was not found`);
    }

    return {
      vodId: analysis.vodId,
      durationSeconds: timeline.durationSeconds,
      points: timeline.points,
    };
  }

  async getVodChapters(vodId: string): Promise<HighlightChaptersResponse> {
    const analysis = await this.analysisLoader.findByVodId(vodId);

    return {
      vodId: analysis.vodId,
      durationSeconds: this.getAnalysisDurationSeconds(analysis),
      chapters: analysis.chapters ?? [],
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
    vodId: string,
    candidate: MomentCandidate,
    clips: AppTwitchClip[],
    thumbnailTimestamps: Set<number>,
  ): HighlightMomentResponse {
    const matchedClips = findClipsForMoment(candidate, clips);
    const thumbnailTimestamp = this.normalizeMomentTimestamp(
      candidate.timestampSeconds,
    );
    const thumbnailUrl = thumbnailTimestamps.has(thumbnailTimestamp)
      ? this.createThumbnailUrl(vodId, thumbnailTimestamp)
      : null;

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
      thumbnailUrl,
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

  private createThumbnailUrl(
    vodId: string,
    timestampSeconds: number,
  ): string | null {
    return `/highlights/vods/${encodeURIComponent(
      vodId,
    )}/thumbnails/${timestampSeconds}`;
  }

  private normalizeMomentTimestamp(timestampSeconds: number): number {
    return Math.max(0, Math.floor(timestampSeconds));
  }

  private parseThumbnailTimestamp(value: string): number {
    if (!/^\d+$/.test(value)) {
      throw new BadRequestException(
        'timestampSeconds must be a non-negative integer',
      );
    }

    return Number(value);
  }

  private getAnalysisDurationSeconds(analysis: {
    durationSeconds?: number;
    visualizationTimeline?: VisualizationTimeline;
  }): number {
    if (
      typeof analysis.durationSeconds === 'number' &&
      Number.isFinite(analysis.durationSeconds)
    ) {
      return analysis.durationSeconds;
    }

    return analysis.visualizationTimeline?.durationSeconds ?? 0;
  }
}
