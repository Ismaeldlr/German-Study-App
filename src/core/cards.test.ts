import { CardState, cardTypesFor, displayLemma, itemState, type ItemForms } from './cards';

const base: ItemForms = {
  kind: 'noun',
  lemma: 'Wohnung',
  article: 'die',
  plural: 'Wohnungen',
  verbPresent3: null,
  verbPreterite: null,
  verbParticiple: null,
  verbAuxiliary: null,
};

describe('card types per item', () => {
  it('gives a noun meaning, gender and plural cards', () => {
    expect(cardTypesFor(base)).toEqual(['recognize', 'produce', 'gender', 'plural']);
  });

  it('skips the plural card for a noun without plural', () => {
    expect(cardTypesFor({ ...base, lemma: 'Obst', article: 'das', plural: null })).toEqual([
      'recognize',
      'produce',
      'gender',
    ]);
  });

  it('gives a plural-only noun neither gender nor plural card', () => {
    expect(cardTypesFor({ ...base, lemma: 'Eltern', article: null, plural: 'Eltern' })).toEqual([
      'recognize',
      'produce',
    ]);
  });

  it('gives a verb a verb forms card once all forms are known', () => {
    const verb: ItemForms = {
      ...base,
      kind: 'verb',
      lemma: 'umziehen',
      article: null,
      plural: null,
    };
    expect(cardTypesFor(verb)).toEqual(['recognize', 'produce']);
    expect(
      cardTypesFor({
        ...verb,
        verbPresent3: 'zieht um',
        verbPreterite: 'zog um',
        verbParticiple: 'umgezogen',
        verbAuxiliary: 'sein',
      }),
    ).toEqual(['recognize', 'produce', 'verb_forms']);
  });

  it('gives other words meaning cards and grammar an apply card', () => {
    expect(cardTypesFor({ ...base, kind: 'adjective', article: null, plural: null })).toEqual([
      'recognize',
      'produce',
    ]);
    expect(cardTypesFor({ ...base, kind: 'grammar' })).toEqual(['apply_grammar']);
  });
});

describe('item state', () => {
  const card = (state: number, stability = 0, suspended = false) => ({
    state,
    stability,
    suspended,
  });

  it('derives new, learning, young and mature', () => {
    expect(itemState([card(CardState.New), card(CardState.New)])).toBe('new');
    expect(itemState([card(CardState.Learning), card(CardState.New)])).toBe('learning');
    expect(itemState([card(CardState.Review, 3), card(CardState.New)])).toBe('young');
    expect(itemState([card(CardState.Review, 30), card(CardState.Relearning, 5)])).toBe('learning');
    expect(itemState([card(CardState.Review, 30), card(CardState.Review, 21)])).toBe('mature');
  });

  it('ignores suspended cards', () => {
    expect(itemState([card(CardState.Review, 30), card(CardState.New, 0, true)])).toBe('mature');
    expect(itemState([card(CardState.New, 0, true)])).toBe('suspended');
  });
});

describe('displayLemma', () => {
  it('puts the article in front of nouns only', () => {
    expect(displayLemma(base)).toBe('die Wohnung');
    expect(displayLemma({ kind: 'verb', lemma: 'gehen', article: null })).toBe('gehen');
  });
});
