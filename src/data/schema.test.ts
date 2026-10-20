import { eq, sql } from 'drizzle-orm';

import { card, item } from './schema';
import { createTestDb } from './testing/test-db';

const SPEC_TABLES = [
  'item',
  'grammar_note',
  'card',
  'review',
  'mistake',
  'exercise',
  'chapter',
  'suggestion',
  'session',
  'chat',
  'llm_usage',
  'settings',
  // Not a table in the spec's list, but the spec's pending-grading queue.
  'pending_grade',
];

describe('first migration', () => {
  it('creates every table in the spec', async () => {
    const db = await createTestDb();
    const rows = db.all<{ name: string }>(
      sql`select name from sqlite_master where type = 'table' and name not like 'sqlite_%' and name not like '__drizzle%'`,
    );
    expect(rows.map((r) => r.name).sort()).toEqual([...SPEC_TABLES].sort());
  });

  it('cascades card deletes from their item', async () => {
    const db = await createTestDb();
    const [{ id }] = db
      .insert(item)
      .values({ kind: 'noun', lemma: 'Wohnung', article: 'die', meanings: ['flat'] })
      .returning({ id: item.id })
      .all();
    db.insert(card).values({ itemId: id, type: 'recognize', due: 0 }).run();
    db.delete(item).where(eq(item.id, id)).run();
    expect(db.select().from(card).all()).toHaveLength(0);
  });

  it('round-trips JSON and boolean columns', async () => {
    const db = await createTestDb();
    db.insert(item)
      .values({
        kind: 'verb',
        lemma: 'umziehen',
        meanings: ['to move house'],
        separable: true,
        tags: ['Kapitel 1'],
      })
      .run();
    const row = db.select().from(item).get();
    expect(row?.meanings).toEqual(['to move house']);
    expect(row?.tags).toEqual(['Kapitel 1']);
    expect(row?.separable).toBe(true);
    expect(row?.reflexive).toBe(false);
    expect(row?.createdAt).toBeGreaterThan(0);
  });
});
