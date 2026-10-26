import {
  chatWordOutcome,
  contextWindow,
  messageMistakes,
  userTurns,
  wordVerdicts,
  type ChatMessage,
} from './chat';

const say = (role: ChatMessage['role'], content: string, extra: Partial<ChatMessage> = {}) => ({
  role,
  content,
  at: 0,
  ...extra,
});

describe('chat', () => {
  it('keeps only the latest exchanges in the context window', () => {
    const messages = Array.from({ length: 20 }, (_, i) =>
      say(i % 2 ? 'user' : 'assistant', `m${i}`),
    );
    expect(userTurns(messages)).toBe(10);
    const window = contextWindow(messages, 3);
    expect(window.map((m) => m.content)).toEqual(['m14', 'm15', 'm16', 'm17', 'm18', 'm19']);
  });

  it('collects a word’s verdicts from your messages, with or without its article', () => {
    const messages = [
      say('user', 'Die Miete ist hoch.', { used: [{ word: 'die Miete', verdict: 'correct' }] }),
      say('assistant', 'Wie hoch ist die Miete?', { used: [{ word: 'Miete', verdict: 'wrong' }] }),
      say('user', 'Die miete ist 800 Euro.', { used: [{ word: 'Miete', verdict: 'slip' }] }),
    ];
    expect(wordVerdicts({ word: 'die Miete' }, messages)).toEqual(['correct', 'slip']);
  });

  it.each([
    [[], null],
    [['missing'], null],
    [['correct', 'correct'], 'correct'],
    [['correct', 'wrong'], 'slip'],
    [['slip'], 'slip'],
    [['wrong', 'wrong'], 'wrong'],
  ] as const)('turns %j into one outcome: %s', (verdicts, outcome) => {
    expect(chatWordOutcome(verdicts)).toBe(outcome);
  });

  it('turns a message’s corrections into mistakes for the weak spots', () => {
    const message = say('user', 'Ich habe gegangen.', {
      correction: {
        verdict: 'wrong',
        corrected: 'Ich bin gegangen.',
        errors: [
          {
            category: 'verb_form',
            text: 'habe gegangen',
            correction: 'bin gegangen',
            explanation: 'gehen takes sein.',
          },
        ],
      },
    });
    expect(messageMistakes(message)).toEqual([
      {
        category: 'verb_form',
        yourText: 'habe gegangen',
        correction: 'bin gegangen',
        explanation: 'gehen takes sein.',
      },
    ]);
  });
});
