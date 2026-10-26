import { DAY_MS, startOfLocalDay } from './time';

/**
 * The Study session's finisher: once the cards are done, a mini story or
 * a short chat, alternating, on about three days a week. In practice that
 * is every other day, counting stories and chats you did from Practice too.
 */

export type FinisherKind = 'story' | 'chat';

/** A finisher comes when the last story or chat was at least this many days ago. */
export const FINISHER_GAP_DAYS = 2;

export interface LastPractice {
  /** When you last read a story, or null. */
  story: number | null;
  /** When you last finished a chat, or null. */
  chat: number | null;
}

/**
 * The finishers to try today, best first, or none when it is not a
 * finisher day. The kind you did less recently goes first, so they
 * alternate; with neither done yet, a story, since it works offline.
 */
export function finisherKinds(last: LastPractice, now: Date): FinisherKind[] {
  const story = last.story ?? -Infinity;
  const chat = last.chat ?? -Infinity;
  const latest = Math.max(story, chat);
  if (Number.isFinite(latest) && daysBetween(latest, now.getTime()) < FINISHER_GAP_DAYS) return [];
  return chat < story ? ['chat', 'story'] : ['story', 'chat'];
}

/** Calendar days from one moment to another, in local time. */
export function daysBetween(from: number, to: number): number {
  return Math.round((startOfLocalDay(new Date(to)) - startOfLocalDay(new Date(from))) / DAY_MS);
}
