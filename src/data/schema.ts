import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
  type AnySQLiteColumn,
} from 'drizzle-orm/sqlite-core';

import {
  ITEM_KINDS,
  ARTICLES,
  CASES,
  AUXILIARIES,
  ITEM_SOURCES,
  ITEM_STATUSES,
  CARD_TYPES,
  EXERCISE_MODES,
  MISTAKE_CATEGORIES,
  SUGGESTION_STATUSES,
  type Example,
  type MistakeCategory,
} from '../core/model';
import { CHAT_TURNS, type ChatMessage, type ChatResult, type ChatTarget } from '../core/chat';
import type { DraftFields, DraftFlag } from '../core/drafts';
import type { TranslationExercise, TranslationGrade } from '../core/translation';

export interface SuggestionDetails {
  fields: DraftFields;
  flags: DraftFlag[];
}

export * from '../core/model';

// All timestamps are integer milliseconds since the epoch. Plain numbers keep
// export/import lossless and make date math trivial in `core`.

const now = () => Date.now();

export const chapter = sqliteTable(
  'chapter',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    book: text('book').notNull().default('Momente A2'),
    number: integer('number').notNull(),
    title: text('title').notNull(),
    themes: text('themes', { mode: 'json' })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
  },
  (t) => [uniqueIndex('chapter_book_number_unique').on(t.book, t.number)],
);

export const item = sqliteTable(
  'item',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    kind: text('kind', { enum: ITEM_KINDS }).notNull(),
    lemma: text('lemma').notNull(),
    article: text('article', { enum: ARTICLES }),
    plural: text('plural'),
    verbPresent3: text('verb_present3'),
    verbPreterite: text('verb_preterite'),
    verbParticiple: text('verb_participle'),
    verbAuxiliary: text('verb_auxiliary', { enum: AUXILIARIES }),
    separable: integer('separable', { mode: 'boolean' }).notNull().default(false),
    reflexive: integer('reflexive', { mode: 'boolean' }).notNull().default(false),
    governedCase: text('governed_case', { enum: CASES }),
    meanings: text('meanings', { mode: 'json' }).$type<string[]>().notNull(),
    exampleDe: text('example_de'),
    exampleEn: text('example_en'),
    chapterId: integer('chapter_id').references((): AnySQLiteColumn => chapter.id, {
      onDelete: 'set null',
    }),
    tags: text('tags', { mode: 'json' })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    source: text('source', { enum: ITEM_SOURCES }).notNull().default('user'),
    status: text('status', { enum: ITEM_STATUSES }).notNull().default('active'),
    notes: text('notes'),
    /** A mnemonic the LLM wrote once the item's card became a leech. */
    memoryHook: text('memory_hook'),
    createdAt: integer('created_at').notNull().$defaultFn(now),
    updatedAt: integer('updated_at').notNull().$defaultFn(now),
  },
  (t) => [
    index('item_lemma_idx').on(t.lemma),
    index('item_chapter_idx').on(t.chapterId),
    index('item_kind_idx').on(t.kind),
  ],
);

export const grammarNote = sqliteTable('grammar_note', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  itemId: integer('item_id')
    .notNull()
    .unique()
    .references(() => item.id, { onDelete: 'cascade' }),
  ruleSummary: text('rule_summary').notNull(),
  examples: text('examples', { mode: 'json' })
    .$type<Example[]>()
    .notNull()
    .default(sql`'[]'`),
  /** The mistake categories this rule is about, so weak spots can pull it forward. */
  categories: text('categories', { mode: 'json' })
    .$type<MistakeCategory[]>()
    .notNull()
    .default(sql`'[]'`),
});

