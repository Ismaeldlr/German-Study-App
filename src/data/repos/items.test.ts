import { eq } from 'drizzle-orm';

import { card } from '../schema';
import { createTestDb } from '../testing/test-db';
import { itemInput, verbInput } from '../testing/fixtures';
import { createChapter, deleteChapter, listChapters, parseThemes } from './chapters';
import {
  allLemmas,
  createItem,
  createItems,
  deleteItem,
  getItemDetail,
  listDeck,
  setItemStatus,
  updateItem,
} from './items';
import { recordReview } from './study';

const now = new Date(2026, 9, 19, 9).getTime();

describe('items repository', () => {
  it('creates an item with one card per card type, all new and due now', async () => {
    const db = await createTestDb();
    const id = createItem(db, itemInput(), now);
    const cards = db.select().from(card).where(eq(card.itemId, id)).orderBy(card.id).all();
    expect(cards.map((c) => c.type)).toEqual(['recognize', 'produce', 'gender', 'plural']);
    expect(cards.every((c) => c.state === 0 && c.due === now && c.reps === 0)).toBe(true);
  });

  it('cleans input: trims text, drops forms that do not fit the word type', async () => {
    const db = await createTestDb();
    const id = createItem(
      db,
      itemInput({
        kind: 'adjective',
        lemma: '  gemütlich ',
        article: 'die',
        plural: 'x',
        meanings: [' cosy ', ''],
        tags: ['a', 'a', ' '],
      }),
      now,
    );
    const { item } = getItemDetail(db, id)!;
    expect(item).toMatchObject({
      lemma: 'gemütlich',
      article: null,
      plural: null,
      meanings: ['cosy'],
      tags: ['a'],
    });
  });

  it('imports a batch all at once, or not at all', async () => {
    const db = await createTestDb();
    const ids = createItems(db, [itemInput(), verbInput()], now);
    expect(ids).toHaveLength(2);
    expect(() =>
      createItems(db, [itemInput({ lemma: 'Haus' }), itemInput({ chapterId: 999 })], now),
    ).toThrow();
    expect(
      allLemmas(db)
        .map((l) => l.lemma)
        .sort(),
    ).toEqual(['Wohnung', 'umziehen']);
  });

  it('adds a card when an edit adds a form, and suspends a reviewed card that no longer applies', async () => {
    const db = await createTestDb();
    const id = createItem(db, verbInput({ verbAuxiliary: null }), now);
    let types = db
      .select()
      .from(card)
      .where(eq(card.itemId, id))
      .orderBy(card.id)
      .all()
      .map((c) => c.type);
    expect(types).toEqual(['recognize', 'produce']);

    updateItem(db, id, verbInput(), now + 1);
    const cards = db.select().from(card).where(eq(card.itemId, id)).orderBy(card.id).all();
    expect(cards.map((c) => c.type)).toEqual(['recognize', 'produce', 'verb_forms']);

    const formsCard = cards.find((c) => c.type === 'verb_forms')!;
    recordReview(
      db,
      {
        cardId: formsCard.id,
        rating: 3,
        mode: 'classic',
        responseMs: 1,
        answer: 'x',
        correct: true,
      },
      now + 2,
    );
    updateItem(db, id, verbInput({ kind: 'phrase' }), now + 3);
    const after = db.select().from(card).where(eq(card.itemId, id)).orderBy(card.id).all();
    expect(after.find((c) => c.type === 'verb_forms')?.suspended).toBe(true);

    updateItem(db, id, verbInput({ verbPresent3: null }), now + 4);
    types = db
      .select()
      .from(card)
      .where(eq(card.itemId, id))
      .orderBy(card.id)
      .all()
      .map((c) => c.type);
    expect(types).toContain('verb_forms'); // kept because it has history
  });

  it('deletes a never-reviewed card that no longer applies', async () => {
    const db = await createTestDb();
    const id = createItem(db, itemInput(), now);
    updateItem(db, id, itemInput({ plural: null }), now);
    const types = db
      .select()
      .from(card)
      .where(eq(card.itemId, id))
      .orderBy(card.id)
      .all()
      .map((c) => c.type);
    expect(types).toEqual(['recognize', 'produce', 'gender']);
  });

  it('lists the deck with search, filters and item state', async () => {
    const db = await createTestDb();
    const ch = createChapter(db, { number: 1, title: 'Wohnen', themes: ['Wohnung'] });
    const w = createItem(db, itemInput({ chapterId: ch }), now);
    createItem(db, itemInput({ lemma: 'Küche', meanings: ['kitchen'], plural: 'Küchen' }), now + 1);
    createItem(db, verbInput({ chapterId: ch }), now + 2);

    expect(listDeck(db).map((r) => r.item.lemma)).toEqual(['umziehen', 'Küche', 'Wohnung']);
    expect(listDeck(db, { search: 'kueche' }).map((r) => r.item.lemma)).toEqual(['Küche']);
    expect(listDeck(db, { search: 'APARTMENT' }).map((r) => r.item.lemma)).toEqual(['Wohnung']);
    expect(listDeck(db, { chapterId: ch }).map((r) => r.item.lemma)).toEqual([
      'umziehen',
      'Wohnung',
    ]);
    expect(listDeck(db, { chapterId: 'none' }).map((r) => r.item.lemma)).toEqual(['Küche']);
    expect(listDeck(db, { kind: 'verb' })).toHaveLength(1);

    const recognize = db.select().from(card).where(eq(card.itemId, w)).all()[0];
    recordReview(
      db,
      {
        cardId: recognize.id,
        rating: 1,
        mode: 'classic',
        responseMs: 1,
        answer: null,
        correct: false,
      },
      now,
    );
    expect(listDeck(db, { state: 'learning' }).map((r) => r.item.lemma)).toEqual(['Wohnung']);
    setItemStatus(db, w, 'suspended', now);
    expect(listDeck(db, { state: 'suspended' }).map((r) => r.item.lemma)).toEqual(['Wohnung']);
  });

  it('returns item detail with chapter, cards, history and mistakes', async () => {
    const db = await createTestDb();
    const ch = createChapter(db, { number: 2, title: 'Arbeit', themes: [] });
    const id = createItem(db, itemInput({ chapterId: ch }), now);
    const gender = db.select().from(card).where(eq(card.itemId, id)).orderBy(card.id).all()[2];
    recordReview(
      db,
      {
        cardId: gender.id,
        rating: 1,
        mode: 'classic',
        responseMs: 900,
        answer: 'der',
        correct: false,
        mistakes: [
          {
            category: 'article',
            yourText: 'der Wohnung',
            correction: 'die Wohnung',
            explanation: 'x',
          },
        ],
      },
      now,
    );
    const detail = getItemDetail(db, id)!;
    expect(detail.chapter?.title).toBe('Arbeit');
    expect(detail.cards).toHaveLength(4);
    expect(detail.reviews).toEqual([
      expect.objectContaining({ cardType: 'gender', answer: 'der' }),
    ]);
    expect(detail.mistakes).toEqual([expect.objectContaining({ category: 'article' })]);
    expect(detail.state).toBe('learning');

    deleteItem(db, id);
    expect(getItemDetail(db, id)).toBeNull();
  });
});

describe('chapters repository', () => {
  it('creates, lists and deletes chapters; items keep existing untagged', async () => {
    const db = await createTestDb();
    const two = createChapter(db, { number: 2, title: ' Arbeit ', themes: ['Beruf', 'Beruf', ''] });
    createChapter(db, { number: 1, title: 'Wohnen', themes: [] });
    expect(listChapters(db).map((c) => [c.number, c.title, c.themes])).toEqual([
      [1, 'Wohnen', []],
      [2, 'Arbeit', ['Beruf']],
    ]);
    const id = createItem(db, itemInput({ chapterId: two }), now);
    deleteChapter(db, two);
    expect(getItemDetail(db, id)?.item.chapterId).toBeNull();
  });

  it('rejects a duplicate chapter number in the same book', async () => {
    const db = await createTestDb();
    createChapter(db, { number: 1, title: 'A', themes: [] });
    expect(() => createChapter(db, { number: 1, title: 'B', themes: [] })).toThrow();
  });

  it('parses themes typed with commas', () => {
    expect(parseThemes('Wohnen, Umzug ;  Nachbarn,')).toEqual(['Wohnen', 'Umzug', 'Nachbarn']);
  });
});
