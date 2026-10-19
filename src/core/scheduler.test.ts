import { CardState } from './cards';
import { Rating } from './rating';
import { createScheduler, newCardSchedule } from './scheduler';
import { DAY_MS } from './time';

const start = new Date(2026, 9, 19, 9).getTime();
const scheduler = createScheduler({ targetRecall: 0.9, fuzz: false });

describe('FSRS scheduling', () => {
  it('starts cards as new and due now', () => {
    const card = newCardSchedule(start);
    expect(card).toMatchObject({
      state: CardState.New,
      reps: 0,
      lapses: 0,
      due: start,
      lastReview: null,
    });
  });

  it('keeps a failed new card in short learning steps', () => {
    const card = scheduler.review(newCardSchedule(start), Rating.Again, start);
    expect(card.state).toBe(CardState.Learning);
    expect(card.due - start).toBeLessThan(15 * 60 * 1000);
    expect(card.lastReview).toBe(start);
  });

  it('graduates a card and spaces reviews further apart', () => {
    let card = newCardSchedule(start);
    let now = start;
    card = scheduler.review(card, Rating.Good, now); // learning step
    now = card.due;
    card = scheduler.review(card, Rating.Good, now); // graduates
    expect(card.state).toBe(CardState.Review);
    const firstInterval = card.due - now;
    now = card.due;
    card = scheduler.review(card, Rating.Good, now);
    expect(card.due - now).toBeGreaterThan(firstInterval);
    expect(card.reps).toBe(3);
  });

  it('counts a lapse when a review card is forgotten', () => {
    let card = scheduler.review(newCardSchedule(start), Rating.Easy, start);
    expect(card.state).toBe(CardState.Review);
    card = scheduler.review(card, Rating.Again, card.due);
    expect(card.lapses).toBe(1);
    expect(card.state).toBe(CardState.Relearning);
  });

  it('schedules shorter intervals for a higher target recall', () => {
    const strict = createScheduler({ targetRecall: 0.97, fuzz: false });
    const graduate = (s: typeof scheduler) => {
      const c = s.review(newCardSchedule(start), Rating.Easy, start);
      return s.review(c, Rating.Good, c.due);
    };
    const normal = graduate(scheduler);
    const cram = graduate(strict);
    expect(cram.scheduledDays).toBeLessThan(normal.scheduledDays);
  });

  it('predicts recall falling over time', () => {
    const card = scheduler.review(newCardSchedule(start), Rating.Easy, start);
    const soon = scheduler.retrievability(card, start + DAY_MS);
    const later = scheduler.retrievability(card, start + 30 * DAY_MS);
    expect(soon).toBeGreaterThan(later);
    expect(soon).toBeLessThanOrEqual(1);
    expect(scheduler.retrievability(newCardSchedule(start), start)).toBe(0);
  });
});
