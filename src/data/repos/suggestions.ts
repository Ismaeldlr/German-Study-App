import { and, desc, eq } from 'drizzle-orm';

import type { DraftFields } from '@/core/drafts';
import { lemmaKey } from '@/core/duplicates';

import { notifyChange } from '../changes';
import type { DbOrTx } from '../db';
import { suggestion, type SuggestionDetails, type SuggestionRow } from '../schema';
import { allLemmas, createItem } from './items';

/**
 * LLM-suggested words waiting for your one-tap verdict. Every suggestion
 * stays in the table, so a rejected word never comes back.
 */

export interface NewSuggestion {
  reason: string;
  details: SuggestionDetails;
}

/** Store candidates that are neither in the deck nor suggested before. Returns how many. */
export function saveSuggestions(
  db: DbOrTx,
  candidates: readonly NewSuggestion[],
  chapterId: number | null,
  now: number,
): number {
  const taken = new Set([
    ...allLemmas(db).map((l) => lemmaKey(l.lemma)),
    ...db
      .select({ lemma: suggestion.lemma })
      .from(suggestion)
      .all()
      .map((s) => lemmaKey(s.lemma)),
  ]);
  const fresh: NewSuggestion[] = [];
  for (const candidate of candidates) {
    const key = lemmaKey(candidate.details.fields.lemma);
    if (!key || taken.has(key)) continue;
    taken.add(key);
    fresh.push(candidate);
  }
  if (fresh.length) {
    db.insert(suggestion)
      .values(
        fresh.map((c) => ({
          lemma: c.details.fields.lemma,
          reason: c.reason,
          chapterId,
          details: c.details,
          createdAt: now,
        })),
      )
      .run();
    notifyChange('suggestion');
  }
  return fresh.length;
}

export function pendingSuggestions(db: DbOrTx): SuggestionRow[] {
  return db
    .select()
    .from(suggestion)
    .where(eq(suggestion.status, 'pending'))
    .orderBy(desc(suggestion.createdAt), suggestion.id)
    .all();
}

/** Every lemma ever suggested, so the LLM can be told to avoid them. */
export function suggestedLemmas(db: DbOrTx): string[] {
  return db
    .select({ lemma: suggestion.lemma })
    .from(suggestion)
    .all()
    .map((s) => s.lemma);
}

/** Add the word to the deck, in the chapter it was suggested for. Returns the new item id. */
export function acceptSuggestion(
  db: DbOrTx,
  id: number,
  now: number,
  fields?: DraftFields,
): number | null {
  const row = db
    .select()
    .from(suggestion)
    .where(and(eq(suggestion.id, id), eq(suggestion.status, 'pending')))
    .get();
  if (!row?.details) return null;
  const itemId = db.transaction((tx) => {
    const created = createItem(
      tx,
      {
        ...(fields ?? row.details!.fields),
        chapterId: row.chapterId,
        tags: [],
        source: 'llm',
        notes: null,
      },
      now,
    );
    tx.update(suggestion).set({ status: 'accepted' }).where(eq(suggestion.id, id)).run();
    return created;
  });
  notifyChange('suggestion');
  return itemId;
}

export function rejectSuggestion(db: DbOrTx, id: number): void {
  db.update(suggestion).set({ status: 'rejected' }).where(eq(suggestion.id, id)).run();
  notifyChange('suggestion');
}
