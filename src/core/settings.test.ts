import { decodeSetting, encodeSetting, SETTING_DEFAULTS, SETTING_KEYS } from './settings';
import { parseDecimal, formatUsd, plural } from './format';
import { localDay, localMonth, startOfLocalDay, endOfLocalDay } from './time';

describe('settings codec', () => {
  it('has a default for every key that passes its own schema', () => {
    for (const key of SETTING_KEYS) {
      expect(() => encodeSetting(key, SETTING_DEFAULTS[key])).not.toThrow();
    }
  });

  it('defaults to a 90% target recall and a $2 cap', () => {
    expect(SETTING_DEFAULTS['study.targetRecall']).toBe(0.9);
    expect(SETTING_DEFAULTS['llm.monthlyCap']).toBe(2);
    expect(SETTING_DEFAULTS['study.newItemsBase']).toBe(10);
    expect(SETTING_DEFAULTS['study.newItemsMax']).toBe(15);
  });

  it('decodes stored JSON and falls back on bad data', () => {
    expect(decodeSetting('llm.model', '"deepseek-chat"')).toBe('deepseek-chat');
    expect(decodeSetting('llm.model', undefined)).toBe('');
    expect(decodeSetting('llm.provider', '"gemini-free"')).toBe('openai');
    expect(decodeSetting('llm.monthlyCap', '{')).toBe(2);
  });
});

describe('parseDecimal', () => {
  it.each([
    ['0.15', 0.15],
    ['0,15', 0.15],
    [' 2 ', 2],
    ['.5', 0.5],
    ['3.', 3],
  ])('parses %j', (text, value) => {
    expect(parseDecimal(text)).toBe(value);
  });

  it.each(['', 'abc', '-1', '1.2.3', '1e5'])('rejects %j', (text) => {
    expect(parseDecimal(text)).toBeNull();
  });
});

describe('formatUsd', () => {
  it('shows sub-cent amounts with four decimals', () => {
    expect(formatUsd(0)).toBe('$0.00');
    expect(formatUsd(0.0018)).toBe('$0.0018');
    expect(formatUsd(1.234)).toBe('$1.23');
    expect(formatUsd(0.000012)).toBe('<$0.0001');
  });

  it('pluralizes counts', () => {
    expect(plural(1, 'call')).toBe('1 call');
    expect(plural(1200, 'call')).toBe('1,200 calls');
  });
});

describe('local dates', () => {
  it('formats local day and month', () => {
    const d = new Date(2026, 0, 5, 23, 59);
    expect(localDay(d)).toBe('2026-01-05');
    expect(localMonth(d)).toBe('2026-01');
  });

  it('finds the bounds of a local day', () => {
    const d = new Date(2026, 9, 19, 15, 30);
    expect(new Date(startOfLocalDay(d)).getHours()).toBe(0);
    expect(endOfLocalDay(d) - startOfLocalDay(d)).toBeGreaterThanOrEqual(23 * 3600_000);
  });
});
