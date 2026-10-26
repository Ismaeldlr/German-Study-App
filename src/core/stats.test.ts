import { CardState } from './cards';
import {
  BREAK_MS,
  chapterCoverage,
  countStates,
  coverageShare,
  DEFAULT_ANSWER_MS,
  minutesByDay,
  recallReport,
  recallShare,
  reviewForecast,
  type RecallSample,
} from './stats';
import { DAY_MS } from './time';

const now = new Date(2026, 9, 25, 12).getTime();
const sample = (overrides: Partial<RecallSample>): RecallSample => ({
  reviewedAt: now - DAY_MS,
  mode: 'classic',
  rating: 3,
  stateBefore: CardState.Review,
  ...overrides,
});

describe('recall report', () => {
  it('counts answers on review cards over the last 7 and 30 days', () => {
    const report = recallReport(
      [
        sample({}),
        sample({ rating: 1 }),
        sample({ reviewedAt: now - 10 * DAY_MS }),
        sample({ reviewedAt: now - 40 * DAY_MS }),
      ],
      now,
    );
    expect(report.overall.week).toEqual({ answers: 2, recalled: 1 });
    expect(report.overall.month).toEqual({ answers: 3, recalled: 2 });
  });

  it('leaves out learning steps, which you are expected to miss', () => {
    const report = recallReport(
      [sample({ stateBefore: CardState.New, rating: 1 }), sample({ stateBefore: 3, rating: 1 })],
      now,
    );
    expect(report.overall.month.answers).toBe(0);
    expect(recallShare(report.overall.month)).toBeNull();
  });

  it('splits by exercise mode, most answered first', () => {
    const report = recallReport(
      [
        sample({ mode: 'translation', rating: 1 }),
        sample({ mode: 'gap_fill' }),
        sample({ mode: 'gap_fill', rating: 2 }),
      ],
      now,
    );
    expect(report.modes.map((m) => m.mode)).toEqual(['gap_fill', 'translation']);
    expect(recallShare(report.modes[0].week)).toBe(1);
    expect(recallShare(report.modes[1].week)).toBe(0);
  });
});

describe('review forecast', () => {
  it('puts overdue cards on today and leaves new cards out', () => {
    const forecast = reviewForecast(
      [
        { state: CardState.Review, due: now - 5 * DAY_MS },
        { state: CardState.Learning, due: now + 60_000 },
        { state: CardState.Review, due: now + 2 * DAY_MS },
        { state: CardState.Review, due: now + 30 * DAY_MS },
        { state: CardState.New, due: now },
      ],
      new Date(now),
    );
    expect(forecast).toHaveLength(14);
    expect(forecast[0]).toEqual({ day: '2026-10-25', count: 2 });
    expect(forecast[2]).toEqual({ day: '2026-10-27', count: 1 });
    expect(forecast.reduce((sum, d) => sum + d.count, 0)).toBe(3);
  });
});

describe('minutes studied', () => {
  it('counts the time between answers, and a break as the next answer alone', () => {
    const start = now;
    const minutes = minutesByDay([
      { at: start, ms: 6_000 },
      { at: start + 30_000, ms: 4_000 },
      { at: start + 90_000, ms: 4_000 },
      // An hour later: a break.
      { at: start + 3_600_000, ms: 12_000 },
      { at: start + 3_660_000, ms: null },
    ]);
    // 6 s + 30 s + 60 s, then 12 s + 60 s.
    expect(minutes.get('2026-10-25')).toBeCloseTo(168 / 60);
  });

  it('caps an answer with a long response time at the break length', () => {
    const minutes = minutesByDay([
      { at: now, ms: 20 * 60_000 },
      { at: now + DAY_MS, ms: null },
    ]);
    expect(minutes.get('2026-10-25')).toBe(BREAK_MS / 60_000);
    expect(minutes.get('2026-10-26')).toBe(DEFAULT_ANSWER_MS / 60_000);
  });
});

describe('chapter coverage', () => {
  it('is the share of active items that are mature', () => {
    const byChapter = chapterCoverage([
      { chapterId: 1, state: 'mature' },
      { chapterId: 1, state: 'young' },
      { chapterId: 1, state: 'suspended' },
      { chapterId: 2, state: 'new' },
      { chapterId: null, state: 'mature' },
    ]);
    expect(byChapter.get(1)).toMatchObject({ total: 3, mature: 1, young: 1, suspended: 1 });
    expect(coverageShare(byChapter.get(1)!)).toBe(0.5);
    expect(coverageShare(byChapter.get(2)!)).toBe(0);
    expect(byChapter.size).toBe(2);
    expect(coverageShare(countStates([]))).toBe(0);
  });
});
