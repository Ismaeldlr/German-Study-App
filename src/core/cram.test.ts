import { CardState } from './cards';
import {
  CRAM_RECALL,
  cramDaysLeft,
  cramPicks,
  cramRecall,
  daysBetween,
  isCramActive,
  type CramCard,
} from './cram';

const now = new Date(2026, 9, 25, 9).getTime();
const DAY = 86_400_000;
const today = '2026-10-25';

function cards(n: number, overrides: Partial<CramCard> = {}): CramCard[] {
  return Array.from({ length: n }, (_, i) => ({
    cardId: i + 1,
    itemId: i + 1,
    type: 'produce',
    state: CardState.Review,
    due: now + (i + 1) * DAY,
    daysReviewed: 0,
    reviewedToday: false,
    available: true,
    ...overrides,
  }));
}

describe('cram calendar', () => {
  it('counts study days before the exam, today in and the exam day out', () => {
    expect(daysBetween('2026-10-25', '2026-11-01')).toBe(7);
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2);
    expect(cramDaysLeft(today, '2026-10-30')).toBe(5);
    expect(cramDaysLeft(today, '2026-10-26')).toBe(1);
    // On the exam day there is still the morning.
    expect(cramDaysLeft(today, today)).toBe(1);
  });

  it('runs until the exam day is over', () => {
    const plan = { chapterIds: [1], examDay: today, startedAt: now - DAY };
    expect(isCramActive(plan, today)).toBe(true);
    expect(isCramActive(plan, '2026-10-26')).toBe(false);
    expect(isCramActive(null, today)).toBe(false);
  });

  it('raises the target recall, but never lowers yours', () => {
    expect(cramRecall(0.9, true)).toBe(CRAM_RECALL);
    expect(cramRecall(0.97, true)).toBe(0.97);
    expect(cramRecall(0.9, false)).toBe(0.9);
  });
});

describe('cram picks', () => {
  it('spreads two reviews per card over the days left', () => {
    // 10 cards owe 20 review days over 5 days: 4 today, first reviews first.
    const picks = cramPicks(cards(10), { today, examDay: '2026-10-30', now });
    expect(picks.quota).toBe(4);
    expect([...picks.pull]).toEqual([1, 2, 3, 4]);
    expect(picks).toMatchObject({ daysLeft: 5, cards: 10, ready: 0, doneToday: 0 });
  });

  it('counts what you already did today against the quota', () => {
    const list = cards(10);
    list[0].reviewedToday = true;
    list[1].reviewedToday = true;
    const picks = cramPicks(list, { today, examDay: '2026-10-30', now });
    expect(picks.doneToday).toBe(2);
    expect([...picks.pull]).toEqual([3, 4]);
  });

  it('takes cards due anyway first, then first reviews before second ones', () => {
    const list = cards(4);
    list[3].due = now - DAY;
    list[0].daysReviewed = 1;
    const picks = cramPicks(list, { today, examDay: '2026-10-29', now });
    // 7 review days owed over 4 days: 2 today.
    expect(picks.quota).toBe(2);
    expect([...picks.pull]).toEqual([4, 2]);
  });

  it('asks every card that needs a review on each day left, quota or not', () => {
    const list = cards(6);
    list.forEach((c, i) => (c.daysReviewed = i < 3 ? 1 : 2));
    // The exam is tomorrow: each card still owing a review must have it today.
    const picks = cramPicks(list, { today, examDay: '2026-10-26', now });
    expect([...picks.pull].sort()).toEqual([1, 2, 3]);
    expect(picks.ready).toBe(3);
  });

  it('introduces new cards and leaves out cards that cannot be asked yet', () => {
    const list = cards(3, { state: CardState.New, due: now });
    list[2].available = false;
    const picks = cramPicks(list, { today, examDay: '2026-10-26', now });
    expect([...picks.introduce]).toEqual([1, 2]);
    expect(picks.pull.size).toBe(0);
  });

  it('is done once every card was reviewed on two days', () => {
    const picks = cramPicks(cards(3, { daysReviewed: 2 }), { today, examDay: '2026-10-30', now });
    expect(picks).toMatchObject({ quota: 0, ready: 3 });
    expect(picks.pull.size + picks.introduce.size).toBe(0);
  });
});