export const card = sqliteTable(
  'card',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    itemId: integer('item_id')
      .notNull()
      .references(() => item.id, { onDelete: 'cascade' }),
    type: text('type', { enum: CARD_TYPES }).notNull(),
    // FSRS state as in ts-fsrs: 0 New, 1 Learning, 2 Review, 3 Relearning.
    state: integer('state').notNull().default(0),
    stability: real('stability').notNull().default(0),
    difficulty: real('difficulty').notNull().default(0),
    due: integer('due').notNull(),
    scheduledDays: integer('scheduled_days').notNull().default(0),
    learningSteps: integer('learning_steps').notNull().default(0),
    reps: integer('reps').notNull().default(0),
    lapses: integer('lapses').notNull().default(0),
    lastReview: integer('last_review'),
    suspended: integer('suspended', { mode: 'boolean' }).notNull().default(false),
    /** When the card was last flagged as a leech; null once you dealt with it. */
    leechAt: integer('leech_at'),
    createdAt: integer('created_at').notNull().$defaultFn(now),
  },
  (t) => [
    uniqueIndex('card_item_type_unique').on(t.itemId, t.type),
    index('card_due_idx').on(t.due),
    index('card_state_idx').on(t.state),
  ],
);

export const review = sqliteTable(
  'review',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    cardId: integer('card_id')
      .notNull()
      .references(() => card.id, { onDelete: 'cascade' }),
    reviewedAt: integer('reviewed_at').notNull(),
    // FSRS rating: 1 Again, 2 Hard, 3 Good, 4 Easy.
    rating: integer('rating').notNull(),
    mode: text('mode', { enum: EXERCISE_MODES }).notNull(),
    responseMs: integer('response_ms'),
    answer: text('answer'),
    correct: integer('correct', { mode: 'boolean' }).notNull(),
    // Card state before this review, so FSRS can be re-fit from the log.
    stateBefore: integer('state_before').notNull(),
  },
  (t) => [index('review_card_idx').on(t.cardId), index('review_reviewed_at_idx').on(t.reviewedAt)],
);

export const mistake = sqliteTable(
  'mistake',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    reviewId: integer('review_id').references(() => review.id, { onDelete: 'set null' }),
    itemId: integer('item_id').references(() => item.id, { onDelete: 'set null' }),
    category: text('category', { enum: MISTAKE_CATEGORIES }).notNull(),
    yourText: text('your_text').notNull(),
    correction: text('correction').notNull(),
    explanation: text('explanation'),
    /** The deck item your wrong answer actually was: stehen typed for stellen. */
    confusedItemId: integer('confused_item_id').references((): AnySQLiteColumn => item.id, {
      onDelete: 'set null',
    }),
    createdAt: integer('created_at').notNull().$defaultFn(now),
  },
  (t) => [index('mistake_item_idx').on(t.itemId), index('mistake_category_idx').on(t.category)],
);

export const exercise = sqliteTable(
  'exercise',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    mode: text('mode', { enum: EXERCISE_MODES }).notNull(),
    targetItemIds: text('target_item_ids', { mode: 'json' }).$type<number[]>().notNull(),
    topic: text('topic'),
    payload: text('payload', { mode: 'json' }).$type<unknown>().notNull(),
    sentenceHash: text('sentence_hash'),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    promptVersion: text('prompt_version').notNull(),
    tokensIn: integer('tokens_in').notNull().default(0),
    tokensOut: integer('tokens_out').notNull().default(0),
    createdAt: integer('created_at').notNull().$defaultFn(now),
    usedAt: integer('used_at'),
    discarded: integer('discarded', { mode: 'boolean' }).notNull().default(false),
  },
  (t) => [index('exercise_mode_used_idx').on(t.mode, t.usedAt)],
);

export const PENDING_GRADE_STATUSES = ['pending', 'graded', 'failed'] as const;

/**
 * Translations waiting for the LLM to grade them. The answer is saved the
 * moment you give it; the cards' schedules update once it is graded.
 */
export const pendingGrade = sqliteTable(
  'pending_grade',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    exerciseId: integer('exercise_id').references(() => exercise.id, { onDelete: 'set null' }),
    /** The exercise as shown, so grading never depends on the cache. */
    exercise: text('exercise', { mode: 'json' }).$type<TranslationExercise>().notNull(),
    answer: text('answer').notNull(),
    responseMs: integer('response_ms'),
    answeredAt: integer('answered_at').notNull(),
    status: text('status', { enum: PENDING_GRADE_STATUSES }).notNull().default('pending'),
    /** Failed attempts with an unusable reply; it gives up after a few. */
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    result: text('result', { mode: 'json' }).$type<TranslationGrade>(),
    gradedAt: integer('graded_at'),
    /** When you saw the feedback, in the session or in the graded list. */
    seenAt: integer('seen_at'),
  },
  (t) => [index('pending_grade_status_idx').on(t.status)],
);

