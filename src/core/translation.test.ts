import {
  matchTarget,
  mistakesFor,
  targetOutcome,
  translationProblem,
  type TranslationGrade,
} from './translation';

const grade = (overrides: Partial<TranslationGrade> = {}): TranslationGrade => ({
  verdict: 'wrong',
  targets: [
    { cardId: 10, itemId: 1, word: 'die Wohnung', verdict: 'correct' },
    { cardId: 20, itemId: 2, word: 'umziehen', verdict: 'wrong' },
  ],
  errors: [
    {
      category: 'verb_form',
      text: 'umziehen',
      correction: 'ziehen … um',
      explanation: 'A separable verb splits.',
      word: 'umziehen',
    },
    {
      category: 'word_order',
      text: 'wir im Mai',
      correction: 'im Mai wir',
      explanation: 'The verb goes second.',
      word: null,
    },
  ],
  corrected: 'Im Mai ziehen wir in die Wohnung um.',
  natural: 'Im Mai ziehen wir in die neue Wohnung.',
  explanation: 'Mind the split verb.',
  ...overrides,
});

describe('translation grading', () => {
  it('rates a word you did not use like a wrong one', () => {
    expect(targetOutcome('correct')).toBe('correct');
    expect(targetOutcome('slip')).toBe('slip');
    expect(targetOutcome('wrong')).toBe('wrong');
    expect(targetOutcome('missing')).toBe('wrong');
  });

  it('logs each error once: against its word, or else against the first target', () => {
    expect(mistakesFor(grade(), 2).map((m) => m.category)).toEqual(['verb_form']);
    expect(mistakesFor(grade(), 1).map((m) => m.category)).toEqual(['word_order']);
  });

  it('matches target words regardless of article and case', () => {
    expect(matchTarget(grade().targets, 'Wohnung')?.itemId).toBe(1);
    expect(matchTarget(grade().targets, 'Umziehen')?.itemId).toBe(2);
    expect(matchTarget(grade().targets, 'Küche')).toBeUndefined();
  });

  it('rejects a generated reference that does not use every target', () => {
    const wohnung = {
      kind: 'noun' as const,
      lemma: 'Wohnung',
      article: 'die' as const,
      plural: 'Wohnungen',
      verbPresent3: null,
      verbPreterite: null,
      verbParticiple: null,
      verbAuxiliary: null,
    };
    const fine = { english: 'We like the flat.', reference: 'Wir mögen die Wohnung.' };
    expect(translationProblem(fine, [wohnung])).toBeNull();
    expect(
      translationProblem({ english: 'We like it.', reference: 'Wir mögen das Haus.' }, [wohnung]),
    ).toMatch(/does not use Wohnung/);
    expect(translationProblem({ english: ' ', reference: 'Wir mögen die Wohnung.' }, [])).toMatch(
      /empty/,
    );
  });
});
