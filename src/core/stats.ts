import { CardState, type ItemState } from './cards';
import type { ExerciseMode } from './model';
import { addDays } from './progress';
import { isRecalled } from './rating';
import { DAY_MS, localDay } from './time';

/**
 * The numbers behind the Stats screen. They answer one question: am I
 * actually getting better at what class teaches? Everything comes from the
 * review log and the cards, so nothing here is stored.
 */

// Recall -----------------------------------------------------------------

export interface RecallSample {
  reviewedAt: number;
  mode: ExerciseMode;
  rating: number;
  /** The card's FSRS state before the answer. */
  stateBefore: number;
}

export interface Recall {
  answers: number;
  recalled: number;
}

export interface RecallWindows {
  week: Recall;
  month: Recall;
}

export interface RecallReport {
  overall: RecallWindows;
  /** Modes with any answers in the last 30 days, most answered first. */
  modes: (RecallWindows & { mode: ExerciseMode })[];
}

/**
 * Real recall over the last 7 and 30 days, overall and per exercise mode.
 * Only answers on cards in review count: missing a word in its first
 * learning steps is expected, and counting it would hide whether reviews
 * land near the target recall FSRS aims for. Split by mode, a strong gap
 * fill cannot hide a weak translation.
 */
export function recallReport(samples: readonly RecallSample[], now: number): RecallReport {
  const weekStart = now - 7 * DAY_MS;
  const monthStart = now - 30 * DAY_MS;
  const empty = (): RecallWindows => ({
    week: { answers: 0, recalled: 0 },
    month: { answers: 0, recalled: 0 },
  });
  const overall = empty();
  const byMode = new Map<ExerciseMode, RecallWindows>();
  for (const s of samples) {
    if (s.stateBefore !== CardState.Review || s.reviewedAt < monthStart || s.reviewedAt > now) {
      continue;
    }
    const mode = byMode.get(s.mode) ?? empty();
    byMode.set(s.mode, mode);
    const hit = isRecalled(s.rating) ? 1 : 0;
    for (const windows of [overall, mode]) {
      windows.month.answers++;
      windows.month.recalled += hit;
      if (s.reviewedAt >= weekStart) {
        windows.week.answers++;
        windows.week.recalled += hit;
      }
    }
  }
  const modes = [...byMode.entries()]
    .map(([mode, windows]) => ({ mode, ...windows }))
    .sort((a, b) => b.month.answers - a.month.answers);
  return { overall, modes };
}

/** Share remembered, or null with nothing to go on. */
export function recallShare(recall: Recall): number | null {
  return recall.answers ? recall.recalled / recall.answers : null;
}

// Forecast ---------------------------------------------------------------

export const FORECAST_DAYS = 14;

export interface ForecastDay {
  day: string;
  count: number;
}

/**
 * Reviews coming due on each of the next `days` days, today first. Today
 * also holds everything overdue. New cards are left out: how many of them
 * you meet is up to the daily allowance, not the schedule.
 */
export function reviewForecast(
  cards: readonly { state: number; due: number }[],
  now: Date,
  days: number = FORECAST_DAYS,
): ForecastDay[] {
  const today = localDay(now);
  const forecast = Array.from({ length: days }, (_, i) => ({ day: addDays(today, i), count: 0 }));
  const index = new Map(forecast.map((f, i) => [f.day, i]));
  for (const card of cards) {
    if (card.state === CardState.New) continue;
    const day = localDay(new Date(card.due));
    if (day <= today) forecast[0].count++;
    else {
      const i = index.get(day);
      if (i !== undefined) forecast[i].count++;
    }
  }
  return forecast;
}

// Time studied -----------------------------------------------------------

/** A gap longer than this between two answers is a break, not study time. */
export const BREAK_MS = 5 * 60_000;
/** Time given to an answer that starts a stretch and has no response time of its own. */
export const DEFAULT_ANSWER_MS = 15_000;

export interface ActivityEvent {
  at: number;
  /** How long the answer took, when known. */
  ms: number | null;
}

/**
 * Minutes studied per local day, from the times you answered. The time
 * between two answers counts as study unless it is a break; the first
 * answer after a break counts its own response time. That covers reading
 * feedback and stories without counting the phone lying on the table.
 */
export function minutesByDay(events: readonly ActivityEvent[]): Map<string, number> {
  const sorted = [...events].sort((a, b) => a.at - b.at);
  const ms = new Map<string, number>();
  let previous: number | null = null;
  for (const event of sorted) {
    const gap = previous === null ? Infinity : event.at - previous;
    const spent = gap <= BREAK_MS ? gap : Math.min(event.ms ?? DEFAULT_ANSWER_MS, BREAK_MS);
    const day = localDay(new Date(event.at));
    ms.set(day, (ms.get(day) ?? 0) + spent);
    previous = event.at;
  }
  return new Map([...ms].map(([day, total]) => [day, total / 60_000]));
}

// Deck and chapters ------------------------------------------------------

export type StateCounts = Record<ItemState, number> & { total: number };

export function emptyCounts(): StateCounts {
  return { new: 0, learning: 0, young: 0, mature: 0, suspended: 0, total: 0 };
}

export function countStates(states: Iterable<ItemState>): StateCounts {
  const counts = emptyCounts();
  for (const state of states) {
    counts[state]++;
    counts.total++;
  }
  return counts;
}

/**
 * How much of a chapter is learned for the long term: the share of its
 * items that are mature. Suspended items are left out, since you chose not
 * to study them.
 */
export function coverageShare(counts: StateCounts): number {
  const active = counts.total - counts.suspended;
  return active ? counts.mature / active : 0;
}

/** Item states per chapter. Items without a chapter are left out. */
export function chapterCoverage(
  rows: readonly { chapterId: number | null; state: ItemState }[],
): Map<number, StateCounts> {
  const byChapter = new Map<number, StateCounts>();
  for (const row of rows) {
    if (row.chapterId === null) continue;
    const counts = byChapter.get(row.chapterId) ?? emptyCounts();
    counts[row.state]++;
    counts.total++;
    byChapter.set(row.chapterId, counts);
  }
  return byChapter;
}
