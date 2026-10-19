import { eq } from 'drizzle-orm';

import { card } from '../schema';
import { createTestDb } from '../testing/test-db';
import { itemInput, verbInput } from '../testing/fixtures';
import { exportBackup, readBackup, restoreBackup } from './backup';
import { createChapter } from './chapters';
import { createItem } from './items';
import { getSetting, setSetting } from './settings';
import { recordReview } from './study';
import { recordUsage } from './usage';

const now = new Date(2026, 9, 19, 9);

async function filledDb() {
  const db = await createTestDb();
  const ch = createChapter(db, { number: 1, title: 'Wohnen', themes: ['Wohnung', 'Umzug'] });
  const id = createItem(db, itemInput({ chapterId: ch, tags: ['A2'] }), now.getTime());
  createItem(db, verbInput({ chapterId: ch }), now.getTime());
  const [first] = db.select().from(card).where(eq(card.itemId, id)).orderBy(card.id).all();
  recordReview(
    db,
    {
      cardId: first.id,
      rating: 1,
      mode: 'classic',
      responseMs: 1234,
      answer: 'Wohnug',
      correct: false,
      mistakes: [
        { category: 'spelling', yourText: 'Wohnug', correction: 'Wohnung', explanation: 'x' },
      ],
    },
    now.getTime(),
  );
  setSetting(db, 'llm.model', 'deepseek-chat');
  setSetting(db, 'study.currentChapterId', ch);
  recordUsage(
    db,
    { provider: 'deepseek', model: 'deepseek-chat', inputTokens: 10, outputTokens: 5, at: now },
    undefined,
  );
  return db;
}

describe('backup export and import', () => {
  it('round-trips the whole database without loss', async () => {
    const source = await filledDb();
    const file = exportBackup(source, now);
    // Through JSON, exactly as the file on disk.
    const { file: parsed, summary } = readBackup(JSON.parse(JSON.stringify(file)));
    expect(summary.counts).toMatchObject({
      item: 2,
      card: 7,
      review: 1,
      mistake: 1,
      chapter: 1,
      settings: 2,
    });

    const target = await createTestDb();
    createItem(target, itemInput({ lemma: 'Altlast' }), now.getTime());
    restoreBackup(target, parsed);
    const restored = exportBackup(target, now);
    restored.tables.settings = restored.tables.settings.filter(
      (row) => row.key !== 'data.lastExportAt',
    );
    expect(restored).toEqual(file);
  });

  it('counts the restored deck as exported when the backup was made', async () => {
    const source = await filledDb();
    setSetting(source, 'data.lastExportAt', now.getTime() - 7 * 86_400_000);
    const file = exportBackup(source, now);
    const target = await createTestDb();
    restoreBackup(target, readBackup(JSON.parse(JSON.stringify(file))).file);
    expect(getSetting(target, 'data.lastExportAt')).toBe(now.getTime());
  });

  it('never contains anything key-like', async () => {
    const text = JSON.stringify(exportBackup(await filledDb(), now));
    expect(text).not.toMatch(/api.?key|sk-/i);
  });

  it('rejects files that are not backups', () => {
    expect(() => readBackup({ hello: 'world' })).toThrow(/not a German Study backup/);
    expect(() =>
      readBackup({ format: 'german-study-backup', version: 99, exportedAt: '', tables: {} }),
    ).toThrow();
    expect(() =>
      readBackup({
        format: 'german-study-backup',
        version: 1,
        exportedAt: '',
        tables: { users: [] },
      }),
    ).toThrow(/Unknown tables/);
  });

  it('leaves the database untouched when a restore fails', async () => {
    const db = await filledDb();
    const before = exportBackup(db, now);
    const broken = JSON.parse(JSON.stringify(before));
    broken.tables.card.push({ ...broken.tables.card[0], id: 999, itemId: 12345 });
    expect(() => restoreBackup(db, readBackup(broken).file)).toThrow();
    expect(exportBackup(db, now)).toEqual(before);
  });
});
