import { chatTurn } from './chat-turn';
import { genStory, type GenStoryOutput } from './gen-story';

const words = (n: number) => Array.from({ length: n }, () => 'Wort').join(' ');
const input = {
  topic: 'Umzug',
  known: [],
  targets: [1, 2, 3, 4].map((id) => ({ id, word: `w${id}`, type: 'noun', meaning: 'm' })),
};
const question = (target: number, sentence = 'Lena sucht eine ___.') => ({
  target,
  sentence,
  answer: 'Wohnung',
  accepted: [],
  cue: '',
  translation: '',
});
const story = (overrides: Partial<GenStoryOutput>): GenStoryOutput => ({
  title: 'T',
  text: words(150),
  targets: [],
  glosses: [],
  questions: [question(1), question(2), question(3)],
  ...overrides,
});

describe('gen_story check', () => {
  it('accepts a story of about the asked length with three good questions', () => {
    expect(genStory.check!(story({}), input)).toBeNull();
  });

  it('asks again for a story far too short or too long', () => {
    expect(genStory.check!(story({ text: words(40) }), input)).toMatch(/40 words/);
    expect(genStory.check!(story({ text: words(400) }), input)).toMatch(/400 words/);
  });

  it('asks again when questions are missing, gapless or about unknown targets', () => {
    expect(genStory.check!(story({ questions: [question(1)] }), input)).toMatch(/at least 3/);
    expect(
      genStory.check!(
        story({ questions: [question(1), question(2), question(3, 'Kein Loch.')] }),
        input,
      ),
    ).toMatch(/exactly one ___/);
    expect(
      genStory.check!(story({ questions: [question(1), question(2), question(9)] }), input),
    ).toMatch(/unknown target ids 9/);
  });
});

describe('chat_turn schema', () => {
  it('fills in missing errors and used words, and maps loose category names', () => {
    const parsed = chatTurn.schema.parse({
      correction: {
        verdict: 'wrong',
        corrected: 'Ich bin gegangen.',
        errors: [
          { category: 'Perfekt auxiliary', text: 'habe', correction: 'bin', explanation: '' },
        ],
      },
      reply: 'Wohin?',
      translation: 'Where to?',
      summary: '',
    });
    expect(parsed.used).toEqual([]);
    expect(parsed.correction.errors[0].category).toBe('verb_form');
  });
});
