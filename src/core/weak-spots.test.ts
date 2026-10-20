import { DAY_MS } from './time';
import {
  topWeakSpot,
  WEAK_SPOT_HALF_LIFE_DAYS,
  WEAK_SPOT_MIN_SCORE,
  weakSpotScores,
  type MistakeSample,
} from './weak-spots';

const now = new Date(2026, 9, 19, 9).getTime();
const ago = (days: number) => now - days * DAY_MS;

describe('weak spots', () => {
  it('adds one per mistake and halves every 14 days without new errors', () => {
    const fresh = weakSpotScores([{ category: 'case_ending', createdAt: now }], now);
    expect(fresh[0]).toMatchObject({ category: 'case_ending', score: 1, count: 1 });

    const old = weakSpotScores(
      [{ category: 'case_ending', createdAt: ago(WEAK_SPOT_HALF_LIFE_DAYS) }],
      now,
    );
    expect(old[0].score).toBeCloseTo(0.5);
    const older = weakSpotScores(
      [{ category: 'case_ending', createdAt: ago(2 * WEAK_SPOT_HALF_LIFE_DAYS) }],
      now,
    );
    expect(older[0].score).toBeCloseTo(0.25);
  });

  it('ranks recent patterns above old ones, even with fewer mistakes', () => {
    const mistakes: MistakeSample[] = [
      ...[60, 61, 62, 63, 64].map((d) => ({ category: 'article' as const, createdAt: ago(d) })),
      { category: 'adjective_ending', createdAt: ago(1) },
      { category: 'adjective_ending', createdAt: ago(2) },
    ];
    const spots = weakSpotScores(mistakes, now);
    expect(spots.map((s) => s.category)).toEqual(['adjective_ending', 'article']);
    expect(spots[1]).toMatchObject({ count: 5, lastAt: ago(60) });
  });

  it('only calls a category the top weak spot once it stands out', () => {
    expect(topWeakSpot([])).toBeNull();
    const one = weakSpotScores([{ category: 'word_order', createdAt: now }], now);
    expect(one[0].score).toBeLessThan(WEAK_SPOT_MIN_SCORE);
    expect(topWeakSpot(one)).toBeNull();
    const two = weakSpotScores(
      [
        { category: 'word_order', createdAt: now },
        { category: 'word_order', createdAt: ago(1) },
      ],
      now,
    );
    expect(topWeakSpot(two)?.category).toBe('word_order');
  });
});
