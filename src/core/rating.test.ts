import { CardState } from './cards';
import { EASY_SPEED_FACTOR, Rating, ratingFor, usualResponseMs } from './rating';

const review = CardState.Review;

describe('answer to rating', () => {
  it.each(['wrong', 'skipped', 'revealed'] as const)('rates %s as Again', (outcome) => {
    expect(ratingFor({ outcome, cardState: review })).toBe(Rating.Again);
  });

  it('rates right after a hint as Hard', () => {
    expect(ratingFor({ outcome: 'correct', usedHint: true, cardState: review })).toBe(Rating.Hard);
  });

  it('rates a small slip as Hard', () => {
    expect(ratingFor({ outcome: 'slip', cardState: review })).toBe(Rating.Hard);
  });

  it('rates right as Good', () => {
    expect(ratingFor({ outcome: 'correct', cardState: review })).toBe(Rating.Good);
    expect(
      ratingFor({ outcome: 'correct', cardState: review, responseMs: 5000, usualMs: 4000 }),
    ).toBe(Rating.Good);
  });

  it('rates right and clearly faster than usual, on a review card, as Easy', () => {
    const fast = 4000 * EASY_SPEED_FACTOR - 1;
    expect(
      ratingFor({ outcome: 'correct', cardState: review, responseMs: fast, usualMs: 4000 }),
    ).toBe(Rating.Easy);
  });

  it('never rates a learning or new card Easy', () => {
    for (const cardState of [CardState.New, CardState.Learning, CardState.Relearning]) {
      expect(ratingFor({ outcome: 'correct', cardState, responseMs: 100, usualMs: 4000 })).toBe(
        Rating.Good,
      );
    }
  });

  it('needs a usual time before it rates anything Easy', () => {
    expect(
      ratingFor({ outcome: 'correct', cardState: review, responseMs: 100, usualMs: null }),
    ).toBe(Rating.Good);
  });
});

describe('usual response time', () => {
  it('is the median of enough samples', () => {
    expect(usualResponseMs([1, 2, 3, 4])).toBeNull();
    expect(usualResponseMs([5000, 1000, 3000, 2000, 4000])).toBe(3000);
    expect(usualResponseMs([1000, 2000, 3000, 4000, 5000, 6000])).toBe(3500);
  });

  it('ignores invalid samples', () => {
    expect(usualResponseMs([0, -5, NaN, 1000, 1000, 1000, 1000])).toBeNull();
  });
});
