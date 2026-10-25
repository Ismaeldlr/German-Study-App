import type { ExerciseMode } from './model';
import { isRecalled } from './rating';
import { localDay } from './time';

/**
 * The game layer: XP, levels, streaks and badges. Everything here is
 * derived from the review log, so it needs no tables of its own, survives
 * a backup round trip and can never drift from what you actually studied.
 */

/** XP for a remembered card, by how it was asked. Producing German is worth more than recognising it. */
export const XP_BY_MODE: Record<ExerciseMode, number> = {
  classic: 10,
  gap_fill: 12,
  grammar_drill: 15,
  contrast: 10,
  translation: 15,
  story: 12,
  chat: 15,
};

/** A miss still earns a little: showing up is the habit we want. */
export const XP_FOR_MISS = 2;

export function xpFor(mode: ExerciseMode, rating: number): number {
  return isRecalled(rating) ? XP_BY_MODE[mode] : XP_FOR_MISS;
}

/** Daily goal presets. About 30 XP is a minute of study. */
export const DAILY_GOALS = [
  { xp: 50, label: 'Casual' },
  { xp: 100, label: 'Regular' },
  { xp: 200, label: 'Serious' },
  { xp: 350, label: 'Intense' },
] as const;

export const XP_PER_MINUTE = 30;

/**
 * The goal counts as met once you reach it, or once you studied today and
 * nothing is left: spaced repetition decides how much there is to do, and
 * finishing all of it should never feel like falling short.
 */
export function goalMet(todayXp: number, goal: number, nothingLeft: boolean): boolean {
  return todayXp >= goal || (todayXp > 0 && nothingLeft);
}

// Levels ---------------------------------------------------------------

/** Level titles, in German: each one is a word worth knowing. */
export const LEVEL_TITLES = [
  { de: 'Neuling', en: 'newcomer' },
  { de: 'Anfänger', en: 'beginner' },
  { de: 'Lehrling', en: 'apprentice' },
  { de: 'Entdecker', en: 'explorer' },
  { de: 'Sammler', en: 'collector' },
  { de: 'Satzbauer', en: 'sentence builder' },
  { de: 'Sprachfreund', en: 'friend of the language' },
  { de: 'Geselle', en: 'journeyman' },
  { de: 'Kenner', en: 'connoisseur' },
  { de: 'Wortschmied', en: 'wordsmith' },
  { de: 'Grammatikfuchs', en: 'grammar fox' },
  { de: 'Bücherwurm', en: 'bookworm' },
  { de: 'Plaudertasche', en: 'chatterbox' },
  { de: 'Sprachtalent', en: 'natural talent' },
  { de: 'Experte', en: 'expert' },
  { de: 'Meister', en: 'master' },
  { de: 'Großmeister', en: 'grandmaster' },
  { de: 'Sprachkünstler', en: 'language artist' },
  { de: 'Dichter', en: 'poet' },
  { de: 'Sprachgenie', en: 'language genius' },
] as const;

/** XP at which `level` starts. Each level asks 250 XP more than the one before. */
export function levelStartXp(level: number): number {
  return 125 * (level - 1) * level;
}

export interface LevelInfo {
  level: number;
  title: { de: string; en: string };
  /** XP where this level started and where the next one starts. */
  floor: number;
  next: number;
  /** How far into this level, 0 to 1. */
  fraction: number;
}

export function levelFor(xp: number): LevelInfo {
  const total = Math.max(0, xp);
  let level = Math.max(1, Math.floor((1 + Math.sqrt(1 + (4 * total) / 125)) / 2));
  // Guard against rounding at the boundaries.
  while (levelStartXp(level + 1) <= total) level++;
  while (level > 1 && levelStartXp(level) > total) level--;
  const floor = levelStartXp(level);
  const next = levelStartXp(level + 1);
  return {
    level,
    title: LEVEL_TITLES[Math.min(level, LEVEL_TITLES.length) - 1],
    floor,
    next,
    fraction: (total - floor) / (next - floor),
  };
}

