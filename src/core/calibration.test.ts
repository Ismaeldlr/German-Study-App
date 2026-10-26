import { calibration } from './calibration';
import { DAY_MS } from './time';

const start = new Date(2026, 7, 1, 9).getTime();

describe('calibration', () => {
  it('skips learning steps and buckets review answers by predicted recall', () => {
    const learn = (cardId: number) => [
      { cardId, reviewedAt: start, rating: 3 },
      { cardId, reviewedAt: start + 10 * 60_000, rating: 3 },
    ];
    const buckets = calibration([
      ...learn(1),
      { cardId: 1, reviewedAt: start + 3 * DAY_MS, rating: 3 },
      ...learn(2),
      // Weeks late: FSRS expects this one to be forgotten more often.
      { cardId: 2, reviewedAt: start + 60 * DAY_MS, rating: 1 },
    ]);
    const answered = buckets.filter((b) => b.answers);
    expect(answered.map((b) => b.answers)).toEqual([1, 1]);
    for (const b of answered) {
      expect(b.predicted).toBeGreaterThanOrEqual(b.from);
      expect(b.predicted).toBeLessThan(b.to);
    }
    const [late, onTime] = answered;
    expect(late).toMatchObject({ actual: 0 });
    expect(onTime).toMatchObject({ actual: 1 });
    expect(late.predicted).toBeLessThan(onTime.predicted);
  });

  it('replays every card on its own, whatever order the log is in', () => {
    const one = [
      { cardId: 1, reviewedAt: start, rating: 3 },
      { cardId: 1, reviewedAt: start + 600_000, rating: 3 },
      { cardId: 1, reviewedAt: start + 4 * DAY_MS, rating: 3 },
    ];
    const two = one.map((r) => ({ ...r, cardId: 2 }));
    const mixed = [...one, ...two].reverse();
    const counts = (b: ReturnType<typeof calibration>) => b.map((x) => x.answers);
    expect(counts(calibration(mixed))).toEqual(counts(calibration(one)).map((n) => n * 2));
  });
});
