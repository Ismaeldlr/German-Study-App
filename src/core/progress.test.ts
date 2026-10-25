import {
  achievementStates,
  addDays,
  goalMet,
  levelFor,
  levelStartXp,
  pickForDay,
  praiseFor,
  streakFor,
  xpFor,
  type ProgressStats,
} from './progress';

describe('XP', () => {
  it('pays more for production and a little for a miss', () => {
    expect(xpFor('classic', 3)).toBe(10);
    expect(xpFor('translation', 2)).toBe(15);
    expect(xpFor('gap_fill', 1)).toBe(2);
  });

  it('meets the goal by XP, or by finishing everything there was', () => {
    expect(goalMet(100, 100, false)).toBe(true);
    expect(goalMet(40, 100, true)).toBe(true);
    expect(goalMet(0, 100, true)).toBe(false);
    expect(goalMet(40, 100, false)).toBe(false);
  });
});

describe('levels', () => {
  it('asks 250 XP more for each level', () => {
    expect([1, 2, 3, 4, 5].map(levelStartXp)).toEqual([0, 250, 750, 1500, 2500]);
  });

  it('places XP in a level, right at the boundaries too', () => {
    expect(levelFor(0)).toMatchObject({ level: 1, floor: 0, next: 250, fraction: 0 });
    expect(levelFor(249).level).toBe(1);
    expect(levelFor(250)).toMatchObject({ level: 2, fraction: 0 });
    expect(levelFor(1125)).toMatchObject({ level: 3, fraction: 0.5 });
    expect(levelFor(2500).title.de).toBe('Sammler');
  });

  it('keeps the last title past the end of the list', () => {
    expect(levelFor(levelStartXp(40)).title.de).toBe('Sprachgenie');
  });
});

describe('streaks', () => {
  const run = (start: string, length: number) =>
    Array.from({ length }, (_, i) => addDays(start, i));

  it('counts days in a row, and today only once you studied', () => {
    const days = new Set(run('2026-10-20', 3));
    expect(streakFor(days, '2026-10-22')).toMatchObject({ current: 3, activeToday: true });
    expect(streakFor(days, '2026-10-23')).toMatchObject({ current: 3, activeToday: false });
    expect(streakFor(days, '2026-10-24').current).toBe(0);
  });

  it('spends a freeze earned after a week on a missed day', () => {
    const days = new Set([...run('2026-10-01', 7), ...run('2026-10-09', 2)]);
    const streak = streakFor(days, '2026-10-10');
    expect(streak).toMatchObject({ current: 9, best: 9, freezes: 0, frozen: ['2026-10-08'] });
  });

  it('breaks without a freeze and remembers the best run', () => {
    const days = new Set([...run('2026-10-01', 5), '2026-10-08']);
    expect(streakFor(days, '2026-10-08')).toMatchObject({ current: 1, best: 5 });
  });

  it('crosses month ends', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('badges', () => {
  const stats: ProgressStats = {
    reviews: 1,
    words: 60,
    matureWords: 3,
    bestStreak: 4,
    level: 2,
    perfectSessions: 0,
    translationsRight: 0,
    drillsDone: 0,
    earlyBird: true,
    nightOwl: false,
  };

  it('unlocks what you reached and shows progress on the rest', () => {
    const byId = new Map(achievementStates(stats).map((s) => [s.achievement.id, s]));
    expect(byId.get('first-steps')?.unlocked).toBe(true);
    expect(byId.get('words-50')).toMatchObject({ unlocked: true, value: 50 });
    expect(byId.get('streak-7')).toMatchObject({ unlocked: false, value: 4 });
    expect(byId.get('early-bird')?.unlocked).toBe(true);
    expect(byId.get('night-owl')?.unlocked).toBe(false);
  });
});

describe('microcopy', () => {
  it('picks a stable cheer and a stable word of the day', () => {
    expect(praiseFor('correct', 7)).toBe(praiseFor('correct', 7));
    expect(pickForDay(['a', 'b', 'c'], '2026-10-25')).toBe(
      pickForDay(['a', 'b', 'c'], '2026-10-25'),
    );
    expect(pickForDay([], '2026-10-25')).toBeNull();
  });
});
