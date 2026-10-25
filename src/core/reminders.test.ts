import { addDays, streakFor, type StreakInfo } from './progress';
import { nextReminder, projectStreak, reminderPlan, reminderText } from './reminders';
import { localDay } from './time';

const streak = (over: Partial<StreakInfo>): StreakInfo => ({
  current: 0,
  best: 0,
  activeToday: false,
  freezes: 0,
  frozen: [],
  ...over,
});

/** Every day from `first` through `last`. */
function daysFrom(first: string, last: string): Set<string> {
  const days = new Set<string>();
  for (let day = first; day <= last; day = addDays(day, 1)) days.add(day);
  return days;
}

describe('reminder plan', () => {
  const morning = new Date(2026, 9, 25, 9, 30);

  it('fires today at the hour while today is still open', () => {
    const next = nextReminder(streak({ current: 12 }), 19, morning);
    expect(next?.date).toEqual(new Date(2026, 9, 25, 19, 0));
    expect(next?.title).toBe('Deine Wörter warten 🔥');
    expect(next?.body).toBe('Keep your 12-day streak going.');
  });

  it('skips today once you studied', () => {
    const next = nextReminder(streak({ current: 13, activeToday: true }), 19, morning);
    expect(next?.date).toEqual(new Date(2026, 9, 26, 19, 0));
    expect(next?.body).toBe('Keep your 13-day streak going.');
  });

  it('skips today once the hour has passed', () => {
    const evening = new Date(2026, 9, 25, 19, 0);
    expect(nextReminder(streak({ current: 3 }), 19, evening)?.date).toEqual(
      new Date(2026, 9, 26, 19, 0),
    );
  });

  it('plans one reminder a day for a week, then goes quiet', () => {
    const plan = reminderPlan(streak({ current: 5, activeToday: true }), 7, morning);
    expect(plan.map((r) => localDay(r.date))).toEqual([
      '2026-10-26',
      '2026-10-27',
      '2026-10-28',
      '2026-10-29',
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
    ]);
    expect(plan.every((r) => r.date.getHours() === 7 && r.date.getMinutes() === 0)).toBe(true);
  });

  it('keeps the local hour across a clock change', () => {
    // Clocks go back on 25 October 2026 in Europe; the reminder stays at 19:00 local.
    const plan = reminderPlan(streak({}), 19, new Date(2026, 9, 24, 20, 0), 2);
    expect(plan.map((r) => r.date.getHours())).toEqual([19, 19]);
    expect(plan.map((r) => r.date.getDate())).toEqual([25, 26]);
  });

  it('tells each later day how the streak will stand by then', () => {
    // Studied today with one freeze banked: tomorrow the streak is safe,
    // the day after it rides on the freeze, then it is over.
    const plan = reminderPlan(streak({ current: 8, activeToday: true, freezes: 1 }), 19, morning);
    expect(plan.slice(0, 3).map((r) => r.body)).toEqual([
      'Keep your 8-day streak going. A streak freeze 🧊 has your back if today gets busy.',
      'Keep your 8-day streak going.',
      'A few minutes is all it takes to start a streak.',
    ]);
  });
});

describe('projected streak', () => {
  it('counts today as missed unless you studied', () => {
    expect(projectStreak(streak({ current: 4 }), 0)).toEqual({ current: 4, freezes: 0 });
    expect(projectStreak(streak({ current: 4 }), 1)).toEqual({ current: 0, freezes: 0 });
    expect(projectStreak(streak({ current: 4, activeToday: true }), 1)).toEqual({
      current: 4,
      freezes: 0,
    });
  });

  it('spends a freeze for each missed day', () => {
    const banked = streak({ current: 14, freezes: 2 });
    expect(projectStreak(banked, 1)).toEqual({ current: 14, freezes: 1 });
    expect(projectStreak(banked, 2)).toEqual({ current: 14, freezes: 0 });
    expect(projectStreak(banked, 3)).toEqual({ current: 0, freezes: 0 });
  });

  it('agrees with the streak computed on that day', () => {
    // Fourteen days in a row up to yesterday earns two freezes.
    const today = '2026-10-25';
    const studied = daysFrom('2026-10-11', '2026-10-24');
    const now = streakFor(studied, today);
    for (let ahead = 0; ahead <= 4; ahead++) {
      const later = streakFor(studied, addDays(today, ahead));
      expect(projectStreak(now, ahead)).toEqual({
        current: later.current,
        freezes: later.freezes,
      });
    }
  });
});

describe('reminder text', () => {
  it('invites you to start when there is no streak', () => {
    expect(reminderText(0, 0)).toEqual({
      title: 'Deine Wörter warten 📚',
      body: 'A few minutes is all it takes to start a streak.',
    });
  });

  it('reads naturally for a one-day streak', () => {
    expect(reminderText(1, 0).body).toBe('Keep your streak going: make it 2 days in a row.');
  });

  it('mentions banked freezes', () => {
    expect(reminderText(21, 2).body).toBe(
      'Keep your 21-day streak going. 2 streak freezes 🧊 have your back if today gets busy.',
    );
  });

  it('never guilt-trips', () => {
    const texts = [0, 1, 2, 30].flatMap((n) => [0, 1, 2].map((f) => reminderText(n, f)));
    for (const { title, body } of texts) {
      expect(`${title} ${body}`).not.toMatch(/lose|losing|lost|miss|don't|forget|break|sad/i);
    }
  });
});
