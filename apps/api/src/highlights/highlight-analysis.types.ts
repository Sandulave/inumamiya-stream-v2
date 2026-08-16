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

export type HighlightAnalysis = {
  source?: string;
  durationSeconds?: number;
  sampleIntervalSeconds?: number;
  chatJsonSource?: string;
  vodOffsetSeconds?: number;
  scoreStatistics?: ScoreStatistics;
  rawScoreStatistics?: RawScoreStatistics;
  momentCandidates: MomentCandidate[];
  vodId: string;
  [key: string]: unknown;
};
