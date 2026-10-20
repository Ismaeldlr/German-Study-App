import type { ItemForms } from './cards';
import { confusedPairs, confusedWith, isLeechLapse, type DeckWord } from './leeches';

const verb = (id: number, lemma: string, present3: string, preterite: string, participle: string) =>
  ({
    id,
    kind: 'verb',
    lemma,
    article: null,
    plural: null,
    verbPresent3: present3,
    verbPreterite: preterite,
    verbParticiple: participle,
    verbAuxiliary: 'haben',
  }) satisfies DeckWord;

const stellen = verb(1, 'stellen', 'stellt', 'stellte', 'gestellt');
const stehen = verb(2, 'stehen', 'steht', 'stand', 'gestanden');
const legen = verb(3, 'legen', 'legt', 'legte', 'gelegt');
const liegen = verb(4, 'liegen', 'liegt', 'lag', 'gelegen');
const kueche: DeckWord & ItemForms = {
  id: 5,
  kind: 'noun',
  lemma: 'Küche',
  article: 'die',
  plural: 'Küchen',
  verbPresent3: null,
  verbPreterite: null,
  verbParticiple: null,
  verbAuxiliary: null,
};
const deck = [stellen, stehen, legen, liegen, kueche];

describe('leeches', () => {
  it('flags a card at its sixth lapse, then every third lapse after that', () => {
    expect([4, 5, 6, 7, 8, 9, 10, 12].filter(isLeechLapse)).toEqual([6, 9, 12]);
  });
});

describe('confused words', () => {
  it('knows when a wrong answer is another deck word', () => {
    expect(confusedWith('stehen', stellen, deck)).toBe(2);
    expect(confusedWith('steht', stellen, deck)).toBe(2);
    expect(confusedWith('lag', legen, deck)).toBe(4);
    expect(confusedWith('die Küche', stellen, deck)).toBe(5);
  });

  it('does not call a wrong ending of the word itself a confusion', () => {
    expect(confusedWith('stellt', stellen, deck)).toBeNull();
    expect(confusedWith('Kuechen', kueche, deck)).toBeNull();
  });

  it('ignores answers that are no deck word, and whole sentences', () => {
    expect(confusedWith('laufen', stellen, deck)).toBeNull();
    expect(confusedWith('', stellen, deck)).toBeNull();
    expect(confusedWith('ich habe es auf den Tisch gestellt', legen, deck)).toBeNull();
  });

  it('pairs words mixed up twice or more, in either direction', () => {
    const t = 1000;
    const pairs = confusedPairs([
      { itemId: 1, confusedItemId: 2, createdAt: t },
      { itemId: 2, confusedItemId: 1, createdAt: t + 5 },
      { itemId: 3, confusedItemId: 4, createdAt: t },
      { itemId: 5, confusedItemId: null, createdAt: t },
      { itemId: 5, confusedItemId: 5, createdAt: t },
    ]);
    expect(pairs).toEqual([{ itemIds: [1, 2], count: 2, lastAt: t + 5 }]);
  });
});
