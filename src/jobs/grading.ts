import { matchTarget, type TranslationGrade } from '@/core/translation';
import {
  applyGrade,
  getPendingGrade,
  recordGradeFailure,
  waitingGrades,
  type AppliedRating,
} from '@/data/repos/grading';
import { getLlmClient } from '@/features/llm-client';
import type { Services } from '@/features/services';
import type { LlmClient } from '@/llm/client';
import { describeLlmError, isLlmError, type LlmErrorKind } from '@/llm/errors';
import { gradeTranslation, type GradeTranslationOutput } from '@/llm/tasks/grade-translation';
import { runTask } from '@/llm/tasks/task';

/**
 * Grading translations. An answer is graded right away while you wait in
 * the session; if that takes too long, or the phone is offline, it waits in
 * the queue and is graded when the app is next online.
 */

/** Replies that cannot be used: these count towards giving up on an answer. */
const UNUSABLE: ReadonlySet<LlmErrorKind> = new Set([
  'invalid_output',
  'bad_response',
  'bad_request',
]);

export type GradeOutcome =
  | { status: 'graded'; grade: TranslationGrade; ratings: AppliedRating[] }
  | { status: 'waiting'; reason: string; kind: LlmErrorKind | null }
  | { status: 'failed'; reason: string };

const inFlight = new Map<number, Promise<GradeOutcome>>();

/** Grade one waiting answer, or join the attempt already running. Never throws. */
export function gradeAnswer(
  services: Services,
  id: number,
  options: { client?: LlmClient; signal?: AbortSignal } = {},
): Promise<GradeOutcome> {
  let running = inFlight.get(id);
  if (!running) {
    running = grade(services, id, options).finally(() => inFlight.delete(id));
    inFlight.set(id, running);
  }
  return running;
}

async function grade(
  services: Services,
  id: number,
  options: { client?: LlmClient; signal?: AbortSignal },
): Promise<GradeOutcome> {
  const { db } = services;
  const row = getPendingGrade(db, id);
  if (!row) return { status: 'failed', reason: 'This answer is gone.' };
  if (row.status === 'graded' && row.result) {
    return { status: 'graded', grade: row.result, ratings: [] };
  }
  if (row.status === 'failed') return { status: 'failed', reason: row.lastError ?? 'Not graded.' };

  try {
    const client = options.client ?? (await getLlmClient(services));
    const { exercise } = row;
    const result = await runTask(
      client,
      gradeTranslation,
      {
        english: exercise.english,
        reference: exercise.reference,
        answer: row.answer,
        targets: exercise.targets.map((t) => ({ word: t.word, meaning: t.meaning })),
        grammar: exercise.grammar,
      },
      { signal: options.signal, timeoutMs: 30_000 },
    );
    const grade = toGrade(row.exercise.targets, result.output);
    const ratings = applyGrade(db, id, grade, services.now().getTime());
    return { status: 'graded', grade, ratings };
  } catch (error) {
    const kind = isLlmError(error) ? error.kind : null;
    const reason = describeLlmError(error);
    const status = recordGradeFailure(db, id, reason, kind !== null && UNUSABLE.has(kind));
    return status === 'failed' ? { status: 'failed', reason } : { status: 'waiting', reason, kind };
  }
}

/** The LLM's grade, tied back to the exercise's cards. A target it left out was not used. */
export function toGrade(
  targets: readonly { cardId: number; itemId: number; word: string }[],
  output: GradeTranslationOutput,
): TranslationGrade {
  return {
    verdict: output.verdict,
    targets: targets.map((t) => ({
      cardId: t.cardId,
      itemId: t.itemId,
      word: t.word,
      verdict: matchTarget(output.targets, t.word)?.verdict ?? 'missing',
    })),
    errors: output.errors
      .map((e) => ({
        category: e.category,
        text: e.text.trim(),
        correction: e.correction.trim(),
        explanation: e.explanation.trim(),
        word: e.word?.trim() || null,
      }))
      .filter((e) => e.text || e.correction),
    corrected: output.corrected.trim(),
    natural: output.natural.trim(),
    explanation: output.explanation.trim(),
  };
}

export interface GradingReport {
  graded: number;
  /** Why an answer could not be graded, in words. */
  stoppedBy: string | null;
  /** Whether that reason (offline, no key, budget) would stop every other call too. */
  fatal: boolean;
}

/** Grade waiting answers, oldest first. Stops at the first error that would fail the rest too. */
export async function gradeWaiting(
  services: Services,
  options: { client?: LlmClient; signal?: AbortSignal; max?: number } = {},
): Promise<GradingReport> {
  const report: GradingReport = { graded: 0, stoppedBy: null, fatal: false };
  for (const row of waitingGrades(services.db).slice(0, options.max ?? 10)) {
    const outcome = await gradeAnswer(services, row.id, options);
    if (outcome.status === 'graded') report.graded++;
    else if (outcome.status === 'waiting') {
      report.stoppedBy = outcome.reason;
      if (outcome.kind === null || !UNUSABLE.has(outcome.kind)) {
        report.fatal = true;
        return report;
      }
    }
  }
  return report;
}
