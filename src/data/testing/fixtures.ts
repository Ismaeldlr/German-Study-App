import type { ItemInput } from '../repos/items';

export function itemInput(overrides: Partial<ItemInput> = {}): ItemInput {
  return {
    kind: 'noun',
    lemma: 'Wohnung',
    article: 'die',
    plural: 'Wohnungen',
    verbPresent3: null,
    verbPreterite: null,
    verbParticiple: null,
    verbAuxiliary: null,
    separable: false,
    reflexive: false,
    governedCase: null,
    meanings: ['flat', 'apartment'],
    exampleDe: 'Die Wohnung hat drei Zimmer.',
    exampleEn: 'The flat has three rooms.',
    chapterId: null,
    tags: [],
    source: 'user',
    notes: null,
    ...overrides,
  };
}

export const verbInput = (overrides: Partial<ItemInput> = {}) =>
  itemInput({
    kind: 'verb',
    lemma: 'umziehen',
    article: null,
    plural: null,
    verbPresent3: 'zieht um',
    verbPreterite: 'zog um',
    verbParticiple: 'umgezogen',
    verbAuxiliary: 'sein',
    separable: true,
    meanings: ['to move (house)'],
    exampleDe: 'Wir ziehen im Mai um.',
    exampleEn: 'We are moving in May.',
    ...overrides,
  });