// Streaks --------------------------------------------------------------

/** A freeze is earned every this many days in a row, and you can bank at most `MAX_FREEZES`. */
export const FREEZE_EVERY = 7;
export const MAX_FREEZES = 2;

export interface StreakInfo {
  /** Days in the current streak, today included once you studied. */
  current: number;
  best: number;
  activeToday: boolean;
  /** Freezes in the bank. */
  freezes: number;
  /** Missed days a freeze covered, so the calendar can show them. */
  frozen: string[];
}

/** The local day `days` after a YYYY-MM-DD day. */
export function addDays(day: string, days: number): string {
  const [y, m, d] = day.split('-').map(Number);
  return localDay(new Date(y, m - 1, d + days));
}

/**
 * The streak from the days you studied. A missed day spends a freeze if
 * you have one, so one busy day does not wipe out weeks of work. Today
 * never breaks the streak: there is still time.
 */
export function streakFor(activeDays: ReadonlySet<string>, today: string): StreakInfo {
  const empty = { current: 0, best: 0, activeToday: false, freezes: 0, frozen: [] };
  if (activeDays.size === 0) return empty;
  const first = [...activeDays].sort()[0];
  if (first > today) return empty;

  let streak = 0;
  let best = 0;
  let freezes = 0;
  const frozen: string[] = [];
  const studied = () => {
    streak++;
    if (streak % FREEZE_EVERY === 0) freezes = Math.min(MAX_FREEZES, freezes + 1);
    best = Math.max(best, streak);
  };
  for (let day = first; day < today; day = addDays(day, 1)) {
    if (activeDays.has(day)) studied();
    else if (streak > 0 && freezes > 0) {
      freezes--;
      frozen.push(day);
    } else streak = 0;
  }
  const activeToday = activeDays.has(today);
  if (activeToday) studied();
  return { current: streak, best, activeToday, freezes, frozen };
}

// Badges ---------------------------------------------------------------

export interface ProgressStats {
  reviews: number;
  words: number;
  matureWords: number;
  bestStreak: number;
  level: number;
  /** Sessions of 10+ cards with every card remembered. */
  perfectSessions: number;
  translationsRight: number;
  drillsDone: number;
  /** Studied before 8 in the morning, or after 10 at night. */
  earlyBird: boolean;
  nightOwl: boolean;
}

export interface Achievement {
  id: string;
  icon: string;
  title: string;
  description: string;
  target: number;
  value: (stats: ProgressStats) => number;
}

const flag = (on: boolean) => (on ? 1 : 0);

