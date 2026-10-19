import nounList from '@/data/nouns/noun-list.json';

import { checkNoun, decodeEntries, encodeEntries, resolveNoun, type NounTable } from './nouns';

const table = nounList as NounTable;

describe('noun list codec', () => {
  it('round-trips entries, storing plurals relative to the lemma', () => {
    const entries = [
      { g: 'n', plurals: ['Bänder', 'Bande'] },
      { g: 'm', plurals: ['Bände'] },
      { g: 'f', plurals: ['Bands'] },
    ];
    const encoded = encodeEntries('Band', entries);
    expect(encoded).toBe('n:Bänder,+e|m:Bände|f:+s');
    expect(decodeEntries('Band', encoded)).toEqual(entries);
    expect(decodeEntries('Obst', 'n:')).toEqual([{ g: 'n', plurals: [] }]);
  });

  it('derives compounds from their head', () => {
    const small: NounTable = { Suche: 'f:+n', Mail: 'f:+s' };
    expect(resolveNoun(small, 'Wohnungssuche')).toEqual({
      source: 'compound',
      head: 'Suche',
      entries: [{ g: 'f', plurals: ['Wohnungssuchen'] }],
    });
    expect(resolveNoun(small, 'E-Mail')?.entries[0].plurals).toEqual(['E-Mails']);
    expect(resolveNoun(small, 'Haus')).toBeNull();
  });
});

describe('bundled Wiktionary noun list', () => {
  it.each([
    ['Wohnung', 'f', ['Wohnungen']],
    ['Haus', 'n', ['Häuser']],
    ['Mitbewohner', 'm', ['Mitbewohner']],
    ['Bahnhof', 'm', ['Bahnhöfe']],
    ['Wohnungssuche', 'f', ['Wohnungssuchen']],
    ['E-Mail', 'f', ['E-Mails']],
    ['Eltern', 'p', ['Eltern']],
    ['Großeltern', 'p', ['Großeltern']],
  ])('knows %s', (lemma, gender, plurals) => {
    const found = resolveNoun(table, lemma);
    expect(found).not.toBeNull();
    const entry = found!.entries.find((e) => e.g.includes(gender));
    expect(entry?.plurals).toEqual(expect.arrayContaining(plurals));
  });

  it('keeps both genders where Wiktionary has them', () => {
    expect(resolveNoun(table, 'Kaffee')?.entries.some((e) => e.g === 'mn')).toBe(true);
    const band = resolveNoun(table, 'Band')!
      .entries.map((e) => e.g)
      .join('');
    expect(band).toEqual(expect.stringContaining('m'));
    expect(band).toEqual(expect.stringContaining('n'));
  });

  it('flags a wrong gender or plural from an LLM', () => {
    const wrongGender = checkNoun(resolveNoun(table, 'Wohnung'), {
      article: 'der',
      plural: 'Wohnungen',
    });
    expect(wrongGender.issues.map((i) => i.field)).toEqual(['article']);
    expect(wrongGender.suggestion).toEqual({ article: 'die', plural: 'Wohnungen' });

    const wrongPlural = checkNoun(resolveNoun(table, 'Bahnhof'), {
      article: 'der',
      plural: 'Bahnhofe',
    });
    expect(wrongPlural.issues).toEqual([
      { field: 'plural', message: 'Wiktionary gives the plural as Bahnhöfe.' },
    ]);
  });

  it('accepts either meaning of a homonym', () => {
    const lookup = resolveNoun(table, 'Bank');
    expect(checkNoun(lookup, { article: 'die', plural: 'Banken' }).issues).toEqual([]);
    expect(checkNoun(lookup, { article: 'die', plural: 'Bänke' }).issues).toEqual([]);
  });

  it('handles nouns without plural and plural-only nouns', () => {
    expect(checkNoun(resolveNoun(table, 'Obst'), { article: 'das', plural: null }).issues).toEqual(
      [],
    );
    expect(
      checkNoun(resolveNoun(table, 'Obst'), { article: 'das', plural: 'Obste' }).issues[0].field,
    ).toBe('plural');
    expect(
      checkNoun(resolveNoun(table, 'Eltern'), { article: null, plural: 'Eltern' }).issues,
    ).toEqual([]);
  });

  it('says nothing about words it does not know', () => {
    expect(checkNoun(resolveNoun(table, 'Xyzq'), { article: 'der', plural: null })).toEqual({
      known: false,
      issues: [],
    });
  });
});
