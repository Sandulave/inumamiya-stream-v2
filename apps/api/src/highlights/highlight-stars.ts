export const STAR_SCORE_THRESHOLDS = [
  { min: 80, stars: 5 },
  { min: 60, stars: 4 },
  { min: 40, stars: 3 },
  { min: 20, stars: 2 },
  { min: Number.MIN_VALUE, stars: 1 },
] as const;

export function clampScore(score: number): number {
  if (!Number.isFinite(score)) {
    return 0;
  }

  return Math.min(Math.max(score, 0), 100);
}

export function scoreToStars(score: number): number {
  const clamped = clampScore(score);

  if (clamped <= 0) {
    return 0;
  }

  return STAR_SCORE_THRESHOLDS.find((threshold) => clamped >= threshold.min)
    ?.stars ?? 0;
}
