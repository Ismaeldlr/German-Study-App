import { cleanExamples, formatExamples, parseExamples, validateGrammar } from './grammar';

describe('grammar points', () => {
  it('reads examples one per line, German = English', () => {
    const text = 'Ich fahre mit dem Bus. = I go by bus.\n\n  Wir wohnen bei meinen Eltern.  ';
    expect(parseExamples(text)).toEqual([
      { de: 'Ich fahre mit dem Bus.', en: 'I go by bus.' },
      { de: 'Wir wohnen bei meinen Eltern.', en: '' },
    ]);
    expect(formatExamples(parseExamples(text))).toBe(
      'Ich fahre mit dem Bus. = I go by bus.\nWir wohnen bei meinen Eltern.',
    );
  });

  it('keeps at most five examples with German text', () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ de: `Satz ${i}.`, en: '' }));
    expect(cleanExamples([{ de: ' ', en: 'nothing' }, ...many])).toHaveLength(5);
  });

  it('needs a name, a summary and an example to save', () => {
    expect(
      validateGrammar({ name: '', label: '', summary: '', examples: [], categories: [] }),
    ).toHaveLength(3);
    expect(
      validateGrammar({
        name: 'Dativ nach mit',
        label: '',
        summary: 'mit takes the dative.',
        examples: [{ de: 'Ich fahre mit dem Bus.', en: '' }],
        categories: [],
      }),
    ).toEqual([]);
  });
});
