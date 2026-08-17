import {
  clipMatchesMoment,
  findClipsForMoment,
  isClipForVod,
} from './highlight-clips';
import { MomentCandidate } from './highlight-analysis.types';
import { AppTwitchClip } from '../twitch/twitch.service';

function createClip(overrides: Partial<AppTwitchClip> = {}): AppTwitchClip {
  return {
    id: 'clip-a',
    url: 'https://clips.twitch.tv/clip-a',
    embedUrl: 'https://clips.twitch.tv/embed?clip=clip-a',
    broadcasterId: 'broadcaster',
    broadcasterName: 'いぬまみや',
    creatorId: 'creator',
    creatorName: 'creator',
    videoId: '2845096588',
    title: 'clip title',
    viewCount: 10,
    createdAt: '2026-08-13T00:00:00Z',
    thumbnailUrl: 'https://example.com/thumb.jpg',
    duration: 30,
    vodOffset: 100,
    isFeatured: false,
    ...overrides,
  };
}

function createMoment(
  overrides: Partial<MomentCandidate> = {},
): MomentCandidate {
  return {
    timestampSeconds: 120,
    timestamp: '00:02:00',
    audioScore: 50,
    chatScore: 50,
    ...overrides,
  };
}

describe('highlight clip helpers', () => {
  it('filters clips for the target VOD and matchable vod_offset', () => {
    expect(isClipForVod(createClip(), '2845096588')).toBe(true);
    expect(isClipForVod(createClip({ videoId: '999' }), '2845096588')).toBe(
      false,
    );
    expect(isClipForVod(createClip({ videoId: '' }), '2845096588')).toBe(false);
    expect(isClipForVod(createClip({ vodOffset: null }), '2845096588')).toBe(
      false,
    );
  });

  it('matches a moment signal inside clip interval with tolerance', () => {
    const clip = createClip({ vodOffset: 100, duration: 30 });

    expect(
      clipMatchesMoment(clip, createMoment({ timestampSeconds: 120 })),
    ).toBe(true);
    expect(
      clipMatchesMoment(clip, createMoment({ timestampSeconds: 90 })),
    ).toBe(true);
    expect(
      clipMatchesMoment(clip, createMoment({ timestampSeconds: 84 })),
    ).toBe(false);
  });

  it('matches when either audio peak or chat peak falls inside the clip range', () => {
    const clip = createClip({ vodOffset: 100, duration: 30 });

    expect(
      clipMatchesMoment(
        clip,
        createMoment({
          timestampSeconds: 10,
          audioPeakTimestampSeconds: 118,
          chatPeakTimestampSeconds: null,
        }),
      ),
    ).toBe(true);
    expect(
      clipMatchesMoment(
        clip,
        createMoment({
          timestampSeconds: 10,
          audioPeakTimestampSeconds: null,
          chatPeakTimestampSeconds: 118,
        }),
      ),
    ).toBe(true);
  });

  it('dedupes a clip that matches multiple moment signals', () => {
    const clips = [createClip()];
    const matched = findClipsForMoment(
      createMoment({
        timestampSeconds: 120,
        audioPeakTimestampSeconds: 121,
        chatPeakTimestampSeconds: 122,
      }),
      clips,
    );

    expect(matched).toHaveLength(1);
    expect(matched[0].id).toBe('clip-a');
  });
});
