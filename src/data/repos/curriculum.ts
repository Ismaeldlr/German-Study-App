import { and, eq, isNotNull } from 'drizzle-orm';

import { CardState, itemState, type ItemState } from '@/core/cards';
import { DRILL_SIZE, type GrammarDrill } from '@/core/drills';
import type { QueueEntry } from '@/core/queue';
import {
  bookName,
  chapterLines,
  CURRICULUM_VERSION,
  getBook,
  getTopic,
  lessonForChapter,
  type Lesson,
  type Level,
  type Topic,
} from '@/curriculum';
import { bankDrill, isBankWorn, WORN_AFTER, type BankUse } from '@/curriculum/bank';

import { notifyChange } from '../changes';
import type { DbOrTx } from '../db';
import { card, exercise, grammarNote, item } from '../schema';
import { getChapter, listChapters, saveChapterList } from './chapters';
import { coverage, markExerciseUsed, nextExercise, saveExercises } from './exercises';
import { insertItemWithCards, setItemStatus, type ItemInput } from './items';
import { getSetting, setSetting } from './settings';

/**
 * The built-in grammar path in your deck. Starting a topic adds it as a
 * grammar item, linked by its curriculum id, with the topic's summary as
 * its note. Its drills come from the topic's bank, offline and free; the
 * LLM only writes drills for it once the bank is worn out.
 */

/** How built-in drills are labelled in the exercise cache, next to the LLM's. */
const BUILTIN = { provider: 'builtin', model: 'curriculum' } as const;

/** Where a topic stands in your deck. */
export interface TopicProgress {
  itemId: number;
  state: ItemState;
  /** When its drill is next due, or null while it is new. */
  due: number | null;
}

/** Every topic you have started, by topic id. */
export function topicProgress(db: DbOrTx): Map<string, TopicProgress> {
  const rows = db
    .select({ item, card })
    .from(item)
    .innerJoin(card, and(eq(card.itemId, item.id), eq(card.type, 'apply_grammar')))
    .where(isNotNull(item.curriculumId))
    .all();
  return new Map(
    rows.map(({ item: i, card: c }) => [
      i.curriculumId!,
      {
        itemId: i.id,
        state: i.status === 'suspended' ? 'suspended' : itemState([c]),
        due: c.state === CardState.New ? null : c.due,
      },
    ]),
  );
}

/** Active grammar items from the path: their drill is always ready. */
function curriculumItemIds(db: DbOrTx): Set<number> {
  return new Set(
    db
      .select({ id: item.id })
      .from(item)
      .where(and(isNotNull(item.curriculumId), eq(item.status, 'active')))
      .all()
      .map((r) => r.id),
  );
}

/** Grammar items that can be drilled now: a cached drill is waiting, or they have a bank. */
export function drillReadyItems(db: DbOrTx): Set<number> {
  return new Set([...coverage(db, 'grammar_drill').keys(), ...curriculumItemIds(db)]);
}

/**
 * Add a topic to your deck, or bring it back if you stopped it. Returns
 * its item. It goes in the chapter of the first Momente lesson that
 * teaches it, when your chapter list has that lesson.
 */
export function startTopic(db: DbOrTx, topicId: string, now: number): number {
  const [id] = startTopics(db, [topicId], now);
  return id;
}

/** Start several topics at once, all or none. Unknown ids are skipped. */
export function startTopics(db: DbOrTx, topicIds: readonly string[], now: number): number[] {
  const topics = topicIds.map(getTopic).filter((t): t is Topic => t !== undefined);
  const existing = topicProgress(db);
  const chapters = listChapters(db);
  const ids = db.transaction((tx) =>
    topics.map((topic) => {
      const known = existing.get(topic.id);
      if (known) {
        if (known.state === 'suspended') setItemStatus(tx, known.itemId, 'active', now);
        return known.itemId;
      }
      const chapterId =
        chapters.find((c) => {
          const lesson = lessonForChapter(c);
          return lesson && topic.lessons.includes(`${lesson.book}/${lesson.number}`);
        })?.id ?? null;
      const itemId = insertItemWithCards(tx, topicItemInput(topic, chapterId), now);
      tx.update(item).set({ curriculumId: topic.id }).where(eq(item.id, itemId)).run();
      tx.insert(grammarNote)
        .values({
          itemId,
          ruleSummary: topic.summary,
          examples: topic.examples.slice(0, 3),
          categories: topic.categories,
        })
        .run();
      return itemId;
    }),
  );
  notifyChange('item', 'card', 'grammar_note');
  return ids;
}

/** Take a topic out of your reviews. Its history stays, and starting it again brings it back. */
export function stopTopic(db: DbOrTx, topicId: string, now: number): void {
  const known = topicProgress(db).get(topicId);
  if (known && known.state !== 'suspended') setItemStatus(db, known.itemId, 'suspended', now);
}

function topicItemInput(topic: Topic, chapterId: number | null): ItemInput {
  return {
    kind: 'grammar',
    lemma: topic.name,
    article: null,
    plural: null,
    verbPresent3: null,
    verbPreterite: null,
    verbParticiple: null,
    verbAuxiliary: null,
    separable: false,
    reflexive: false,
    governedCase: null,
    meanings: [topic.label],
    exampleDe: topic.examples[0]?.de ?? null,
    exampleEn: topic.examples[0]?.en ?? null,
    chapterId,
    tags: [],
    source: 'user',
    notes: null,
  };
}

/** The topic a grammar item practises, if it comes from the path. */
export function topicOfItem(db: DbOrTx, itemId: number): Topic | undefined {
  const row = db.select({ id: item.curriculumId }).from(item).where(eq(item.id, itemId)).get();
  return row?.id ? getTopic(row.id) : undefined;
}

