import { foldUmlauts, normalizeAnswer } from './answers';
import { coreWord, isFormOf, type InflectionSource } from './inflection';

/**
 * Leeches and confused pairs. A card that lapses six times gets flagged,
 * and again every three lapses after that, so a card you chose to keep
 * comes back to your attention only if it keeps failing. Two words you
 * mix up twice or more become a confused pair, practised together.
 */

export const LEECH_LAPSES = 6;
export const LEECH_REPEAT = 3;
export const CONFUSION_MIN = 2;

/** Whether reaching this many lapses flags the card. */
export function isLeechLapse(lapses: number): boolean {
  return lapses >= LEECH_LAPSES && (lapses - LEECH_LAPSES) % LEECH_REPEAT === 0;
}

export interface DeckWord extends InflectionSource {
  id: number;
}

/**
 * The deck word a wrong answer actually is, if any: "stehen" typed for
 * stellen. An answer that is a form of the target itself is a wrong
 * ending, not a confusion. Exact matches win over stem matches.
 */
export function confusedWith(
  given: string,
  target: InflectionSource,
  deck: readonly DeckWord[],
): number | null {
  const answer = key(given);
  if (!answer || answer.split(' ').length > 3 || isFormOf(given, target)) return null;
  const targetKey = key(target.lemma);
  const others = deck.filter((w) => key(w.lemma) !== targetKey);
  const exact = others.find((w) => key(w.lemma) === answer || key(coreWord(w)) === answer);
  if (exact) return exact.id;
  return others.find((w) => isFormOf(given, w))?.id ?? null;
}

export interface ConfusedPair {
  itemIds: [number, number];
  count: number;
  lastAt: number;
}

/** Pairs mixed up at least CONFUSION_MIN times, in either direction, most frequent first. */
export function confusedPairs(
  mistakes: readonly { itemId: number | null; confusedItemId: number | null; createdAt: number }[],
  min = CONFUSION_MIN,
): ConfusedPair[] {
  const pairs = new Map<string, ConfusedPair>();
  for (const m of mistakes) {
    if (m.itemId == null || m.confusedItemId == null || m.itemId === m.confusedItemId) continue;
    const ids: [number, number] = [
      Math.min(m.itemId, m.confusedItemId),
      Math.max(m.itemId, m.confusedItemId),
    ];
    const id = ids.join('-');
    const pair = pairs.get(id) ?? { itemIds: ids, count: 0, lastAt: 0 };
    pair.count += 1;
    pair.lastAt = Math.max(pair.lastAt, m.createdAt);
    pairs.set(id, pair);
  }
  return [...pairs.values()]
    .filter((p) => p.count >= min)
    .sort((a, b) => b.count - a.count || b.lastAt - a.lastAt);
}

function key(text: string): string {
  return foldUmlauts(normalizeAnswer(text).toLowerCase()).replace(/^(der|die|das)\s+/, '');
}
