export type NumericStatistics = Record<string, number>;

export type ScoreStatistics = {
  audio?: NumericStatistics;
  chat?: NumericStatistics;
  [key: string]: NumericStatistics | undefined;
};

export type RawScoreStatistics = {
  audioDelta?: NumericStatistics;
  eventChatScore?: NumericStatistics;
  [key: string]: NumericStatistics | undefined;
};

export type MomentCandidate = {
  timestampSeconds: number;
  timestamp: string;
  playbackStartSeconds?: number;
  playbackStartTimestamp?: string;
  audioScore: number;
  audioRawScore?: number;
  chatScore: number;
  chatRawScore?: number;
  audioPeakTimestampSeconds?: number | null;
  audioPeakTimestamp?: string | null;
  chatPeakTimestampSeconds?: number | null;
  chatPeakTimestamp?: string | null;
  chatMessageCount10s?: number;
  chatMessageCount30s?: number;
  [key: string]: unknown;
};

export type VisualizationTimelinePoint = {
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

export type VisualizationTimeline = {
  durationSeconds: number;
  maxPoints: number;
  source: 'timeline.csv';
  points: VisualizationTimelinePoint[];
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

export type HighlightAnalysis = {
  source?: string;
  durationSeconds?: number;
  sampleIntervalSeconds?: number;
  chatJsonSource?: string;
  vodOffsetSeconds?: number;
  scoreStatistics?: ScoreStatistics;
  rawScoreStatistics?: RawScoreStatistics;
  visualizationTimeline?: VisualizationTimeline;
  chapters?: HighlightChapter[];
  momentCandidates: MomentCandidate[];
  vodId: string;
  [key: string]: unknown;
};
