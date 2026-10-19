import { checkGerman, editDistance, foldUmlauts, normalizeAnswer, stripUmlauts } from './answers';

describe('normalizeAnswer', () => {
  it('ignores extra spaces, surrounding quotes and final punctuation', () => {
    expect(normalizeAnswer('  zieht   um ')).toBe('zieht um');
    expect(normalizeAnswer('„Wohnung“.')).toBe('Wohnung');
    expect(normalizeAnswer('Wie geht’s?')).toBe("Wie geht's");
  });
});

describe('umlaut helpers', () => {
  it('folds and strips umlauts', () => {
    expect(foldUmlauts('Übungsräume heißen')).toBe('Uebungsraeume heissen');
    expect(stripUmlauts('Übung Straße')).toBe('Ubung Strasse');
  });
});

describe('checkGerman', () => {
  it('accepts the exact answer', () => {
    expect(checkGerman('Wohnung', ['Wohnung']).verdict).toBe('correct');
  });

  it('ignores extra spaces', () => {
    expect(checkGerman('  zieht  um ', ['zieht um']).verdict).toBe('correct');
  });

  it.each([
    ['Uebung', 'Übung'],
    ['Strasse', 'Straße'],
    ['Ubung', 'Übung'],
    ['Haeuser', 'Häuser'],
  ])('treats %s for %s as an umlaut slip', (given, expected) => {
    expect(checkGerman(given, [expected])).toMatchObject({ verdict: 'slip', slips: ['umlaut'] });
  });

  it('treats a lowercase noun as a capitalization slip', () => {
    expect(checkGerman('wohnung', ['Wohnung'])).toMatchObject({
      verdict: 'slip',
      slips: ['capitalization'],
    });
  });

  it('reports both slips together', () => {
    expect(checkGerman('uebung', ['Übung']).slips.sort()).toEqual(['capitalization', 'umlaut']);
  });

  it('does not punish a capital first letter on a lowercase word', () => {
    expect(checkGerman('Schnell', ['schnell']).verdict).toBe('correct');
  });

  it('marks typos wrong and points at the closest accepted form', () => {
    expect(checkGerman('Wohnug', ['Wohnung'])).toMatchObject({
      verdict: 'wrong',
      expected: 'Wohnung',
    });
    expect(checkGerman('Hose', ['Haus', 'Hause'])).toMatchObject({
      verdict: 'wrong',
      expected: 'Hause',
    });
  });

  it('marks an empty answer wrong', () => {
    expect(checkGerman('   ', ['Haus']).verdict).toBe('wrong');
  });

  it('accepts any listed form', () => {
    expect(checkGerman('Banken', ['Bänke', 'Banken']).verdict).toBe('correct');
  });
});

describe('editDistance', () => {
  it('counts insertions, deletions, substitutions and swaps', () => {
    expect(editDistance('wohnug', 'wohnung')).toBe(1);
    expect(editDistance('stehen', 'stellen')).toBe(2);
    expect(editDistance('ab', 'ba')).toBe(1);
    expect(editDistance('', 'abc')).toBe(3);
  });
});
