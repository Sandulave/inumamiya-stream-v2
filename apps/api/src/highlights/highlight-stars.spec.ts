import { scoreToStars } from './highlight-stars';

describe('scoreToStars', () => {
  it.each([
    [0, 0],
    [0.1, 1],
    [19.9, 1],
    [20, 2],
    [39.9, 2],
    [40, 3],
    [60, 4],
    [80, 5],
    [100, 5],
  ])('converts score %p to %p stars', (score, stars) => {
    expect(scoreToStars(score)).toBe(stars);
  });

  it('handles invalid and out-of-range values safely', () => {
    expect(scoreToStars(Number.NaN)).toBe(0);
    expect(scoreToStars(Number.POSITIVE_INFINITY)).toBe(0);
    expect(scoreToStars(-1)).toBe(0);
    expect(scoreToStars(120)).toBe(5);
  });
});
