import { and, desc, eq, inArray } from 'drizzle-orm';

import { foldUmlauts } from '@/core/answers';
import { cardTypesFor, itemState, type ItemState } from '@/core/cards';
import type {
  Article,
  Auxiliary,
  GrammaticalCase,
  ItemKind,
  ItemSource,
  ItemStatus,
} from '@/core/model';
import { newCardSchedule } from '@/core/scheduler';

import { notifyChange } from '../changes';
import type { DbOrTx } from '../db';
import {
  card,
  chapter,
  item,
  mistake,
  review,
  type CardRow,
  type ChapterRow,
  type ItemRow,
  type MistakeRow,
  type ReviewRow,
} from '../schema';

export interface ItemInput {
  kind: ItemKind;
  lemma: string;
  article: Article | null;
  plural: string | null;
  verbPresent3: string | null;
  verbPreterite: string | null;
  verbParticiple: string | null;
  verbAuxiliary: Auxiliary | null;
  separable: boolean;
  reflexive: boolean;
  governedCase: GrammaticalCase | null;
  meanings: string[];
  exampleDe: string | null;
  exampleEn: string | null;
  chapterId: number | null;
  tags: string[];
  source: ItemSource;
  notes: string | null;
}

/** Add an item and its cards in one transaction. */
export function createItem(db: DbOrTx, input: ItemInput, now: number): number {
  const id = insertItemWithCards(db, input, now);
  notifyChange('item', 'card');
  return id;
}

/** Import a batch: all items land together or none do. */
export function createItems(db: DbOrTx, inputs: readonly ItemInput[], now: number): number[] {
  const ids = db.transaction((tx) => inputs.map((input) => insertItemWithCards(tx, input, now)));
  notifyChange('item', 'card');
  return ids;
}

function insertItemWithCards(db: DbOrTx, input: ItemInput, now: number): number {
  const clean = cleanInput(input);
  const [row] = db
    .insert(item)
    .values({ ...clean, createdAt: now, updatedAt: now })
    .returning({ id: item.id })
    .all();
  const schedule = newCardSchedule(now);
  const types = cardTypesFor(clean);
  if (types.length) {
    db.insert(card)
      .values(types.map((type) => ({ itemId: row.id, type, ...schedule, createdAt: now })))
      .run();
  }
  return row.id;
}

/**
 * Save edits and keep the cards in step: new forms add cards, and a card
 * that no longer applies is deleted if never reviewed, else suspended so
 * its history survives.
 */
export function updateItem(db: DbOrTx, id: number, input: ItemInput, now: number): void {
  const clean = cleanInput(input);
  db.transaction((tx) => {
    tx.update(item)
      .set({ ...clean, updatedAt: now })
      .where(eq(item.id, id))
      .run();
    const wanted = new Set(cardTypesFor(clean));
    const existing = tx.select().from(card).where(eq(card.itemId, id)).all();
    const have = new Set(existing.map((c) => c.type));
    const schedule = newCardSchedule(now);
    const missing = [...wanted].filter((type) => !have.has(type));
    if (missing.length) {
      tx.insert(card)
        .values(missing.map((type) => ({ itemId: id, type, ...schedule, createdAt: now })))
        .run();
    }
    for (const c of existing) {
      if (wanted.has(c.type)) {
        if (c.suspended) tx.update(card).set({ suspended: false }).where(eq(card.id, c.id)).run();
      } else if (c.reps === 0) {
        tx.delete(card).where(eq(card.id, c.id)).run();
      } else {
        tx.update(card).set({ suspended: true }).where(eq(card.id, c.id)).run();
      }
    }
  });
  notifyChange('item', 'card');
}

export function setItemStatus(db: DbOrTx, id: number, status: ItemStatus, now: number): void {
  db.update(item).set({ status, updatedAt: now }).where(eq(item.id, id)).run();
  notifyChange('item');
}

export function setCardSuspended(db: DbOrTx, cardId: number, suspended: boolean): void {
  db.update(card).set({ suspended }).where(eq(card.id, cardId)).run();
  notifyChange('card');
}

export function deleteItem(db: DbOrTx, id: number): void {
  db.delete(item).where(eq(item.id, id)).run();
  notifyChange('item', 'card', 'review', 'mistake');
}

export function getItem(db: DbOrTx, id: number): ItemRow | undefined {
  return db.select().from(item).where(eq(item.id, id)).get();
}

export interface ItemDetail {
  item: ItemRow;
  chapter: ChapterRow | null;
  cards: CardRow[];
  state: ItemState;
  reviews: (ReviewRow & { cardType: CardRow['type'] })[];
  mistakes: MistakeRow[];
}

