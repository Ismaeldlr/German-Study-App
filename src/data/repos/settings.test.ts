import { subscribeToChanges } from '../changes';
import { settings } from '../schema';
import { createTestDb } from '../testing/test-db';
import { getAllSettings, getSetting, setSetting } from './settings';

describe('settings repository', () => {
  it('returns defaults when nothing is stored', async () => {
    const db = await createTestDb();
    expect(getSetting(db, 'llm.monthlyCap')).toBe(2);
    expect(getSetting(db, 'study.targetRecall')).toBe(0.9);
    expect(getAllSettings(db)['llm.provider']).toBe('openai');
  });

  it('stores and reads back typed values', async () => {
    const db = await createTestDb();
    setSetting(db, 'llm.provider', 'deepseek');
    setSetting(db, 'llm.prices', { 'deepseek-chat': { input: 0.27, output: 1.1 } });
    setSetting(db, 'llm.provider', 'openrouter');
    expect(getSetting(db, 'llm.provider')).toBe('openrouter');
    expect(getSetting(db, 'llm.prices')).toEqual({ 'deepseek-chat': { input: 0.27, output: 1.1 } });
  });

  it('rejects invalid values instead of storing them', async () => {
    const db = await createTestDb();
    expect(() => setSetting(db, 'study.targetRecall', 1.5)).toThrow();
    expect(() => setSetting(db, 'llm.monthlyCap', -1)).toThrow();
    expect(getSetting(db, 'study.targetRecall')).toBe(0.9);
  });

  it('falls back to the default when a stored value is corrupt', async () => {
    const db = await createTestDb();
    db.insert(settings).values({ key: 'llm.monthlyCap', value: '"lots"' }).run();
    db.insert(settings).values({ key: 'llm.provider', value: 'not json' }).run();
    expect(getSetting(db, 'llm.monthlyCap')).toBe(2);
    expect(getSetting(db, 'llm.provider')).toBe('openai');
  });

  it('ignores unknown keys', async () => {
    const db = await createTestDb();
    db.insert(settings).values({ key: 'old.setting', value: '1' }).run();
    expect(getAllSettings(db)).not.toHaveProperty('old.setting');
  });

  it('notifies listeners on write', async () => {
    const db = await createTestDb();
    const seen: string[][] = [];
    const unsubscribe = subscribeToChanges((tables) => seen.push([...tables]));
    setSetting(db, 'llm.model', 'gpt-test');
    unsubscribe();
    setSetting(db, 'llm.model', 'other');
    expect(seen).toEqual([['settings']]);
  });

  it('never has a place for the API key', async () => {
    const db = await createTestDb();
    expect(Object.keys(getAllSettings(db)).some((k) => /key/i.test(k))).toBe(false);
  });
});
