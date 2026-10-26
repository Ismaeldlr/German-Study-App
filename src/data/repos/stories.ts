import { eq } from 'drizzle-orm';

import type { ItemResult } from '@/core/drills';
import { ratingFor } from '@/core/rating';
import { storyOutcomes, type StoryExercise } from '@/core/story';

import type { DbOrTx } from '../db';
import { card } from '../schema';
import type { AppliedRating } from './grading';
import { recordReview, spotConfusions } from './study';

/**
 * A read story turned into reviews: a lapse for each deck word you tapped,
 * and one rating per word the gap questions asked for. Written in one
 * transaction when you finish, logged as story reviews.
 */

export interface StoryRating extends AppliedRating {
  itemId: number;
  type: (typeof card.$inferSelect)['type'];
}

export function recordStory(
  db: DbOrTx,
  story: Pick<StoryExercise, 'targets' | 'questions'>,
  tapped: ReadonlySet<number>,
  answers: readonly (ItemResult & { answer: string })[],
  now: number,
): StoryRating[] {
  const outcomes = storyOutcomes(story, tapped, answers);
  return db.transaction((tx) =>
    outcomes.flatMap((o) => {
      const current = tx.select().from(card).where(eq(card.id, o.cardId)).get();
      if (!current) return [];
      const rating = ratingFor({ outcome: o.outcome, cardState: current.state });
      const schedule = recordReview(
        tx,
        {
          cardId: current.id,
          rating,
          mode: 'story',
          responseMs: null,
          answer: o.answer,
          correct: o.outcome === 'correct' || o.outcome === 'slip',
          mistakes: spotConfusions(tx, current.itemId, o.mistakes),
        },
        now,
      );
      return [
        {
          cardId: current.id,
          itemId: current.itemId,
          type: current.type,
          rating,
          nextDue: schedule.due,
        },
      ];
    }),
  );
}
