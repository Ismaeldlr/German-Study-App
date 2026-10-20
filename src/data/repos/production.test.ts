import { and, eq } from 'drizzle-orm';

import { CardState } from '@/core/cards';
import { Rating } from '@/core/rating';
import { DAY_MS } from '@/core/time';
import type { TranslationExercise, TranslationGrade } from '@/core/translation';

import type { Db } from '../db';
import { card, grammarNote, item, mistake, pendingGrade, review } from '../schema';
import { itemInput, verbInput } from '../testing/fixtures';
import { createTestDb } from '../testing/test-db';
import { exportBackup, readBackup, restoreBackup } from './backup';
import { saveExercises } from './exercises';
import {
  createGrammarItem,
  getGrammarPoint,
  grammarFieldsOf,
  grammarForCategory,
  updateGrammarItem,
} from './grammar';
import {
  applyGrade,
  MAX_GRADE_ATTEMPTS,
  markGradesSeen,
  recordGradeFailure,
  savePendingGrade,
  unseenGrades,
  waitingGrades,
} from './grading';
import { createItem, deleteItem } from './items';
import {
  confusedPairsInDeck,
  dismissLeech,
  listLeeches,
  setMemoryHook,
  suspendLeech,
} from './leeches';
import { drillTargets, translationTargets } from './practice';
import { distractorPool, recordReview, spotConfusions, todayQueue, waitingCardIds } from './study';
import { pullForwardGrammar, weakSpotExamples, weakSpots } from './weak-spots';

const NOW = new Date(2026, 9, 19, 9);
const T = NOW.getTime();

const DATIV = {
  name: 'Dativ nach mit, bei, von',
  label: 'dative after mit, bei, von',
  summary: 'After mit, bei and von, use the dative.',
  examples: [{ de: 'Ich fahre mit dem Bus.', en: 'I go by bus.' }],
  categories: ['case_ending' as const],
};

const GEN = { provider: 'custom', model: 'mock', promptVersion: 'x@1', tokensIn: 0, tokensOut: 0 };

function cardOf(db: Db, itemId: number, type: string) {
  return db
    .select()
    .from(card)
    .where(and(eq(card.itemId, itemId), eq(card.type, type as never)))
    .get()!;
}

/** Make a card a mature review card due now. */
function mature(db: Db, cardId: number, due = T - 1000) {
  db.update(card)
    .set({
      state: CardState.Review,
      stability: 40,
      difficulty: 5,
      reps: 6,
      lastReview: T - 40 * DAY_MS,
      scheduledDays: 40,
      due,
    })
    .where(eq(card.id, cardId))
    .run();
}

function answer(db: Db, cardId: number, rating: number, when: number, mistakes = []) {
  return recordReview(
    db,
    {
      cardId,
      rating: rating as 1 | 2 | 3 | 4,
      mode: 'gap_fill',
      responseMs: 3000,
      answer: 'x',
      correct: rating > 1,
      mistakes,
    },
    when,
  );
}

describe('grammar items', () => {
  it('saves the rule with a note and one drill card', async () => {
    const db = await createTestDb();
    const id = createGrammarItem(db, DATIV, null, T);
    const point = getGrammarPoint(db, id)!;
    expect(point.item).toMatchObject({
      kind: 'grammar',
      lemma: 'Dativ nach mit, bei, von',
      meanings: ['dative after mit, bei, von'],
      exampleDe: 'Ich fahre mit dem Bus.',
    });
    expect(point.note).toMatchObject({
      ruleSummary: 'After mit, bei and von, use the dative.',
      categories: ['case_ending'],
    });
    expect(
      db
        .select()
        .from(card)
        .all()
        .map((c) => c.type),
    ).toEqual(['apply_grammar']);
    expect(grammarFieldsOf(point)).toEqual(DATIV);
  });

  it('edits the rule and finds it by mistake category', async () => {
    const db = await createTestDb();
    const id = createGrammarItem(db, DATIV, null, T);
    updateGrammarItem(
      db,
      id,
      { ...DATIV, summary: 'mit, bei, von: always dative.', categories: ['article'] },
      null,
      T + 1,
    );
    expect(getGrammarPoint(db, id)!.note!.ruleSummary).toBe('mit, bei, von: always dative.');
    expect(db.select().from(grammarNote).all()).toHaveLength(1);
    expect(grammarForCategory(db, 'case_ending')).toEqual([]);
    expect(grammarForCategory(db, 'article').map((r) => r.item.id)).toEqual([id]);
  });

  it('is queued only once a drill is cached', async () => {
    const db = await createTestDb();
    const id = createGrammarItem(db, DATIV, null, T - DAY_MS);
    expect(todayQueue(db, NOW).map((e) => e.itemId)).toEqual([]);
    expect(drillTargets(db, NOW).map((t) => t.itemId)).toEqual([id]);
    saveExercises(
      db,
      'grammar_drill',
      [{ itemIds: [id], topic: null, payload: { point: DATIV.name, items: [] }, hash: null }],
      GEN,
      T,
    );
    expect(todayQueue(db, NOW).map((e) => [e.itemId, e.kind, e.mode])).toEqual([
      [id, 'new_item', 'grammar_drill'],
    ]);
    expect(drillTargets(db, NOW)).toEqual([]);
  });
});

