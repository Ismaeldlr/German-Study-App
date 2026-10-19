import { and, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm';

import { FRESHNESS_WINDOW, isFresh, type GapExercise } from '@/core/gap-fill';
import type { ExerciseMode } from '@/core/model';

import { notifyChange } from '../changes';
import type { DbOrTx } from '../db';
import { exercise, type ExerciseRow } from '../schema';

/**
 * The cache of generated content. Each row is used once; a card never gets
 * a sentence it saw within its last FRESHNESS_WINDOW exercises.
 */

export interface GapPayload extends GapExercise {
  cardId: number;
}

export interface CachedGap {
  id: number;
  itemId: number;
  topic: string | null;
  payload: GapPayload;
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
export function saveGapExercises(
  db: DbOrTx,
  rows: readonly NewGapRow[],
  info: GenerationInfo,
  now: number,
): void {
  if (rows.length === 0) return;
  const share = (tokens: number) => Math.round(tokens / rows.length);
  db.insert(exercise)
    .values(
      rows.map((row) => ({
        mode: 'gap_fill' as const,
        targetItemIds: [row.itemId],
        topic: row.topic,
        payload: { ...row.exercise, cardId: row.cardId } satisfies GapPayload,
        sentenceHash: row.hash,
        provider: info.provider,
        model: info.model,
        promptVersion: info.promptVersion,
        tokensIn: share(info.tokensIn),
        tokensOut: share(info.tokensOut),
        createdAt: now,
      })),
    )
    .run();
  notifyChange('exercise');
}

const gapRows = (db: DbOrTx) =>
  db
    .select()
    .from(exercise)
    .where(and(eq(exercise.mode, 'gap_fill'), eq(exercise.discarded, false)))
    .all();

const targetOf = (row: ExerciseRow) => row.targetItemIds[0];

/** Hashes of the sentences an item was shown, newest first. */
export function recentHashes(db: DbOrTx, itemId: number, limit = FRESHNESS_WINDOW): string[] {
  return db
    .select({ hash: exercise.sentenceHash, targets: exercise.targetItemIds })
    .from(exercise)
    .where(and(eq(exercise.mode, 'gap_fill'), isNotNull(exercise.usedAt)))
    .orderBy(desc(exercise.usedAt), desc(exercise.id))
    .all()
    .filter((r) => r.targets.includes(itemId) && r.hash)
    .slice(0, limit)
    .map((r) => r.hash!);
}

/** The oldest unused sentence for an item that it has not seen recently. */
export function nextGapExercise(db: DbOrTx, itemId: number): CachedGap | null {
  const recent = recentHashes(db, itemId);
  const row = gapRows(db)
    .filter((r) => r.usedAt === null && targetOf(r) === itemId)
    .filter((r) => !r.sentenceHash || isFresh(r.sentenceHash, recent))
    .sort((a, b) => a.createdAt - b.createdAt || a.id - b.id)[0];
  return row ? toCached(row) : null;
}

/** Unused, fresh sentences waiting per item. */
export function gapCoverage(db: DbOrTx): Map<number, number> {
  const counts = new Map<number, number>();
  for (const row of gapRows(db)) {
    if (row.usedAt !== null) continue;
    counts.set(targetOf(row), (counts.get(targetOf(row)) ?? 0) + 1);
  }
  return counts;
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

/** Drop unused sentences for items that left the deck or got suspended. */
export function pruneUnusedFor(db: DbOrTx, keep: (itemId: number) => boolean): number {
  const stale = gapRows(db).filter((r) => r.usedAt === null && !keep(targetOf(r)));
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

export function getExercise(db: DbOrTx, id: number): CachedGap | null {
  const row = db.select().from(exercise).where(eq(exercise.id, id)).get();
  return row ? toCached(row) : null;
}

function toCached(row: ExerciseRow): CachedGap {
  return {
    id: row.id,
    itemId: targetOf(row),
    topic: row.topic,
    payload: row.payload as GapPayload,
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
