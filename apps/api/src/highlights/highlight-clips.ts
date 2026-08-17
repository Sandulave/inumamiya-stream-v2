import { MomentCandidate } from './highlight-analysis.types';
import { AppTwitchClip } from '../twitch/twitch.service';

export const CLIP_MATCH_TOLERANCE_SECONDS = 15;

export type MomentClip = {
  id: string;
  title: string;
  url: string;
  embedUrl: string;
  thumbnailUrl: string;
  viewCount: number;
  creatorName: string;
  duration: number;
  vodOffset: number;
  createdAt: string;
};

export function isClipForVod(clip: AppTwitchClip, vodId: string): boolean {
  return (
    clip.videoId === vodId && clip.videoId !== '' && clip.vodOffset !== null
  );
}

export function clipMatchesMoment(
  clip: AppTwitchClip,
  moment: MomentCandidate,
  toleranceSeconds = CLIP_MATCH_TOLERANCE_SECONDS,
): boolean {
  if (clip.vodOffset === null) {
    return false;
  }

  const clipStart = clip.vodOffset;
  const clipEnd = clipStart + clip.duration;
  const signals = [
    moment.timestampSeconds,
    moment.audioPeakTimestampSeconds,
    moment.chatPeakTimestampSeconds,
  ].filter(
    (value): value is number =>
      typeof value === 'number' && Number.isFinite(value),
  );

  return signals.some(
    (signal) =>
      signal >= clipStart - toleranceSeconds &&
      signal <= clipEnd + toleranceSeconds,
  );
}

export function mapClipForMoment(clip: AppTwitchClip): MomentClip {
  return {
    id: clip.id,
    title: clip.title,
    url: clip.url,
    embedUrl: clip.embedUrl,
    thumbnailUrl: clip.thumbnailUrl,
    viewCount: clip.viewCount,
    creatorName: clip.creatorName,
    duration: clip.duration,
    vodOffset: clip.vodOffset ?? 0,
    createdAt: clip.createdAt,
  };
}

export function findClipsForMoment(
  moment: MomentCandidate,
  clips: AppTwitchClip[],
): MomentClip[] {
  const matchedById = new Map<string, AppTwitchClip>();

  for (const clip of clips) {
    if (clipMatchesMoment(clip, moment)) {
      matchedById.set(clip.id, clip);
    }
  }

  return [...matchedById.values()].map(mapClipForMoment);
}
