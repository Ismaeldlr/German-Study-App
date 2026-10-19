import { editDistance, foldUmlauts, normalizeAnswer } from './answers';

export interface LemmaRef {
  id: number;
  lemma: string;
}

/** Compare lemmas without article, case, umlaut spelling or extra spaces. */
export function lemmaKey(text: string): string {
  return foldUmlauts(
    normalizeAnswer(text)
      .replace(/^(der|die|das)\s+/i, '')
      .toLowerCase(),
  );
}

/** How many typos still count as "did you mean". Short words get none. */
function allowedDistance(length: number): number {
  if (length <= 3) return 0;
  if (length <= 7) return 1;
  return 2;
}

/**
 * Exact duplicates and near-misses for a word you are about to add, so
 * "Wohnug" asks whether you meant "Wohnung".
 */
export function findDuplicates<T extends LemmaRef>(
  candidate: string,
  existing: readonly T[],
): { exact: T[]; near: T[] } {
  const key = lemmaKey(candidate);
  const exact: T[] = [];
  const near: { ref: T; distance: number }[] = [];
  if (!key) return { exact, near: [] };

  for (const ref of existing) {
    const other = lemmaKey(ref.lemma);
    if (other === key) {
      exact.push(ref);
      continue;
    }
    const limit = allowedDistance(Math.min(key.length, other.length));
    if (limit === 0 || Math.abs(other.length - key.length) > limit) continue;
    const distance = editDistance(key, other);
    if (distance <= limit) near.push({ ref, distance });
  }
  near.sort((a, b) => a.distance - b.distance);
  return { exact, near: near.map((n) => n.ref) };
}
