import { and, count, eq, gte, ne, sql } from 'drizzle-orm';

import type { ItemState } from '@/core/cards';
import {
  achievementStates,
  levelFor,
  streakFor,
  xpFor,
  type AchievementState,
  type LevelInfo,
  type ProgressStats,
  type StreakInfo,
} from '@/core/progress';
import { localDay } from '@/core/time';

import type { DbOrTx } from '../db';
import { item, review, studySession } from '../schema';
import { listDeck } from './items';

/**
 * Progress read straight from the review log: XP per day, the streak, the
 * level and the badges. Nothing is stored, so a restored backup brings the
 * whole history back with it.
 */

export interface DayActivity {
  reviews: number;
  xp: number;
}

const localDayOf = sql<string>`strftime('%Y-%m-%d', ${review.reviewedAt} / 1000, 'unixepoch', 'localtime')`;
const localHour = sql`cast(strftime('%H', ${review.reviewedAt} / 1000, 'unixepoch', 'localtime') as integer)`;

/** Reviews and XP for every local day you studied. */
export function activityByDay(db: DbOrTx): Map<string, DayActivity> {
  const recalled = sql<number>`(${review.rating} >= 2)`;
  const rows = db
    .select({ day: localDayOf, mode: review.mode, recalled, n: count() })
    .from(review)
    .groupBy(localDayOf, review.mode, recalled)
    .all();
  const days = new Map<string, DayActivity>();
  for (const row of rows) {
    const day = days.get(row.day) ?? { reviews: 0, xp: 0 };
    day.reviews += row.n;
    day.xp += row.n * xpFor(row.mode, row.recalled ? 2 : 1);
    days.set(row.day, day);
  }
  return days;
}

export interface Pulse {
  days: Map<string, DayActivity>;
  today: DayActivity;
  totalXp: number;
  streak: StreakInfo;
  level: LevelInfo;
}

/** The light summary Home and the session header need. */
export function pulse(db: DbOrTx, now: Date): Pulse {
  const days = activityByDay(db);
  const today = localDay(now);
  let totalXp = 0;
  for (const day of days.values()) totalXp += day.xp;
  return {
    days,
    today: days.get(today) ?? { reviews: 0, xp: 0 },
    totalXp,
    streak: streakFor(new Set(days.keys()), today),
    level: levelFor(totalXp),
  };
}

export type DeckBreakdown = Record<ItemState, number> & { total: number };

export interface ProgressReport extends Pulse {
  deck: DeckBreakdown;
  words: number;
  stats: ProgressStats;
  achievements: AchievementState[];
}

const reviewCount = (db: DbOrTx, where?: ReturnType<typeof and>) =>
  db.select({ n: count() }).from(review).where(where).get()?.n ?? 0;

/** Everything the Progress tab shows, badges included. */
export function progressReport(db: DbOrTx, now: Date): ProgressReport {
  const base = pulse(db, now);
  const deck: DeckBreakdown = {
    new: 0,
    learning: 0,
    young: 0,
    mature: 0,
    suspended: 0,
    total: 0,
  };
  let matureWords = 0;
  for (const row of listDeck(db)) {
    deck[row.state]++;
    deck.total++;
    if (row.state === 'mature' && row.item.kind !== 'grammar') matureWords++;
  }
  const words = db.select({ n: count() }).from(item).where(ne(item.kind, 'grammar')).get()?.n ?? 0;
  const perfectSessions =
    db
      .select({ n: count() })
      .from(studySession)
      .where(and(gte(studySession.cardsDone, 10), eq(studySession.accuracy, 1)))
      .get()?.n ?? 0;

  const stats: ProgressStats = {
    reviews: reviewCount(db),
    words,
    matureWords,
    bestStreak: base.streak.best,
    level: base.level.level,
    perfectSessions,
    translationsRight: reviewCount(db, and(eq(review.mode, 'translation'), gte(review.rating, 2))),
    drillsDone: reviewCount(db, eq(review.mode, 'grammar_drill')),
    earlyBird: reviewCount(db, sql`${localHour} >= 4 and ${localHour} < 8`) > 0,
    nightOwl: reviewCount(db, sql`(${localHour} >= 22 or ${localHour} < 4)`) > 0,
  };
  return { ...base, deck, words, stats, achievements: achievementStates(stats) };
}

/** Ids of the badges you hold, to spot new ones after a session. */
export function unlockedIds(report: ProgressReport): string[] {
  return report.achievements.filter((a) => a.unlocked).map((a) => a.achievement.id);
}

/** Words with an example sentence, for the word of the day. */
export function wordOfTheDayPool(db: DbOrTx) {
  return db
    .select()
    .from(item)
    .where(and(eq(item.status, 'active'), ne(item.kind, 'grammar')))
    .all();
}