describe('pending grades', () => {
  async function setup() {
    const db = await createTestDb();
    const wohnung = createItem(db, itemInput(), T - 60 * DAY_MS);
    const umziehen = createItem(db, verbInput(), T - 60 * DAY_MS);
    const a = cardOf(db, wohnung, 'produce');
    const b = cardOf(db, umziehen, 'produce');
    mature(db, a.id);
    mature(db, b.id);
    const exerciseValue: TranslationExercise = {
      english: 'We are moving into the flat in May.',
      reference: 'Wir ziehen im Mai in die Wohnung um.',
      cues: ['flat', 'to move'],
      targets: [
        { cardId: a.id, itemId: wohnung, word: 'die Wohnung', meaning: 'flat' },
        { cardId: b.id, itemId: umziehen, word: 'umziehen', meaning: 'to move (house)' },
      ],
      grammar: null,
    };
    const id = savePendingGrade(db, {
      exerciseId: null,
      exercise: exerciseValue,
      answer: ' Wir umziehen im Mai in die Wohnung. ',
      responseMs: 20_000,
      answeredAt: T,
    });
    return { db, id, a, b, wohnung, umziehen };
  }

  const grade = (a: number, b: number, wohnung: number, umziehen: number): TranslationGrade => ({
    verdict: 'wrong',
    targets: [
      { cardId: a, itemId: wohnung, word: 'die Wohnung', verdict: 'correct' },
      { cardId: b, itemId: umziehen, word: 'umziehen', verdict: 'wrong' },
    ],
    errors: [
      {
        category: 'verb_form',
        text: 'umziehen',
        correction: 'ziehen … um',
        explanation: 'A separable verb splits in a main clause.',
        word: 'umziehen',
      },
    ],
    corrected: 'Wir ziehen im Mai in die Wohnung um.',
    natural: 'Wir ziehen im Mai in die Wohnung um.',
    explanation: 'umziehen splits.',
  });

  it('keeps the answer and holds its cards out of the queue until graded', async () => {
    const { db, a, b } = await setup();
    expect(waitingGrades(db)).toHaveLength(1);
    expect(waitingGrades(db)[0].answer).toBe('Wir umziehen im Mai in die Wohnung.');
    expect(waitingCardIds(db)).toEqual(new Set([a.id, b.id]));
    expect(todayQueue(db, NOW).map((e) => e.cardId)).not.toContain(a.id);
    expect(translationTargets(db, NOW)).toEqual([]);
  });

  it('rates each target from its verdict, at the time you answered', async () => {
    const { db, id, a, b, wohnung, umziehen } = await setup();
    const applied = applyGrade(db, id, grade(a.id, b.id, wohnung, umziehen), T + DAY_MS);
    expect(applied.map((r) => [r.cardId, r.rating])).toEqual([
      [a.id, Rating.Good],
      [b.id, Rating.Again],
    ]);
    const logged = db.select().from(review).all();
    expect(logged.map((r) => [r.cardId, r.mode, r.reviewedAt, r.correct])).toEqual([
      [a.id, 'translation', T, true],
      [b.id, 'translation', T, false],
    ]);
    const [m] = db.select().from(mistake).all();
    expect(m).toMatchObject({ itemId: umziehen, category: 'verb_form', yourText: 'umziehen' });
    expect(waitingGrades(db)).toEqual([]);
    expect(unseenGrades(db).map((r) => r.id)).toEqual([id]);
    markGradesSeen(db, [id], T + DAY_MS);
    expect(unseenGrades(db)).toEqual([]);
    // Graded once only.
    expect(applyGrade(db, id, grade(a.id, b.id, wohnung, umziehen), T + DAY_MS)).toEqual([]);
  });

  it('gives up after a few unusable replies, but waits out being offline', async () => {
    const { db, id, a } = await setup();
    for (let i = 0; i < 5; i++) recordGradeFailure(db, id, 'offline', false);
    expect(waitingGrades(db)).toHaveLength(1);
    for (let i = 1; i < MAX_GRADE_ATTEMPTS; i++) {
      expect(recordGradeFailure(db, id, 'bad JSON', true)).toBe('pending');
    }
    expect(recordGradeFailure(db, id, 'bad JSON', true)).toBe('failed');
    expect(waitingCardIds(db).has(a.id)).toBe(false);
  });

  it('survives an export and import', async () => {
    const { db } = await setup();
    const file = exportBackup(db, NOW);
    const other = await createTestDb();
    restoreBackup(other, readBackup(JSON.parse(JSON.stringify(file))).file);
    expect(other.select().from(pendingGrade).all()).toEqual(db.select().from(pendingGrade).all());
  });
});

