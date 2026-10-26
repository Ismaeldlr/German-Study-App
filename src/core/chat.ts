import type { MistakeNote } from './grading';
import type { MistakeCategory } from './model';
import type { SentenceVerdict, TargetVerdict } from './translation';

/**
 * Chat roleplay: you talk with a character in a scenario that fits the
 * topic, and the character steers toward your target words. Each of your
 * messages gets a correction under it, so the conversation keeps moving.
 * When the chat ends, every target word you used gets one rating; a word
 * you never had to produce gets none.
 */

/** Your messages in a chat from the Practice section. */
export const CHAT_TURNS = 10;
/** Your messages in the short chat that can close a Study session. */
export const FINISHER_CHAT_TURNS = 5;
/** The model sees a rolling summary plus this many of the latest exchanges, never the whole chat. */
export const CHAT_CONTEXT_TURNS = 6;
/** Deck words a chat steers toward. */
export const CHAT_TARGETS = 4;
/** A message longer than this is cut, so one turn cannot blow the budget. */
export const CHAT_MESSAGE_MAX = 400;
/** XP for each message you write: a chat is work even when no target word comes up. */
export const XP_PER_CHAT_MESSAGE = 10;

export interface ChatTarget {
  cardId: number;
  itemId: number;
  /** As written on a card: "die Miete". */
  word: string;
  meaning: string;
}

export interface ChatScenario {
  /** A short German title: "Die Wohnungsbesichtigung". */
  title: string;
  /** Who the character is, in English: "Frau Becker, the landlord". */
  character: string;
  /** Who you are and what you want, in English. */
  situation: string;
}

export interface ChatError {
  category: MistakeCategory;
  /** The wrong part as you wrote it. */
  text: string;
  correction: string;
  explanation: string;
}

/** The check under one of your messages. */
export interface ChatCorrection {
  verdict: SentenceVerdict;
  /** Your message with only the errors fixed. */
  corrected: string;
  errors: ChatError[];
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  /** When it was sent, for XP by day. */
  at: number;
  /** The character's line in English, shown on tap. */
  translation?: string;
  /** Your message, checked. */
  correction?: ChatCorrection;
  /** Target words this message of yours used, and how well. */
  used?: { word: string; verdict: TargetVerdict }[];
}

/** How a target word did over the whole chat. */
export interface ChatWordResult {
  cardId: number;
  itemId: number;
  word: string;
  outcome: 'correct' | 'slip' | 'wrong';
  rating: number;
}

/** What a finished chat comes to. */
export interface ChatResult {
  /** A few English sentences from the LLM, or null when it could not be reached. */
  feedback: string | null;
  /** German words and phrases you used well. */
  wellUsed: string[];
  /** The target words you used, with the rating each got. */
  words: ChatWordResult[];
}

export function userTurns(messages: readonly ChatMessage[]): number {
  return messages.filter((m) => m.role === 'user').length;
}

/** The latest exchanges the model sees; anything older lives on in the rolling summary. */
export function contextWindow(
  messages: readonly ChatMessage[],
  turns = CHAT_CONTEXT_TURNS,
): ChatMessage[] {
  return messages.slice(-turns * 2);
}

/** Every verdict a target word got across your messages. */
export function wordVerdicts(
  target: Pick<ChatTarget, 'word'>,
  messages: readonly ChatMessage[],
): TargetVerdict[] {
  const key = wordKey(target.word);
  return messages.flatMap((m) =>
    m.role === 'user'
      ? (m.used ?? []).filter((u) => wordKey(u.word) === key).map((u) => u.verdict)
      : [],
  );
}

/**
 * One outcome per word for the whole chat. Using it right every time is
 * right; getting it right at least once, or only slipping, is a slip; only
 * wrong uses are wrong. A word you never used gets no outcome at all.
 */
export function chatWordOutcome(
  verdicts: readonly TargetVerdict[],
): 'correct' | 'slip' | 'wrong' | null {
  const used = verdicts.filter((v) => v !== 'missing');
  if (used.length === 0) return null;
  if (used.every((v) => v === 'correct')) return 'correct';
  if (used.some((v) => v === 'correct' || v === 'slip')) return 'slip';
  return 'wrong';
}

/** The mistakes in one of your messages, for the weak spots. */
export function messageMistakes(message: ChatMessage): MistakeNote[] {
  return (message.correction?.errors ?? []).map((e) => ({
    category: e.category,
    yourText: e.text,
    correction: e.correction,
    explanation: e.explanation,
  }));
}

/** "die Miete" and "Miete" are the same target. */
export function wordKey(word: string): string {
  return word
    .trim()
    .toLowerCase()
    .replace(/^(der|die|das)\s+/, '');
}
