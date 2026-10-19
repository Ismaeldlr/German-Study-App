import { shuffle } from './choices';
import type { InflectionSource } from './inflection';

/**
 * The exercise selector bundles work for the LLM. Each bundle holds one
 * target card, up to three support words and a topic. At-risk words go in
 * first: reading them in context refreshes them without counting as a
 * review. Support words are spread over the batch rather than repeated.
 */

export const SUPPORT_MAX = 3;
const AT_RISK_LEAD = 2;

export interface GapTarget {
  cardId: number;
  itemId: number;
  /** How the word is written on a card: "die Wohnung". */
  word: string;
  meanings: string[];
  forms: InflectionSource;
}

export interface SupportWord {
  itemId: number;
  word: string;
  atRisk: boolean;
}

export interface GapBundle {
  id: number;
  target: GapTarget;
  support: string[];
  topic: string;
}

export function buildGapBundles(
  targets: readonly GapTarget[],
  pool: readonly SupportWord[],
  nextTopic: () => string,
  random: () => number = Math.random,
): GapBundle[] {
  const used = new Map<number, number>();
  // At-risk words lead until they have appeared AT_RISK_LEAD more times than the rest.
  const score = (s: SupportWord) => (used.get(s.itemId) ?? 0) - (s.atRisk ? AT_RISK_LEAD : 0);
  return targets.map((target, index) => {
    const candidates = shuffle(
      pool.filter((p) => p.itemId !== target.itemId),
      random,
    ).sort((a, b) => score(a) - score(b));
    const support = candidates.slice(0, SUPPORT_MAX);
    for (const s of support) used.set(s.itemId, (used.get(s.itemId) ?? 0) + 1);
    return { id: index + 1, target, support: support.map((s) => s.word), topic: nextTopic() };
  });
}
