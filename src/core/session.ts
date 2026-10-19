import { isRecalled } from './rating';
import type { QueueEntry } from './queue';

/**
 * A review session as a pure state machine. Cards still in a short
 * learning step (minutes) come back within the session; when only those
 * are left, they are shown early instead of making you wait. The session
 * ends when the work runs out or, after the card in hand, at its deadline.
 */

export const LEARN_AHEAD_MS = 20 * 60 * 1000;

export interface SessionState {
  queue: QueueEntry[];
  learning: { entry: QueueEntry; due: number }[];
  answered: number;
  recalled: number;
  newItemIds: number[];
  /** Epoch ms after which no new card is shown. */
  deadline: number | null;
  /** Whether the session ended on time rather than running out of work. */
  timeUp: boolean;
  /** Where the card in hand came from: first showing, or back from a learning step. */
  source: 'queue' | 'learning' | null;
}

export function startSession(
  queue: readonly QueueEntry[],
  deadline: number | null = null,
): SessionState {
  return {
    queue: [...queue],
    learning: [],
    answered: 0,
    recalled: 0,
    newItemIds: [],
    deadline,
    timeUp: false,
    source: null,
  };
}

export function nextEntry(
  state: SessionState,
  now: number,
): { state: SessionState; entry: QueueEntry | null } {
  if (state.deadline !== null && now >= state.deadline && remaining(state) > 0) {
    return { state: { ...state, timeUp: true }, entry: null };
  }
  const learning = [...state.learning].sort((a, b) => a.due - b.due);
  const ready = learning[0];

  const fromLearning = { ...state, learning: learning.slice(1), source: 'learning' as const };
  if (ready && ready.due <= now) return { state: fromLearning, entry: ready.entry };
  if (state.queue.length > 0) {
    return {
      state: { ...state, queue: state.queue.slice(1), source: 'queue' },
      entry: state.queue[0],
    };
  }
  if (ready && ready.due - now <= LEARN_AHEAD_MS)
    return { state: fromLearning, entry: ready.entry };
  return { state: { ...state, source: null }, entry: null };
}

export function recordAnswer(
  state: SessionState,
  entry: QueueEntry,
  result: { rating: number; nextDue: number },
  now: number,
): SessionState {
  const next: SessionState = {
    ...state,
    answered: state.answered + 1,
    recalled: state.recalled + (isRecalled(result.rating) ? 1 : 0),
    newItemIds:
      entry.kind === 'new_item' && !state.newItemIds.includes(entry.itemId)
        ? [...state.newItemIds, entry.itemId]
        : state.newItemIds,
  };
  if (result.nextDue - now <= LEARN_AHEAD_MS) {
    // Back as a plain review: the introduction only shows once.
    next.learning = [
      ...state.learning,
      { entry: { ...entry, kind: 'review' }, due: result.nextDue },
    ];
  }
  return next;
}

export function remaining(state: SessionState): number {
  return state.queue.length + state.learning.length;
}

/**
 * For the header: cards not seen yet this session, and cards coming back
 * from a short learning step. Counting both as one number would stall it
 * while you work through new cards, since each one comes back once.
 * `inHand` is true while the current card is still unanswered.
 */
export function progress(state: SessionState, inHand: boolean): { left: number; again: number } {
  return {
    left: state.queue.length + (inHand && state.source === 'queue' ? 1 : 0),
    again: state.learning.length + (inHand && state.source === 'learning' ? 1 : 0),
  };
}

export function accuracy(state: SessionState): number | null {
  return state.answered ? state.recalled / state.answered : null;
}
