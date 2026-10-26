import { plural } from './format';
import type { StreakInfo } from './progress';

/**
 * The daily study reminder: one nudge a day, plus an evening one if you
 * want it, only once you opt in, and none on a day you already studied. It
 * names the work waiting. The copy is friendly and never guilt-trips; a
 * broken streak just means a fresh one can start.
 */

/** Reminder times on offer in Settings, as hours of the day. */
export const REMINDER_HOURS = [7, 12, 17, 19, 21] as const;

/**
 * Reminders are planned this many days ahead and planned again whenever
 * the app opens or a session ends. After a week away they go quiet until
 * you come back.
 */
export const REMINDER_DAYS = 7;

/** The optional second reminder fires at this hour, if the first one is earlier. */
export const EVENING_HOUR = 21;

/** What is waiting on a day: cards to review, and new words to meet. */
export interface ReminderWork {
  reviews: number;
  newWords: number;
}

export interface Reminder {
  date: Date;
  title: string;
  body: string;
}

/** "19:00". */
export function hourLabel(hour: number): string {
  return `${hour}:00`;
}

/**
 * The streak as it will stand `daysAhead` days from today if you do not
 * study before then: each missed day spends a freeze, and once none are
 * left the streak is over. Today counts as missed unless you studied.
 */
export function projectStreak(
  streak: StreakInfo,
  daysAhead: number,
): { current: number; freezes: number } {
  if (daysAhead === 0) return { current: streak.current, freezes: streak.freezes };
  const missed = daysAhead - (streak.activeToday ? 1 : 0);
  return missed <= streak.freezes
    ? { current: streak.current, freezes: streak.freezes - missed }
    : { current: 0, freezes: 0 };
}

/** "23 reviews and 4 new words are waiting." Empty when nothing is. */
export function workText(work: ReminderWork | null): string {
  if (!work || (work.reviews === 0 && work.newWords === 0)) return '';
  const parts = [
    work.reviews ? plural(work.reviews, 'review') : null,
    work.newWords ? plural(work.newWords, 'new word') : null,
  ].filter(Boolean);
  const one = parts.length === 1 && (work.reviews === 1 || (!work.reviews && work.newWords === 1));
  return `${parts.join(' and ')} ${one ? 'is' : 'are'} waiting.`;
}

/**
 * A reminder's title and text: the work waiting, then the streak. The
 * evening one says there is still time today.
 */
export function reminderText(
  current: number,
  freezes: number,
  work: ReminderWork | null = null,
  evening = false,
): { title: string; body: string } {
  const lead = workText(work);
  const text = streakText(current, freezes);
  return {
    title: evening
      ? 'Noch Zeit heute 🌙'
      : current
        ? 'Deine Wörter warten 🔥'
        : 'Deine Wörter warten 📚',
    body: lead ? `${lead} ${text}` : text,
  };
}

function streakText(current: number, freezes: number): string {
  if (current === 0) return 'A few minutes is all it takes to start a streak.';
  const keep =
    current === 1
      ? 'Keep your streak going: make it 2 days in a row.'
      : `Keep your ${current}-day streak going.`;
  const freeze =
    freezes === 0
      ? ''
      : freezes === 1
        ? ' A streak freeze 🧊 has your back if today gets busy.'
        : ` ${freezes} streak freezes 🧊 have your back if today gets busy.`;
  return keep + freeze;
}

export interface PlanOptions {
  /** Add a reminder at EVENING_HOUR too, when the first one is earlier. */
  evening?: boolean;
  /** The work waiting `ahead` days from today, if you do not study before then. */
  workOn?: (ahead: number) => ReminderWork | null;
}

/**
 * Reminders for the next `days` days at `hour`, and in the evening if
 * asked. Today's are left out once you studied or once their hour has
 * passed, so the first one is today or tomorrow.
 */
export function reminderPlan(
  streak: StreakInfo,
  hour: number,
  now: Date,
  days: number = REMINDER_DAYS,
  options: PlanOptions = {},
): Reminder[] {
  const hours = options.evening && hour < EVENING_HOUR ? [hour, EVENING_HOUR] : [hour];
  const plan: Reminder[] = [];
  for (let ahead = 0, planned = 0; planned < days; ahead++) {
    const dates = hours
      .map((h) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + ahead, h))
      .filter((date) => ahead > 0 || (!streak.activeToday && date > now));
    if (dates.length === 0) continue;
    planned++;
    const { current, freezes } = projectStreak(streak, ahead);
    const work = options.workOn?.(ahead) ?? null;
    for (const date of dates) {
      plan.push({ date, ...reminderText(current, freezes, work, date.getHours() !== hour) });
    }
  }
  return plan;
}

/** When the next reminder fires and what it says, or null when there is none. */
export function nextReminder(
  streak: StreakInfo,
  hour: number,
  now: Date,
  options: PlanOptions = {},
): Reminder | null {
  return reminderPlan(streak, hour, now, 1, options)[0] ?? null;
}
