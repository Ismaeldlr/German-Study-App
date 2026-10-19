import type { Article, Auxiliary, CardType, ItemKind } from './model';

/** FSRS card states, as numbered by ts-fsrs. */
export const CardState = { New: 0, Learning: 1, Review: 2, Relearning: 3 } as const;

/** A review card counts as mature once its stability reaches three weeks. */
export const MATURE_STABILITY_DAYS = 21;

export interface ItemForms {
  kind: ItemKind;
  lemma: string;
  article: Article | null;
  plural: string | null;
  verbPresent3: string | null;
  verbPreterite: string | null;
  verbParticiple: string | null;
  verbAuxiliary: Auxiliary | null;
}

/**
 * The cards an item gets. Forgetting "die" is a different memory from
 * forgetting what Wohnung means, so a noun gets separate meaning, gender and
 * plural cards. Plural-only nouns (Eltern) have no article and get neither.
 */
export function cardTypesFor(item: ItemForms): CardType[] {
  switch (item.kind) {
    case 'grammar':
      return ['apply_grammar'];
    case 'noun': {
      const types: CardType[] = ['recognize', 'produce'];
      if (item.article) types.push('gender');
      if (item.article && item.plural) types.push('plural');
      return types;
    }
    case 'verb': {
      const types: CardType[] = ['recognize', 'produce'];
      if (hasVerbForms(item)) types.push('verb_forms');
      return types;
    }
    default:
      return ['recognize', 'produce'];
  }
}

export function hasVerbForms(item: ItemForms): boolean {
  return Boolean(
    item.verbPresent3 && item.verbPreterite && item.verbParticiple && item.verbAuxiliary,
  );
}

export type ItemState = 'new' | 'learning' | 'young' | 'mature' | 'suspended';

export interface CardProgress {
  state: number;
  stability: number;
  suspended: boolean;
}

/** One state per item, from its active cards. */
export function itemState(cards: CardProgress[]): ItemState {
  const active = cards.filter((c) => !c.suspended);
  if (active.length === 0) return 'suspended';
  if (active.every((c) => c.state === CardState.New)) return 'new';
  if (active.some((c) => c.state === CardState.Learning || c.state === CardState.Relearning)) {
    return 'learning';
  }
  if (active.every((c) => c.state === CardState.Review && c.stability >= MATURE_STABILITY_DAYS)) {
    return 'mature';
  }
  return 'young';
}

/** How an item is written on a card: "die Wohnung", "umziehen". */
export function displayLemma(item: { kind: ItemKind; lemma: string; article: Article | null }) {
  return item.kind === 'noun' && item.article ? `${item.article} ${item.lemma}` : item.lemma;
}
