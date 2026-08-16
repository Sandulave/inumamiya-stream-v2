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

export type HighlightSort = 'timestamp' | 'audio' | 'chat' | 'clips';

export type HighlightFilters = {
  sort: HighlightSort;
  minAudioStars: number;
  minChatStars: number;
  hasClips?: boolean;
};
