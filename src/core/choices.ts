import type { ItemKind } from './model';

export interface ChoiceSource {
  id: number;
  kind: ItemKind;
  meanings: string[];
}

export interface Choice {
  itemId: number;
  text: string;
}

export function meaningText(meanings: readonly string[]): string {
  return meanings.slice(0, 2).join(', ');
}

/**
 * Options for a recognition card: the item's meaning plus distractors from
 * the deck, same word type first. Returns null when the deck is too small
 * to offer a real choice.
 */
export function buildChoices(
  target: ChoiceSource,
  pool: readonly ChoiceSource[],
  random: () => number = Math.random,
  count = 4,
): { options: Choice[]; correctIndex: number } | null {
  const correct: Choice = { itemId: target.id, text: meaningText(target.meanings) };
  const targetMeanings = new Set(target.meanings.map((m) => m.toLowerCase().trim()));
  const seen = new Set([correct.text.toLowerCase()]);

  const candidates = shuffle(
    pool.filter(
      (p) =>
        p.id !== target.id &&
        p.meanings.length > 0 &&
        !p.meanings.some((m) => targetMeanings.has(m.toLowerCase().trim())),
    ),
    random,
  ).sort((a, b) => Number(b.kind === target.kind) - Number(a.kind === target.kind));

  const distractors: Choice[] = [];
  for (const candidate of candidates) {
    const text = meaningText(candidate.meanings);
    if (seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    distractors.push({ itemId: candidate.id, text });
    if (distractors.length === count - 1) break;
  }
  if (distractors.length < 2) return null;

  const options = shuffle([correct, ...distractors], random);
  return { options, correctIndex: options.indexOf(correct) };
}

export function shuffle<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** A small deterministic generator for tests and reproducible shuffles. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}
