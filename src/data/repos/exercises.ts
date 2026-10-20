import { and, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm';

import type { ContrastSet, GrammarDrill } from '@/core/drills';
import { FRESHNESS_WINDOW, isFresh, type GapExercise } from '@/core/gap-fill';
import type { ExerciseMode } from '@/core/model';
import type { TranslationExercise } from '@/core/translation';

import { notifyChange } from '../changes';
import type { DbOrTx } from '../db';
import { exercise, type ExerciseRow } from '../schema';

/**
 * The cache of generated content. Each row is used once; an item never
 * gets a sentence it saw within its last FRESHNESS_WINDOW exercises of
 * that mode. Gap sentences, translations, grammar drills and contrast sets
 * all live here, told apart by mode.
 */

export interface GapPayload extends GapExercise {
  cardId: number;
}

/** What each cached mode stores as its payload. */
export interface PayloadByMode {
  gap_fill: GapPayload;
  translation: TranslationExercise;
  grammar_drill: GrammarDrill;
  contrast: ContrastSet;
}
export type CachedMode = keyof PayloadByMode;

export interface Cached<M extends CachedMode> {
  id: number;
  /** The first target item; for gap sentences and drills, the only one. */
  itemId: number;
  itemIds: number[];
  topic: string | null;
  payload: PayloadByMode[M];
}

export type CachedGap = Cached<'gap_fill'>;

export interface NewExerciseRow<M extends CachedMode> {
  itemIds: number[];
  topic: string | null;
  payload: PayloadByMode[M];
  hash: string | null;
}

export interface NewGapRow {
  cardId: number;
  itemId: number;
  topic: string;
  exercise: GapExercise;
  hash: string;
}

export interface GenerationInfo {
  provider: string;
  model: string;
  promptVersion: string;
  tokensIn: number;
  tokensOut: number;
}

/** Store a batch, sharing its token cost evenly between the rows. */
export function saveExercises<M extends CachedMode>(
  db: DbOrTx,
  mode: M,
  rows: readonly NewExerciseRow<M>[],
  info: GenerationInfo,
  now: number,
): number[] {
  if (rows.length === 0) return [];
  const share = (tokens: number) => Math.round(tokens / rows.length);
  const ids = db
    .insert(exercise)
    .values(
      rows.map((row) => ({
        mode,
        targetItemIds: row.itemIds,
        topic: row.topic,
        payload: row.payload,
        sentenceHash: row.hash,
        provider: info.provider,
        model: info.model,
        promptVersion: info.promptVersion,
        tokensIn: share(info.tokensIn),
        tokensOut: share(info.tokensOut),
        createdAt: now,
      })),
    )
    .returning({ id: exercise.id })
    .all()
    .map((r) => r.id);
  notifyChange('exercise');
  return ids;
}

export function saveGapExercises(
  db: DbOrTx,
  rows: readonly NewGapRow[],
  info: GenerationInfo,
  now: number,
): void {
  saveExercises(
    db,
    'gap_fill',
    rows.map((row) => ({
      itemIds: [row.itemId],
      topic: row.topic,
      payload: { ...row.exercise, cardId: row.cardId },
      hash: row.hash,
    })),
    info,
    now,
  );
}

const liveRows = (db: DbOrTx, mode: CachedMode) =>
  db
    .select()
    .from(exercise)
    .where(and(eq(exercise.mode, mode), eq(exercise.discarded, false)))
    .all();

/** Hashes of the exercises of a mode an item was shown, newest first. */
export function recentHashes(
  db: DbOrTx,
  itemId: number,
  limit = FRESHNESS_WINDOW,
  mode: CachedMode = 'gap_fill',
): string[] {
  return db
    .select({ hash: exercise.sentenceHash, targets: exercise.targetItemIds })
    .from(exercise)
    .where(and(eq(exercise.mode, mode), isNotNull(exercise.usedAt)))
    .orderBy(desc(exercise.usedAt), desc(exercise.id))
    .all()
    .filter((r) => r.targets.includes(itemId) && r.hash)
    .slice(0, limit)
    .map((r) => r.hash!);
}

/** The oldest unused exercise of a mode for an item that it has not seen recently. */
export function nextExercise<M extends CachedMode>(
  db: DbOrTx,
  mode: M,
  itemId: number,
): Cached<M> | null {
  const recent = recentHashes(db, itemId, FRESHNESS_WINDOW, mode);
  const row = liveRows(db, mode)
    .filter((r) => r.usedAt === null && r.targetItemIds.includes(itemId))
    .filter((r) => !r.sentenceHash || isFresh(r.sentenceHash, recent))
    .sort((a, b) => a.createdAt - b.createdAt || a.id - b.id)[0];
  return row ? toCached<M>(row) : null;
}

export function nextGapExercise(db: DbOrTx, itemId: number): CachedGap | null {
  return nextExercise(db, 'gap_fill', itemId);
}

/** Unused exercises of a mode, waiting. */
export function unusedExercises<M extends CachedMode>(db: DbOrTx, mode: M): Cached<M>[] {
  return liveRows(db, mode)
    .filter((r) => r.usedAt === null)
    .map((r) => toCached<M>(r));
}

/** Unused exercises waiting per target item. */
export function coverage(db: DbOrTx, mode: CachedMode): Map<number, number> {
  const counts = new Map<number, number>();
  for (const row of unusedExercises(db, mode)) {
    for (const id of row.itemIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

export function gapCoverage(db: DbOrTx): Map<number, number> {
  return coverage(db, 'gap_fill');
}

export function markExerciseUsed(db: DbOrTx, id: number, now: number): void {
  db.update(exercise).set({ usedAt: now }).where(eq(exercise.id, id)).run();
  notifyChange('exercise');
}

/** The Bad sentence button: never show it again, and keep it for the prompt stats. */
export function discardExercise(db: DbOrTx, id: number, now: number): void {
  db.update(exercise)
    .set({ discarded: true, usedAt: sql`coalesce(${exercise.usedAt}, ${now})` })
    .where(eq(exercise.id, id))
    .run();
  notifyChange('exercise');
}

/** Drop unused exercises for items that left the deck or got suspended. */
export function pruneUnusedFor(db: DbOrTx, keep: (itemId: number) => boolean): number {
  const stale = db
    .select({ id: exercise.id, targets: exercise.targetItemIds })
    .from(exercise)
    .where(isNull(exercise.usedAt))
    .all()
    .filter((r) => !r.targets.every(keep));
  for (const row of stale) db.delete(exercise).where(eq(exercise.id, row.id)).run();
  if (stale.length) notifyChange('exercise');
  return stale.length;
}

export interface PromptStats {
  mode: ExerciseMode;
  promptVersion: string;
  ready: number;
  used: number;
  discarded: number;
}

/** Per prompt version: how much is waiting, used, and thrown out as bad. */
export function exerciseStats(db: DbOrTx): PromptStats[] {
  const rows = db
    .select({
      mode: exercise.mode,
      promptVersion: exercise.promptVersion,
      ready: sql<number>`sum(case when ${exercise.usedAt} is null and ${exercise.discarded} = 0 then 1 else 0 end)`,
      used: sql<number>`sum(case when ${exercise.usedAt} is not null and ${exercise.discarded} = 0 then 1 else 0 end)`,
      discarded: sql<number>`sum(case when ${exercise.discarded} = 1 then 1 else 0 end)`,
    })
    .from(exercise)
    .groupBy(exercise.mode, exercise.promptVersion)
    .orderBy(exercise.mode, exercise.promptVersion)
    .all();
  return rows.map((r) => ({
    ...r,
    ready: Number(r.ready),
    used: Number(r.used),
    discarded: Number(r.discarded),
  }));
}

export function getExercise(db: DbOrTx, id: number): Cached<CachedMode> | null {
  const row = db.select().from(exercise).where(eq(exercise.id, id)).get();
  return row ? toCached(row) : null;
}

function toCached<M extends CachedMode>(row: ExerciseRow): Cached<M> {
  return {
    id: row.id,
    itemId: row.targetItemIds[0],
    itemIds: row.targetItemIds,
    topic: row.topic,
    payload: row.payload as PayloadByMode[M],
  };
}

/** Unused sentences, for tests and the usage screen. */
export function unusedGapCount(db: DbOrTx): number {
  return db
    .select({ id: exercise.id })
    .from(exercise)
    .where(
      and(eq(exercise.mode, 'gap_fill'), isNull(exercise.usedAt), eq(exercise.discarded, false)),
    )
    .all().length;
}
