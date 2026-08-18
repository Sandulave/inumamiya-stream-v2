export type HighlightClip = {
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

export type HighlightMoment = {
  timestampSeconds: number;
  timestamp: string;
  playbackStartSeconds?: number;
  playbackStartTimestamp?: string;
  /** Moment timestamp付近のフレーム画像。再生開始位置ではなく候補時刻そのもののサムネイル想定。 */
  thumbnailUrl?: string | null;
  audioScore: number;
  audioStars: number;
  chatScore: number;
  chatStars: number;
  audioPeakTimestampSeconds?: number | null;
  audioPeakTimestamp?: string | null;
  chatPeakTimestampSeconds?: number | null;
  chatPeakTimestamp?: string | null;
  clipCount: number;
  clips: HighlightClip[];
};

export type HighlightMomentsResponse = {
  vodId: string;
  momentCount: number;
  moments: HighlightMoment[];
};

export type HighlightTimelinePoint = {
  timestampSeconds: number;
  audio: {
    level: number;
    rawDelta: number;
    peakTimestampSeconds: number;
  };
  chat: {
    level: number;
    messageCount10s: number;
    rawScore: number;
    peakTimestampSeconds: number;
  };
};

export type HighlightTimelineResponse = {
  vodId: string;
  durationSeconds: number;
  points: HighlightTimelinePoint[];
};

export type HighlightChapter = {
  startSeconds: number;
  endSeconds: number;
  durationSeconds: number;
  categoryName: string;
  gameName?: string;
  gameId?: string;
  type?: string;
  title?: string;
  thumbnailUrl?: string;
};

export type HighlightChaptersResponse = {
  vodId: string;
  durationSeconds: number;
  chapters: HighlightChapter[];
};

export type HighlightSort = 'timestamp' | 'audio' | 'chat' | 'clips';

export type HighlightFilters = {
  sort: HighlightSort;
  minAudioStars: number;
  minChatStars: number;
  hasClips?: boolean;
};
