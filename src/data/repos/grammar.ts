import { and, eq } from 'drizzle-orm';

import { cleanExamples, type GrammarFields } from '@/core/grammar';
import type { MistakeCategory } from '@/core/model';

import { notifyChange } from '../changes';
import type { DbOrTx } from '../db';
import { card, grammarNote, item, type GrammarNoteRow, type ItemRow } from '../schema';
import { insertItemWithCards, updateItem, type ItemInput } from './items';

/**
 * Grammar points: items of kind grammar, each with a note holding the rule
 * summary, examples and the mistake categories it is about. Their one card
 * is practised with generated drills.
 */

export function createGrammarItem(
  db: DbOrTx,
  fields: GrammarFields,
  chapterId: number | null,
  now: number,
): number {
  const id = db.transaction((tx) => {
    const itemId = insertItemWithCards(tx, grammarItemInput(fields, chapterId), now);
    tx.insert(grammarNote).values(noteValues(itemId, fields)).run();
    return itemId;
  });
  notifyChange('item', 'card', 'grammar_note');
  return id;
}

export function updateGrammarItem(
  db: DbOrTx,
  itemId: number,
  fields: GrammarFields,
  chapterId: number | null,
  now: number,
): void {
  const existing = db.select().from(item).where(eq(item.id, itemId)).get();
  db.transaction((tx) => {
    updateItem(
      tx,
      itemId,
      {
        ...grammarItemInput(fields, chapterId),
        tags: existing?.tags ?? [],
        source: existing?.source ?? 'user',
        notes: existing?.notes ?? null,
      },
      now,
    );
    const values = noteValues(itemId, fields);
    tx.insert(grammarNote)
      .values(values)
      .onConflictDoUpdate({ target: grammarNote.itemId, set: values })
      .run();
  });
  notifyChange('item', 'card', 'grammar_note');
}

export function getGrammarNote(db: DbOrTx, itemId: number): GrammarNoteRow | undefined {
  return db.select().from(grammarNote).where(eq(grammarNote.itemId, itemId)).get();
}

export interface GrammarPoint {
  item: ItemRow;
  note: GrammarNoteRow | null;
}

export function getGrammarPoint(db: DbOrTx, itemId: number): GrammarPoint | null {
  const row = db.select().from(item).where(eq(item.id, itemId)).get();
  if (!row || row.kind !== 'grammar') return null;
  return { item: row, note: getGrammarNote(db, itemId) ?? null };
}

/** The fields to edit a grammar item with. */
export function grammarFieldsOf(point: GrammarPoint): GrammarFields {
  return {
    name: point.item.lemma,
    label: point.item.meanings[0] ?? '',
    summary: point.note?.ruleSummary ?? '',
    examples: point.note?.examples ?? [],
    categories: point.note?.categories ?? [],
  };
}

/** Active grammar items about a mistake category, with their card. */
export function grammarForCategory(db: DbOrTx, category: MistakeCategory) {
  return db
    .select({ item, note: grammarNote, card })
    .from(item)
    .innerJoin(grammarNote, eq(grammarNote.itemId, item.id))
    .innerJoin(card, eq(card.itemId, item.id))
    .where(
      and(
        eq(item.kind, 'grammar'),
        eq(item.status, 'active'),
        eq(card.type, 'apply_grammar'),
        eq(card.suspended, false),
      ),
    )
    .all()
    .filter((r) => r.note.categories.includes(category));
}

function grammarItemInput(fields: GrammarFields, chapterId: number | null): ItemInput {
  const examples = cleanExamples(fields.examples);
  const label = fields.label.trim() || firstSentence(fields.summary);
  return {
    kind: 'grammar',
    lemma: fields.name,
    article: null,
    plural: null,
    verbPresent3: null,
    verbPreterite: null,
    verbParticiple: null,
    verbAuxiliary: null,
    separable: false,
    reflexive: false,
    governedCase: null,
    meanings: label ? [label] : [],
    exampleDe: examples[0]?.de ?? null,
    exampleEn: examples[0]?.en || null,
    chapterId,
    tags: [],
    source: 'user',
    notes: null,
  };
}

function noteValues(itemId: number, fields: GrammarFields) {
  return {
    itemId,
    ruleSummary: fields.summary.replace(/\s+/g, ' ').trim(),
    examples: cleanExamples(fields.examples),
    categories: [...new Set(fields.categories)],
  };
}

function firstSentence(text: string): string {
  const trimmed = text.trim();
  const match = /^(.*?[.!?])(\s|$)/.exec(trimmed);
  return (match ? match[1] : trimmed).slice(0, 80);
}
