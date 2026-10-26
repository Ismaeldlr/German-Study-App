import { gradeStoryQuestion, storyOutcomes, storyParagraphs, type StoryExercise } from './story';

const story: StoryExercise = {
  title: 'Der Umzug',
  text: 'Lena sucht eine neue Wohnung. Die Miete ist hoch.\n\nIm Mai zieht sie endlich um, und ihre Nachbarin hilft.',
  glosses: [
    { de: 'endlich', en: 'finally' },
    { de: 'Nachbarin', en: 'neighbour' },
  ],
  targets: [
    {
      itemId: 1,
      recognizeCardId: 11,
      produceCardId: 12,
      word: 'die Wohnung',
      meaning: 'flat',
      kind: 'noun',
      forms: ['Wohnung'],
    },
    {
      itemId: 2,
      recognizeCardId: 21,
      produceCardId: 22,
      word: 'die Miete',
      meaning: 'rent',
      kind: 'noun',
      forms: ['Miete'],
    },
    {
      itemId: 3,
      recognizeCardId: 31,
      produceCardId: 32,
      word: 'umziehen',
      meaning: 'to move (house)',
      kind: 'verb',
      forms: ['zieht'],
    },
  ],
  questions: [
    {
      target: 0,
      sentence: 'Lena findet eine schöne ___.',
      answer: 'Wohnung',
      accepted: [],
      cue: 'flat',
      translation: 'Lena finds a nice flat.',
      glosses: [],
    },
    {
      target: 2,
      sentence: 'Im Mai ___ Lena um.',
      answer: 'zieht',
      accepted: [],
      cue: 'moves',
      translation: 'In May Lena moves.',
      glosses: [],
    },
  ],
};

describe('story text', () => {
  it('splits paragraphs and marks deck words and glossed words, punctuation and all', () => {
    const [first, second] = storyParagraphs(story);
    const words = first.filter((t) => t.text !== ' ');
    expect(words.map((t) => t.text)).toEqual([
      'Lena',
      'sucht',
      'eine',
      'neue',
      'Wohnung.',
      'Die',
      'Miete',
      'ist',
      'hoch.',
    ]);
    expect(words.find((t) => t.text === 'Wohnung.')).toEqual({ text: 'Wohnung.', target: 0 });
    expect(words.find((t) => t.text === 'Miete')).toEqual({ text: 'Miete', target: 1 });
    expect(second.find((t) => t.text === 'zieht')).toEqual({ text: 'zieht', target: 2 });
    expect(second.find((t) => t.text === 'endlich')).toEqual({ text: 'endlich', gloss: 'finally' });
    expect(second.find((t) => t.text === 'um,')).toEqual({ text: 'um,' });
    expect(second.find((t) => t.text === 'Nachbarin')).toEqual({
      text: 'Nachbarin',
      gloss: 'neighbour',
    });
    expect(second.find((t) => t.text === 'hilft.')).toEqual({ text: 'hilft.' });
  });
});

describe('story ratings', () => {
  const right = (q: number, given: string) => ({
    ...gradeStoryQuestion(story.questions[q], given, story.targets[story.questions[q].target].kind),
    answer: given,
  });

  it('counts a tapped word as a lapse and rates the asked words from their answers', () => {
    const outcomes = storyOutcomes(story, new Set([1]), [right(0, 'Wohnung'), right(1, 'zog')]);
    expect(outcomes).toEqual([
      { cardId: 12, itemId: 1, outcome: 'correct', mistakes: [], answer: 'Wohnung' },
      { cardId: 21, itemId: 2, outcome: 'revealed', mistakes: [], answer: null },
      expect.objectContaining({ cardId: 32, itemId: 3, outcome: 'wrong', answer: 'zog' }),
    ]);
  });

  it('gives untapped words no question no rating at all', () => {
    expect(storyOutcomes(story, new Set(), [])).toEqual([]);
  });

  it('grades a gap answer like a gap fill, slips included', () => {
    expect(gradeStoryQuestion(story.questions[0], 'wohnung', 'noun')).toMatchObject({
      outcome: 'slip',
      mistake: { category: 'capitalization' },
    });
  });
});
