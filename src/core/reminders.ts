import type { StreakInfo } from './progress';

/**
 * The daily study reminder: one nudge a day at most, only once you opt in,
 * and none on a day you already studied. The copy is friendly and never
 * guilt-trips; a broken streak just means a fresh one can start.
 */

/** Reminder times on offer in Settings, as hours of the day. */
export const REMINDER_HOURS = [7, 12, 17, 19, 21] as const;

/**
 * Reminders are planned this many days ahead and planned again whenever
 * the app opens or a session ends. After a week away they go quiet until
 * you come back.
 */
export const REMINDER_DAYS = 7;

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

export function reminderText(current: number, freezes: number): { title: string; body: string } {
  if (current === 0) {
    return {
      title: 'Deine Wörter warten 📚',
      body: 'A few minutes is all it takes to start a streak.',
    };
  }
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
  return { title: 'Deine Wörter warten 🔥', body: keep + freeze };
}

/**
 * The next `days` reminders at `hour`, one a day. Today's is left out once
 * you studied or once the hour has passed, so the first one is today or
 * tomorrow.
 */
export function reminderPlan(
  streak: StreakInfo,
  hour: number,
  now: Date,
  days: number = REMINDER_DAYS,
): Reminder[] {
  const plan: Reminder[] = [];
  for (let ahead = 0; plan.length < days; ahead++) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + ahead, hour);
    if (ahead === 0 && (streak.activeToday || date <= now)) continue;
    const { current, freezes } = projectStreak(streak, ahead);
    plan.push({ date, ...reminderText(current, freezes) });
  }
  return plan;
}

/** When the next reminder fires and what it says, or null when there is none. */
export function nextReminder(streak: StreakInfo, hour: number, now: Date): Reminder | null {
  return reminderPlan(streak, hour, now, 1)[0] ?? null;
}
