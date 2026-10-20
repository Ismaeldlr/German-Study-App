import { toCategory } from './categories';

describe('mistake categories in LLM output', () => {
  it('takes the exact names and maps close ones', () => {
    expect(toCategory('case_ending')).toBe('case_ending');
    expect(toCategory('Adjective Ending')).toBe('adjective_ending');
    expect(toCategory('dative')).toBe('case_ending');
    expect(toCategory('verb conjugation')).toBe('verb_form');
    expect(toCategory('word-order')).toBe('word_order');
    expect(toCategory('gender')).toBe('article');
    expect(toCategory('umlaut')).toBe('spelling');
  });

  it('calls anything it cannot place a wrong word', () => {
    expect(toCategory('vocabulary')).toBe('wrong_word');
  });
});