export function getItemDetail(db: DbOrTx, id: number): ItemDetail | null {
  const row = getItem(db, id);
  if (!row) return null;
  const cards = db.select().from(card).where(eq(card.itemId, id)).orderBy(card.id).all();
  const reviews = db
    .select({ review, cardType: card.type })
    .from(review)
    .innerJoin(card, eq(review.cardId, card.id))
    .where(eq(card.itemId, id))
    .orderBy(desc(review.reviewedAt))
    .limit(50)
    .all()
    .map((r) => ({ ...r.review, cardType: r.cardType }));
  const mistakes = db
    .select()
    .from(mistake)
    .where(eq(mistake.itemId, id))
    .orderBy(desc(mistake.createdAt))
    .limit(50)
    .all();
  const chapterRow = row.chapterId
    ? (db.select().from(chapter).where(eq(chapter.id, row.chapterId)).get() ?? null)
    : null;
  return { item: row, chapter: chapterRow, cards, state: itemState(cards), reviews, mistakes };
}

export interface DeckFilter {
  search?: string;
  chapterId?: number | 'none' | null;
  kind?: ItemKind | null;
  state?: ItemState | null;
}

export interface DeckRow {
  item: ItemRow;
  state: ItemState;
  nextDue: number | null;
}

/**
 * The deck browser's list. Filtering happens in JS: a personal deck is a
 * few thousand rows at most, and it lets search ignore umlaut spelling.
 */
export function listDeck(db: DbOrTx, filter: DeckFilter = {}): DeckRow[] {
  const conditions = [];
  if (filter.kind) conditions.push(eq(item.kind, filter.kind));
  if (typeof filter.chapterId === 'number') conditions.push(eq(item.chapterId, filter.chapterId));
  const items = db
    .select()
    .from(item)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(item.createdAt), desc(item.id))
    .all()
    .filter((i) => filter.chapterId !== 'none' || i.chapterId === null);

  const cards = items.length
    ? db
        .select({
          itemId: card.itemId,
          state: card.state,
          stability: card.stability,
          suspended: card.suspended,
          due: card.due,
        })
        .from(card)
        .where(
          inArray(
            card.itemId,
            items.map((i) => i.id),
          ),
        )
        .all()
    : [];
  const byItem = new Map<number, typeof cards>();
  for (const c of cards) byItem.set(c.itemId, [...(byItem.get(c.itemId) ?? []), c]);

  const needle = searchKey(filter.search ?? '');
  return items
    .filter((i) => !needle || searchKey(`${i.lemma} ${i.meanings.join(' ')}`).includes(needle))
    .map((i) => {
      const itemCards = byItem.get(i.id) ?? [];
      const state = i.status === 'suspended' ? 'suspended' : itemState(itemCards);
      const reviewed = itemCards.filter((c) => c.state !== 0 && !c.suspended);
      const nextDue = reviewed.length ? Math.min(...reviewed.map((c) => c.due)) : null;
      return { item: i, state, nextDue };
    })
    .filter((row) => !filter.state || row.state === filter.state);
}

/** Every lemma in the deck, for duplicate checks. */
export function allLemmas(db: DbOrTx) {
  return db
    .select({ id: item.id, lemma: item.lemma, article: item.article, kind: item.kind })
    .from(item)
    .all();
}

function searchKey(text: string): string {
  return foldUmlauts(text.toLowerCase()).replace(/\s+/g, ' ').trim();
}

function cleanInput(input: ItemInput): ItemInput {
  const text = (value: string | null) => {
    const trimmed = value?.replace(/\s+/g, ' ').trim();
    return trimmed ? trimmed : null;
  };
  return {
    ...input,
    lemma: input.lemma.replace(/\s+/g, ' ').trim(),
    article: input.kind === 'noun' ? input.article : null,
    plural: input.kind === 'noun' ? text(input.plural) : null,
    verbPresent3: input.kind === 'verb' ? text(input.verbPresent3) : null,
    verbPreterite: input.kind === 'verb' ? text(input.verbPreterite) : null,
    verbParticiple: input.kind === 'verb' ? text(input.verbParticiple) : null,
    verbAuxiliary: input.kind === 'verb' ? input.verbAuxiliary : null,
    meanings: input.meanings.map((m) => m.trim()).filter(Boolean),
    exampleDe: text(input.exampleDe),
    exampleEn: text(input.exampleEn),
    notes: text(input.notes),
    tags: [...new Set(input.tags.map((t) => t.trim()).filter(Boolean))],
  };
}
