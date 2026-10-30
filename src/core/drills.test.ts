import {
  drillProblem,
  gradeDrillItem,
  itemsByWord,
  setGrade,
  setOutcome,
  type DrillItem,
} from './drills';

const item = (overrides: Partial<DrillItem> = {}): DrillItem => ({
  sentence: 'Ich fahre mit ___ Bus.',
  hint: 'der Bus',
  answer: 'dem',
  accepted: [],
  translation: 'I go by bus.',
  explanation: 'mit takes the dative: der Bus becomes dem Bus.',
  category: 'case_ending',
  ...overrides,
});

describe('grammar drill items', () => {
  it('accepts the answer and its accepted forms', () => {
    expect(gradeDrillItem(item(), ' dem ').outcome).toBe('correct');
    expect(gradeDrillItem(item({ accepted: ['diesem'] }), 'diesem').outcome).toBe('correct');
  });

  it('logs a wrong answer under the item’s category, with its explanation', () => {
    const result = gradeDrillItem(item(), 'den');
    expect(result).toMatchObject({
      outcome: 'wrong',
      expected: 'dem',
      mistake: {
        category: 'case_ending',
        yourText: 'den',
        correction: 'dem',
        explanation: 'mit takes the dative: der Bus becomes dem Bus.',
      },
    });
  });

  it('treats a missing umlaut as a slip, and a revealed item as wrong without a mistake', () => {
    const slip = gradeDrillItem(item({ answer: 'schönen' }), 'schoenen');
    expect(slip).toMatchObject({ outcome: 'slip', mistake: { category: 'spelling' } });
    expect(gradeDrillItem(item(), '')).toMatchObject({ outcome: 'wrong', mistake: null });
  });

  it('counts a missing umlaut as wrong where the umlaut is the grammar', () => {
    const haette = item({ answer: 'hätte', category: 'verb_form', explanation: 'Wish: hätte.' });
    expect(gradeDrillItem({ ...haette, strictUmlauts: true }, 'hatte')).toMatchObject({
      outcome: 'wrong',
      mistake: { category: 'verb_form', correction: 'hätte', explanation: 'Wish: hätte.' },
    });
    // A capital letter is still only a slip.
    expect(
      gradeDrillItem({ ...item({ answer: 'Kinder' }), strictUmlauts: true }, 'kinder'),
    ).toMatchObject({ outcome: 'slip' });
  });

  it('rates a set: all right is right, slips or one miss is a slip, more is wrong', () => {
    const c = { outcome: 'correct' as const };
    const s = { outcome: 'slip' as const };
    const w = { outcome: 'wrong' as const };
    expect(setOutcome([c, c, c, c, c])).toBe('correct');
    expect(setOutcome([c, s, c, c, c])).toBe('slip');
    expect(setOutcome([c, w, c, c, c])).toBe('slip');
    expect(setOutcome([c, w, w, c, c])).toBe('wrong');
    expect(setOutcome([c, w])).toBe('wrong');
    expect(setOutcome([])).toBe('wrong');
  });

  it('sums a set up with its mistakes', () => {
    const results = [
      gradeDrillItem(item(), 'dem'),
      gradeDrillItem(item(), 'den'),
      gradeDrillItem(item(), 'dem'),
    ];
    expect(setGrade(results)).toMatchObject({
      outcome: 'slip',
      expected: '2 of 3 right',
      mistakes: [{ yourText: 'den' }],
    });
  });

  it('rejects generated sets that are too short or have a broken gap', () => {
    expect(drillProblem([item(), item()], 5)).toMatch(/at least 5/);
    expect(drillProblem([item({ sentence: 'Kein Platz.' })], 1)).toMatch(/exactly one/);
    expect(drillProblem([item({ answer: ' ' })], 1)).toMatch(/no answer/);
    expect(drillProblem([item()], 1)).toBeNull();
  });

  it('groups a contrast set’s items by word', () => {
    const set = {
      words: [{}, {}],
      items: [{ word: 0 }, { word: 1 }, { word: 0 }, { word: 1 }],
    } as never;
    expect(itemsByWord(set)).toEqual([
      [0, 2],
      [1, 3],
    ]);
  });
});