/**
 * How often each of an item's bank items has been asked, from the built-in
 * drills it was shown. A drill thrown out as bad counts as worn through,
 * so its items come last and the LLM steps in sooner.
 */
export function bankUses(db: DbOrTx, itemId: number): Map<string, BankUse> {
  const rows = db
    .select({ payload: exercise.payload, usedAt: exercise.usedAt, discarded: exercise.discarded })
    .from(exercise)
    .where(
      and(
        eq(exercise.mode, 'grammar_drill'),
        eq(exercise.provider, BUILTIN.provider),
        isNotNull(exercise.usedAt),
      ),
    )
    .all();
  const topic = topicOfItem(db, itemId);
  const uses = new Map<string, BankUse>();
  for (const row of rows) {
    const drill = row.payload as GrammarDrill;
    if (!topic || drill.bank?.topic !== topic.id) continue;
    for (const key of drill.bank.keys) {
      const use = uses.get(key) ?? { count: 0, last: 0 };
      uses.set(key, {
        count: use.count + (row.discarded ? WORN_AFTER : 1),
        last: Math.max(use.last, row.usedAt ?? 0),
      });
    }
  }
  return uses;
}

/** Whether a path item has asked every bank item often enough that fresh drills would help. */
export function needsFreshDrills(db: DbOrTx, itemId: number): boolean {
  const topic = topicOfItem(db, itemId);
  return topic ? isBankWorn(topic.drills, bankUses(db, itemId)) : true;
}

/**
 * A drill from a path item's bank, saved as a used exercise so the bank
 * remembers what it asked. Null when the item is not from the path.
 */
export function builtinDrill(
  db: DbOrTx,
  itemId: number,
  now: number,
  options: { size?: number; random?: () => number } = {},
): { exerciseId: number; drill: GrammarDrill } | null {
  const topic = topicOfItem(db, itemId);
  if (!topic) return null;
  const drill = bankDrill(topic, bankUses(db, itemId), options.size ?? DRILL_SIZE, options.random);
  const [exerciseId] = saveExercises(
    db,
    'grammar_drill',
    [{ itemIds: [itemId], topic: null, payload: drill, hash: null }],
    { ...BUILTIN, promptVersion: CURRICULUM_VERSION, tokensIn: 0, tokensOut: 0 },
    now,
  );
  markExerciseUsed(db, exerciseId, now);
  return { exerciseId, drill };
}

/**
 * The drill to ask a grammar card with, marked used: a cached one first
 * (the LLM's, written once a bank wore out), else one from the path's
 * bank. Null for a grammar point of your own with nothing cached.
 */
export function takeGrammarDrill(
  db: DbOrTx,
  itemId: number,
  now: number,
  options: { size?: number; random?: () => number } = {},
): { exerciseId: number; drill: GrammarDrill } | null {
  const cached = nextExercise(db, 'grammar_drill', itemId);
  if (cached) {
    markExerciseUsed(db, cached.id, now);
    return { exerciseId: cached.id, drill: cached.payload };
  }
  return builtinDrill(db, itemId, now, options);
}

/**
 * A practice session on chosen topics, due or not, in the order given.
 * Topics you have not started are skipped, and so are stopped ones.
 */
export function topicQueue(db: DbOrTx, topicIds: readonly string[]): QueueEntry[] {
  const progress = topicProgress(db);
  const entries: QueueEntry[] = [];
  for (const id of new Set(topicIds)) {
    const known = progress.get(id);
    if (!known || known.state === 'suspended') continue;
    const row = db
      .select({ id: card.id, suspended: card.suspended })
      .from(card)
      .where(and(eq(card.itemId, known.itemId), eq(card.type, 'apply_grammar')))
      .get();
    if (!row || row.suspended) continue;
    entries.push({
      cardId: row.id,
      itemId: known.itemId,
      type: 'apply_grammar',
      kind: known.state === 'new' ? 'new_item' : 'review',
      mode: 'grammar_drill',
    });
  }
  return entries;
}

/**
 * Add a level's Momente lessons to the chapter list, with their titles and
 * themes. Lessons already in the list stay as you entered them.
 */
export function fillMomenteChapters(db: DbOrTx, level: Level) {
  const have = new Set(
    listChapters(db)
      .map(lessonForChapter)
      .filter((l) => l?.book.startsWith(level))
      .map((l) => l!.number),
  );
  const missing = chapterLines(level).filter((line) => !have.has(line.number));
  return saveChapterList(db, missing, bookName(level));
}

/**
 * Make a Momente lesson the chapter class is on, adding its level's lessons
 * to the chapter list first when that lesson is not there yet.
 */
export function setCurrentLesson(db: DbOrTx, lesson: Pick<Lesson, 'book' | 'number'>): number {
  const find = () =>
    listChapters(db).find((c) => {
      const l = lessonForChapter(c);
      return l?.book === lesson.book && l.number === lesson.number;
    });
  let row = find();
  if (!row) {
    fillMomenteChapters(db, getBook(lesson.book).level);
    row = find()!;
  }
  setSetting(db, 'study.currentChapterId', row.id);
  return row.id;
}

/** The Momente lesson your class is on, from the current chapter, if it is one. */
export function currentLesson(db: DbOrTx): Lesson | undefined {
  const chapterId = getSetting(db, 'study.currentChapterId');
  const row = chapterId ? getChapter(db, chapterId) : undefined;
  return row ? lessonForChapter(row) : undefined;
}