describe('translation targets', () => {
  it('are mature production cards due by tomorrow without a translation waiting', async () => {
    const db = await createTestDb();
    const wohnung = createItem(db, itemInput(), T - 60 * DAY_MS);
    const kueche = createItem(db, itemInput({ lemma: 'Küche', plural: 'Küchen' }), T);
    mature(db, cardOf(db, wohnung, 'produce').id);
    mature(db, cardOf(db, kueche, 'produce').id, T + 10 * DAY_MS);
    expect(translationTargets(db, NOW).map((t) => t.word)).toEqual(['die Wohnung']);
  });
});

describe('weak spots', () => {
  it('count what you produced, not meanings you picked wrong', async () => {
    const db = await createTestDb();
    const id = createItem(db, itemInput(), T - DAY_MS);
    const note = (category: 'article' | 'wrong_word', yourText: string) => ({
      category,
      yourText,
      correction: 'die Wohnung',
      explanation: 'x',
    });
    answer(db, cardOf(db, id, 'gender').id, Rating.Again, T, [
      note('article', 'der Wohnung'),
    ] as never);
    answer(db, cardOf(db, id, 'recognize').id, Rating.Again, T, [
      note('wrong_word', 'kitchen'),
    ] as never);
    expect(weakSpots(db, NOW).map((s) => [s.category, s.count])).toEqual([['article', 1]]);
    expect(weakSpotExamples(db, 'article').map((m) => [m.lemma, m.yourText])).toEqual([
      ['Wohnung', 'der Wohnung'],
    ]);
    expect(weakSpotExamples(db, 'wrong_word')).toEqual([]);
  });

  it('pull the matching grammar point forward once they stand out', async () => {
    const db = await createTestDb();
    const word = createItem(db, itemInput(), T - DAY_MS);
    const rule = createGrammarItem(db, DATIV, null, T - 5 * DAY_MS);
    mature(db, cardOf(db, rule, 'apply_grammar').id, T + 9 * DAY_MS);
    const ending = {
      category: 'case_ending',
      yourText: 'den',
      correction: 'dem',
      explanation: 'dative',
    };
    answer(db, cardOf(db, word, 'gender').id, Rating.Again, T - 1000, [ending] as never);
    expect(pullForwardGrammar(db, NOW)).toEqual(new Set());
    answer(db, cardOf(db, word, 'plural').id, Rating.Again, T - 500, [ending] as never);
    expect(pullForwardGrammar(db, NOW)).toEqual(new Set([rule]));
    expect(drillTargets(db, NOW).map((t) => t.itemId)).toEqual([rule]);
  });
});

