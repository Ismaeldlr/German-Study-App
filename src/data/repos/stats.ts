import { gte } from 'drizzle-orm';

import { addDays } from '@/core/progress';
import {
  chapterCoverage,
  countStates,
  DEFAULT_ANSWER_MS,
  emptyCounts,
  minutesByDay,
  recallReport,
  reviewForecast,
  type ForecastDay,
  type RecallReport,
  type StateCounts,
} from '@/core/stats';
import { DAY_MS, localDay, startOfLocalDay } from '@/core/time';
import type { WeakSpot } from '@/core/weak-spots';

import type { DbOrTx } from '../db';
import { review, type ChapterRow } from '../schema';
import { listChapters } from './chapters';
import { chatMessageTimes } from './chats';
import { listDeck } from './items';
import { getAllSettings } from './settings';
import { queueCandidates } from './study';
import { monthToDate, type UsageTotals } from './usage';
import { weakSpots } from './weak-spots';

/** Days of study time the Stats screen shows, today included. */
export const MINUTES_DAYS = 14;
/** Weak spots the Stats screen lists. */
export const TOP_WEAK_SPOTS = 5;

export interface ChapterStats {
  chapter: ChapterRow;
  counts: StateCounts;
}

export interface StatsReport {
  words: StateCounts;
  grammar: StateCounts;
  recall: RecallReport;
  targetRecall: number;
  forecast: ForecastDay[];
  minutes: { day: string; minutes: number }[];
  weakSpots: WeakSpot[];
  chapters: ChapterStats[];
  spend: UsageTotals;
  cap: number;
}

/** Item states per chapter, for every chapter in the list. */
export function chapterStats(db: DbOrTx): ChapterStats[] {
  const byChapter = chapterCoverage(
    listDeck(db).map((row) => ({ chapterId: row.item.chapterId, state: row.state })),
  );
  return listChapters(db).map((chapter) => ({
    chapter,
    counts: byChapter.get(chapter.id) ?? emptyCounts(),
  }));
}

/** Minutes studied on each of the last `days` days, oldest first. */
export function studyMinutes(db: DbOrTx, now: Date, days = MINUTES_DAYS) {
  const today = localDay(now);
  const since = startOfLocalDay(new Date(now.getTime() - days * DAY_MS));
  const answers = db
    .select({ at: review.reviewedAt, ms: review.responseMs })
    .from(review)
    .where(gte(review.reviewedAt, since))
    .all();
  const messages = chatMessageTimes(db)
    .filter((at) => at >= since)
    .map((at) => ({ at, ms: DEFAULT_ANSWER_MS }));
  const byDay = minutesByDay([...answers, ...messages]);
  return Array.from({ length: days }, (_, i) => {
    const day = addDays(today, i - days + 1);
    return { day, minutes: byDay.get(day) ?? 0 };
  });
}

/** Everything the Stats screen shows. */
export function statsReport(db: DbOrTx, now: Date): StatsReport {
  const time = now.getTime();
  const settings = getAllSettings(db);
  const deck = listDeck(db);
  const samples = db
    .select({
      reviewedAt: review.reviewedAt,
      mode: review.mode,
      rating: review.rating,
      stateBefore: review.stateBefore,
    })
    .from(review)
    .where(gte(review.reviewedAt, time - 30 * DAY_MS))
    .all();
  return {
    words: countStates(deck.filter((r) => r.item.kind !== 'grammar').map((r) => r.state)),
    grammar: countStates(deck.filter((r) => r.item.kind === 'grammar').map((r) => r.state)),
    recall: recallReport(samples, time),
    targetRecall: settings['study.targetRecall'],
    forecast: reviewForecast(queueCandidates(db), now),
    minutes: studyMinutes(db, now),
    weakSpots: weakSpots(db, now).slice(0, TOP_WEAK_SPOTS),
    chapters: chapterStats(db),
    spend: monthToDate(db, now),
    cap: settings['llm.monthlyCap'],
  };
}
