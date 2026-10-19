import { buildChoices, seededRandom, shuffle } from './choices';
import { findDuplicates, lemmaKey } from './duplicates';
import { batches, expandPlural, parseVocabularyList, umlautStem } from './parse-list';

describe('duplicates and near-misses', () => {
  const deck = [
    { id: 1, lemma: 'Wohnung' },
    { id: 2, lemma: 'Übung' },
    { id: 3, lemma: 'umziehen' },
    { id: 4, lemma: 'Ei' },
  ];

  it('finds exact duplicates regardless of article, case and umlaut spelling', () => {
    expect(findDuplicates('die Wohnung', deck).exact.map((d) => d.id)).toEqual([1]);
    expect(findDuplicates('uebung', deck).exact.map((d) => d.id)).toEqual([2]);
  });

  it('asks "did you mean" for a typo', () => {
    const result = findDuplicates('Wohnug', deck);
    expect(result.exact).toEqual([]);
    expect(result.near.map((d) => d.id)).toEqual([1]);
  });

  it('does not flag short or unrelated words', () => {
    expect(findDuplicates('Eis', deck).near).toEqual([]);
    expect(findDuplicates('Zeitung', deck).near).toEqual([]);
  });

  it('builds comparison keys', () => {
    expect(lemmaKey(' Die  Straße ')).toBe('strasse');
  });
});

describe('multiple choice', () => {
  const target = { id: 1, kind: 'noun' as const, meanings: ['flat', 'apartment'] };
  const pool = [
    target,
    { id: 2, kind: 'noun' as const, meanings: ['house'] },
    { id: 3, kind: 'verb' as const, meanings: ['to move house'] },
    { id: 4, kind: 'noun' as const, meanings: ['kitchen'] },
    { id: 5, kind: 'noun' as const, meanings: ['flat'] },
    { id: 6, kind: 'noun' as const, meanings: ['rent'] },
  ];

  it('offers the right meaning and three distractors, same word type first', () => {
    const result = buildChoices(target, pool, seededRandom(7));
    expect(result).not.toBeNull();
    const { options, correctIndex } = result!;
    expect(options).toHaveLength(4);
    expect(options[correctIndex]).toEqual({ itemId: 1, text: 'flat, apartment' });
    const ids = options.map((o) => o.itemId);
    expect(ids).not.toContain(5); // shares the meaning "flat"
    expect(ids).not.toContain(3); // enough nouns available
  });

  it('gives up when the deck is too small', () => {
    expect(buildChoices(target, pool.slice(0, 2))).toBeNull();
  });

  it('shuffles deterministically with a seed', () => {
    expect(shuffle([1, 2, 3, 4, 5], seededRandom(1))).toEqual(
      shuffle([1, 2, 3, 4, 5], seededRandom(1)),
    );
  });
});

describe('plural notation', () => {
  it.each([
    ['Wohnung', '-en', 'Wohnungen'],
    ['Lampe', '-n', 'Lampen'],
    ['Tisch', '-e', 'Tische'],
    ['Auto', '-s', 'Autos'],
    ['Zimmer', '-', 'Zimmer'],
    ['Haus', '¨-er', 'Häuser'],
    ['Bahnhof', '-¨e', 'Bahnhöfe'],
    ['Mutter', '¨', 'Mütter'],
    ['Raum', '¨e', 'Räume'],
    ['Lehrerin', '-nen', 'Lehrerinnen'],
    ['Apfel', '¨', 'Äpfel'],
    ['Museum', 'Museen', 'Museen'],
    ['Museum', 'die Museen', 'Museen'],
  ])('%s, %s -> %s', (lemma, notation, plural) => {
    expect(expandPlural(lemma, notation)).toBe(plural);
  });

  it('rejects notation it cannot read', () => {
    expect(expandPlural('Wohnung', 'en?')).toBeUndefined();
    expect(expandPlural('Wohnung', 'flat')).toBeUndefined();
  });

  it('umlauts the stem vowel', () => {
    expect(umlautStem('Haus')).toBe('Häus');
    expect(umlautStem('Bruder')).toBe('Brüder');
    expect(umlautStem('Tisch')).toBeUndefined();
  });
});

describe('pasted list parser', () => {
  const text = `
Kapitel 3
• die Wohnung, -en – flat, apartment
2. der Bahnhof, ¨-e
das Obst (nur Sg.)
die Eltern (Pl.)
umziehen, zog um, ist umgezogen
sich freuen auf = to look forward to
---
die Miete, ???
`;

  it('reads notation, translations and flags unclear lines', () => {
    const lines = parseVocabularyList(text);
    expect(lines.map((l) => l.german)).toEqual([
      'Kapitel 3',
      'die Wohnung, -en',
      'der Bahnhof, ¨-e',
      'das Obst (nur Sg.)',
      'die Eltern (Pl.)',
      'umziehen, zog um, ist umgezogen',
      'sich freuen auf',
      'die Miete, ???',
    ]);
    expect(lines[0]).toMatchObject({ unclear: true, reason: 'Looks like a heading' });
    expect(lines[1].hints).toEqual({
      article: 'die',
      lemma: 'Wohnung',
      plural: 'Wohnungen',
      translation: 'flat, apartment',
    });
    expect(lines[2].hints).toMatchObject({ article: 'der', lemma: 'Bahnhof', plural: 'Bahnhöfe' });
    expect(lines[3].hints).toMatchObject({ article: 'das', lemma: 'Obst', plural: null });
    expect(lines[4].hints).toMatchObject({ lemma: 'Eltern', pluralOnly: true, plural: 'Eltern' });
    expect(lines[5].hints.perfect).toEqual({ auxiliary: 'sein', participle: 'umgezogen' });
    expect(lines[6].hints.translation).toBe('to look forward to');
    expect(lines[7]).toMatchObject({ unclear: true });
    expect(lines.map((l) => l.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('splits work into batches of about 25', () => {
    const sizes = batches(Array.from({ length: 60 }, (_, i) => i)).map((b) => b.length);
    expect(sizes).toEqual([25, 25, 10]);
  });
});