describe('leeches and confusions', () => {
  it('flags a card at its sixth lapse; you can keep it, or suspend it', async () => {
    const db = await createTestDb();
    const id = createItem(db, itemInput(), T - 100 * DAY_MS);
    const produce = cardOf(db, id, 'produce');
    let at = T - 90 * DAY_MS;
    for (let lapse = 1; lapse <= 6; lapse++) {
      answer(db, produce.id, Rating.Good, at);
      at += 10 * DAY_MS;
      answer(db, produce.id, Rating.Good, at);
      at += 2 * DAY_MS;
      answer(db, produce.id, Rating.Again, at);
      at += DAY_MS / 2;
      expect(listLeeches(db).length).toBe(cardOf(db, id, 'produce').lapses >= 6 ? 1 : 0);
    }
    expect(cardOf(db, id, 'produce')).toMatchObject({ lapses: 6, leechAt: expect.any(Number) });
    setMemoryHook(db, id, '  Picture a flat with one huge window.  ', at);
    expect(listLeeches(db)[0].item.memoryHook).toBe('Picture a flat with one huge window.');
    dismissLeech(db, produce.id);
    expect(listLeeches(db)).toEqual([]);
    db.update(card).set({ leechAt: at }).where(eq(card.id, produce.id)).run();
    suspendLeech(db, produce.id);
    expect(listLeeches(db)).toEqual([]);
    expect(cardOf(db, id, 'produce').suspended).toBe(true);
  });

  it('logs a wrong answer that is another deck word as a confusion', async () => {
    const db = await createTestDb();
    const stellen = createItem(
      db,
      verbInput({
        lemma: 'stellen',
        verbPresent3: 'stellt',
        verbPreterite: 'stellte',
        verbParticiple: 'gestellt',
        verbAuxiliary: 'haben',
        separable: false,
        meanings: ['to put (upright)'],
      }),
      T - DAY_MS,
    );
    const stehen = createItem(
      db,
      verbInput({
        lemma: 'stehen',
        verbPresent3: 'steht',
        verbPreterite: 'stand',
        verbParticiple: 'gestanden',
        verbAuxiliary: 'haben',
        separable: false,
        meanings: ['to stand'],
      }),
      T - DAY_MS,
    );
    const wrong = (yourText: string) => ({
      category: 'wrong_word' as const,
      yourText,
      correction: 'stellen',
      explanation: 'x',
    });
    answer(db, cardOf(db, stellen, 'produce').id, Rating.Again, T, [wrong('stehen')] as never);
    expect(db.select().from(mistake).all()[0].confusedItemId).toBe(stehen);
    expect(confusedPairsInDeck(db)).toEqual([]);
    answer(db, cardOf(db, stehen, 'produce').id, Rating.Again, T + 1, [
      { ...wrong('stellt'), correction: 'steht' },
    ] as never);
    expect(confusedPairsInDeck(db).map((p) => [p.itemIds, p.count])).toEqual([
      [[stellen, stehen], 2],
    ]);
    // Deleting a word unlinks the mistakes that named it instead of blocking the delete.
    deleteItem(db, stehen);
    expect(db.select().from(item).all()).toHaveLength(1);
    expect(
      db
        .select()
        .from(mistake)
        .all()
        .map((m) => m.confusedItemId),
    ).toEqual([null, stellen]);
    expect(confusedPairsInDeck(db)).toEqual([]);
  });
});

describe('multiple choice', () => {
  it('never offers a grammar point as a word’s meaning', async () => {
    const db = await createTestDb();
    createItem(db, itemInput(), T);
    createGrammarItem(db, DATIV, null, T);
    expect(distractorPool(db).map((p) => p.kind)).toEqual(['noun']);
  });
});

describe('spotting mix-ups', () => {
  it('turns a close spelling that is another deck word into a mix-up of the two', async () => {
    const db = await createTestDb();
    const legen = createItem(
      db,
      verbInput({
        lemma: 'legen',
        verbPresent3: 'legt',
        verbPreterite: 'legte',
        verbParticiple: 'gelegt',
        verbAuxiliary: 'haben',
        separable: false,
        meanings: ['to lay'],
      }),
      T,
    );
    const liegen = createItem(
      db,
      verbInput({
        lemma: 'liegen',
        verbPresent3: 'liegt',
        verbPreterite: 'lag',
        verbParticiple: 'gelegen',
        verbAuxiliary: 'haben',
        separable: false,
        meanings: ['to lie (be lying)'],
      }),
      T,
    );
    const spelling = {
      category: 'spelling' as const,
      yourText: 'liegen',
      correction: 'legen',
      explanation: 'Close, but the spelling is off.',
    };
    const typo = { ...spelling, yourText: 'leggen' };
    expect(spotConfusions(db, legen, [spelling, typo])).toEqual([
      {
        category: 'wrong_word',
        yourText: 'liegen',
        correction: 'legen',
        confusedItemId: liegen,
        explanation: 'liegen is another word (to lie (be lying)). Here it is legen.',
      },
      { ...typo, confusedItemId: null },
    ]);
  });
});