export const suggestion = sqliteTable(
  'suggestion',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    lemma: text('lemma').notNull(),
    reason: text('reason').notNull(),
    chapterId: integer('chapter_id').references(() => chapter.id, { onDelete: 'set null' }),
    status: text('status', { enum: SUGGESTION_STATUSES }).notNull().default('pending'),
    // The word's full data and check flags, so accepting it is one tap.
    details: text('details', { mode: 'json' }).$type<SuggestionDetails>(),
    createdAt: integer('created_at').notNull().$defaultFn(now),
  },
  (t) => [uniqueIndex('suggestion_lemma_unique').on(t.lemma)],
);

export const studySession = sqliteTable('session', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  startedAt: integer('started_at').notNull(),
  endedAt: integer('ended_at'),
  cardsDone: integer('cards_done').notNull().default(0),
  newItems: integer('new_items').notNull().default(0),
  accuracy: real('accuracy'),
});

export const chat = sqliteTable('chat', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  /** The scenario's short German title. */
  scenario: text('scenario').notNull(),
  /** Who the character is, in English. */
  character: text('character').notNull().default(''),
  /** Who you are and what you want, in English. */
  situation: text('situation').notNull().default(''),
  topic: text('topic'),
  messages: text('messages', { mode: 'json' })
    .$type<ChatMessage[]>()
    .notNull()
    .default(sql`'[]'`),
  targetItemIds: text('target_item_ids', { mode: 'json' })
    .$type<number[]>()
    .notNull()
    .default(sql`'[]'`),
  /** The target words as they were when the chat began, so rating never depends on the deck. */
  targets: text('targets', { mode: 'json' })
    .$type<ChatTarget[]>()
    .notNull()
    .default(sql`'[]'`),
  /** How many messages of yours the chat runs to. */
  maxTurns: integer('max_turns').notNull().default(CHAT_TURNS),
  /** The rolling summary of everything before the latest turns. */
  summary: text('summary'),
  /** The end summary and each target word's rating. */
  result: text('result', { mode: 'json' }).$type<ChatResult>(),
  endedAt: integer('ended_at'),
  createdAt: integer('created_at').notNull().$defaultFn(now),
  updatedAt: integer('updated_at').notNull().$defaultFn(now),
});

export const llmUsage = sqliteTable(
  'llm_usage',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    // Local calendar day, YYYY-MM-DD.
    day: text('day').notNull(),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    calls: integer('calls').notNull().default(0),
    tokensIn: integer('tokens_in').notNull().default(0),
    tokensOut: integer('tokens_out').notNull().default(0),
    estimatedCost: real('estimated_cost').notNull().default(0),
  },
  (t) => [uniqueIndex('llm_usage_day_provider_model_unique').on(t.day, t.provider, t.model)],
);

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  // JSON-encoded value. The API key never lives here; it is in secure storage.
  value: text('value').notNull(),
});

export type ChapterRow = typeof chapter.$inferSelect;
export type ItemRow = typeof item.$inferSelect;
export type NewItemRow = typeof item.$inferInsert;
export type GrammarNoteRow = typeof grammarNote.$inferSelect;
export type CardRow = typeof card.$inferSelect;
export type NewCardRow = typeof card.$inferInsert;
export type ReviewRow = typeof review.$inferSelect;
export type MistakeRow = typeof mistake.$inferSelect;
export type ExerciseRow = typeof exercise.$inferSelect;
export type PendingGradeRow = typeof pendingGrade.$inferSelect;
export type SuggestionRow = typeof suggestion.$inferSelect;
export type StudySessionRow = typeof studySession.$inferSelect;
export type ChatRow = typeof chat.$inferSelect;
export type LlmUsageRow = typeof llmUsage.$inferSelect;
export type SettingsRow = typeof settings.$inferSelect;