export const ACHIEVEMENTS: readonly Achievement[] = [
  {
    id: 'first-steps',
    icon: '👣',
    title: 'Erste Schritte',
    description: 'Answer your first card',
    target: 1,
    value: (s) => s.reviews,
  },
  {
    id: 'streak-3',
    icon: '🔥',
    title: 'Auf Kurs',
    description: 'Study 3 days in a row',
    target: 3,
    value: (s) => s.bestStreak,
  },
  {
    id: 'streak-7',
    icon: '📅',
    title: 'Eine Woche',
    description: 'Study 7 days in a row',
    target: 7,
    value: (s) => s.bestStreak,
  },
  {
    id: 'streak-30',
    icon: '🚀',
    title: 'Unaufhaltsam',
    description: 'Study 30 days in a row',
    target: 30,
    value: (s) => s.bestStreak,
  },
  {
    id: 'words-50',
    icon: '📚',
    title: 'Wortschatz',
    description: 'Have 50 words in your deck',
    target: 50,
    value: (s) => s.words,
  },
  {
    id: 'words-200',
    icon: '🏛️',
    title: 'Bibliothek',
    description: 'Have 200 words in your deck',
    target: 200,
    value: (s) => s.words,
  },
  {
    id: 'mature-25',
    icon: '🐘',
    title: 'Elefantengedächtnis',
    description: 'Master 25 words for the long term',
    target: 25,
    value: (s) => s.matureWords,
  },
  {
    id: 'mature-100',
    icon: '👑',
    title: 'Wortmeister',
    description: 'Master 100 words for the long term',
    target: 100,
    value: (s) => s.matureWords,
  },
  {
    id: 'reviews-500',
    icon: '💪',
    title: 'Fleißig',
    description: 'Answer 500 cards',
    target: 500,
    value: (s) => s.reviews,
  },
  {
    id: 'reviews-2000',
    icon: '🏔️',
    title: 'Tausendsassa',
    description: 'Answer 2,000 cards',
    target: 2000,
    value: (s) => s.reviews,
  },
  {
    id: 'perfect',
    icon: '💎',
    title: 'Perfektionist',
    description: 'Remember every card in a session of 10 or more',
    target: 1,
    value: (s) => s.perfectSessions,
  },
  {
    id: 'translator',
    icon: '🗣️',
    title: 'Übersetzer',
    description: 'Get 10 translations right',
    target: 10,
    value: (s) => s.translationsRight,
  },
  {
    id: 'grammar',
    icon: '🧩',
    title: 'Grammatikfan',
    description: 'Finish 10 grammar drills',
    target: 10,
    value: (s) => s.drillsDone,
  },
  {
    id: 'level-5',
    icon: '⭐',
    title: 'Aufsteiger',
    description: 'Reach level 5',
    target: 5,
    value: (s) => s.level,
  },
  {
    id: 'early-bird',
    icon: '🌅',
    title: 'Frühaufsteher',
    description: 'Study before 8 in the morning',
    target: 1,
    value: (s) => flag(s.earlyBird),
  },
  {
    id: 'night-owl',
    icon: '🦉',
    title: 'Nachteule',
    description: 'Study after 10 at night',
    target: 1,
    value: (s) => flag(s.nightOwl),
  },
];

export interface AchievementState {
  achievement: Achievement;
  value: number;
  unlocked: boolean;
}

export function achievementStates(stats: ProgressStats): AchievementState[] {
  return ACHIEVEMENTS.map((achievement) => {
    const value = Math.min(achievement.value(stats), achievement.target);
    return { achievement, value, unlocked: value >= achievement.target };
  });
}

// Microcopy ------------------------------------------------------------

const PRAISE = {
  correct: ['Super!', 'Genau!', 'Klasse!', 'Prima!', 'Toll!', 'Wunderbar!', 'Spitze!', 'Stark!'],
  slip: ['Fast!', 'Beinahe!', 'Knapp!'],
  wrong: ['Kopf hoch!', 'Nicht schlimm', 'Das wird noch!'],
  revealed: ['Gut zu wissen', 'Jetzt weißt du es'],
  pending: ['Gespeichert'],
} as const;

/** A German cheer for an answer. `seed` keeps the pick stable while the feedback is on screen. */
export function praiseFor(outcome: keyof typeof PRAISE, seed: number): string {
  const options = PRAISE[outcome];
  return options[Math.abs(Math.floor(seed)) % options.length];
}

export function greeting(date: Date): string {
  const hour = date.getHours();
  if (hour < 5) return 'Noch wach?';
  if (hour < 11) return 'Guten Morgen!';
  if (hour < 18) return 'Guten Tag!';
  return 'Guten Abend!';
}

export const WEEKDAYS_DE = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'] as const;
const WEEKDAY_NAMES_DE = [
  'Sonntag',
  'Montag',
  'Dienstag',
  'Mittwoch',
  'Donnerstag',
  'Freitag',
  'Samstag',
];
const MONTHS_DE = [
  'Januar',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember',
];

/** "Sonntag, 25. Oktober". */
export function germanDate(date: Date): string {
  return `${WEEKDAY_NAMES_DE[date.getDay()]}, ${date.getDate()}. ${MONTHS_DE[date.getMonth()]}`;
}

/** Pick the same entry all day, and a different one tomorrow. */
export function pickForDay<T>(items: readonly T[], day: string): T | null {
  if (items.length === 0) return null;
  let hash = 0;
  for (const char of day) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return items[Math.abs(hash) % items.length];
}
