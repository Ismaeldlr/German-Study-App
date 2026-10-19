import { create } from 'zustand';

import { gapProblem, sentenceHash, type GapExercise } from '@/core/gap-fill';
import { batches } from '@/core/parse-list';
import { buildGapBundles, type GapBundle } from '@/core/selector';
import { createTopicPicker } from '@/core/topics';
import type { DbOrTx } from '@/data/db';
import { getChapter } from '@/data/repos/chapters';
import {
  pruneUnusedFor,
  recentHashes,
  saveGapExercises,
  type NewGapRow,
} from '@/data/repos/exercises';
import { allLemmas } from '@/data/repos/items';
import { gapTargets, supportPool } from '@/data/repos/practice';
import { getAllSettings } from '@/data/repos/settings';
import { dailyAllowance, newItemsIntroducedToday } from '@/data/repos/study';
import { getLlmClient } from '@/features/llm-client';
import type { Services } from '@/features/services';
import { describeLlmError, isLlmError, type LlmErrorKind } from '@/llm/errors';
import { genGapBatch, type GenGapItem } from '@/llm/tasks/gen-gap-batch';
import { runTask } from '@/llm/tasks/task';

import { requestSuggestions, shouldAutoSuggest } from './suggest';

/**
 * Tops up the exercise cache while online: gap sentences for cards due
 * today or tomorrow and for at-risk cards, ten per call. Over the budget
 * cap, without a key or offline, it stops and the app keeps working from
 * the cache and classic cards.
 */

export const GAP_BATCH_SIZE = 10;
/** At most this many calls per run, so one run stays cheap. */
export const MAX_GAP_BATCHES = 3;

/** Failures that only spoil one batch; anything else ends the run. */
const BATCH_ONLY: ReadonlySet<LlmErrorKind> = new Set(['invalid_output', 'bad_response']);

export interface PrefetchReport {
  at: number;
  generated: number;
  rejected: number;
  suggestions: number;
  /** Why the run stopped early, in words for the usage screen. */
  stoppedBy: string | null;
}

export const usePrefetchStore = create<{ running: boolean; last: PrefetchReport | null }>(() => ({
  running: false,
  last: null,
}));

let inFlight: Promise<PrefetchReport> | null = null;

/** Run the prefetch, or join the run already going. Never throws. */
export function runPrefetch(
  services: Services,
  options: { maxBatches?: number; signal?: AbortSignal } = {},
): Promise<PrefetchReport> {
  inFlight ??= prefetch(services, options).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function prefetch(
  services: Services,
  { maxBatches = MAX_GAP_BATCHES, signal }: { maxBatches?: number; signal?: AbortSignal },
): Promise<PrefetchReport> {
  const { db } = services;
  const now = services.now();
  const report: PrefetchReport = {
    at: now.getTime(),
    generated: 0,
    rejected: 0,
    suggestions: 0,
    stoppedBy: null,
  };
  usePrefetchStore.setState({ running: true });
  try {
    const deck = new Set(allLemmas(db).map((l) => l.id));
    pruneUnusedFor(db, (itemId) => deck.has(itemId));

    let client;
    try {
      client = await getLlmClient(services);
    } catch (error) {
      report.stoppedBy = describeLlmError(error);
      return report;
    }

    const targets = gapTargets(db, now).slice(0, maxBatches * GAP_BATCH_SIZE);
    const bundles = buildGapBundles(targets, supportPool(db, now), topicPicker(db));
    for (const group of batches(bundles, GAP_BATCH_SIZE)) {
      try {
        const result = await runTask(
          client,
          genGapBatch,
          { bundles: group.map(toInput) },
          { signal, timeoutMs: 90_000 },
        );
        const { rows, rejected } = acceptGapItems(db, group, result.output.items);
        saveGapExercises(
          db,
          rows,
          {
            provider: client.providerId,
            model: result.model,
            promptVersion: result.promptVersion,
            tokensIn: result.usage.inputTokens,
            tokensOut: result.usage.outputTokens,
          },
          services.now().getTime(),
        );
        report.generated += rows.length;
        report.rejected += rejected;
      } catch (error) {
        report.stoppedBy = describeLlmError(error);
        if (!isLlmError(error) || !BATCH_ONLY.has(error.kind)) return report;
      }
    }

    const allowanceLeft = dailyAllowance(db, now) - newItemsIntroducedToday(db, now);
    if (shouldAutoSuggest(db, now, allowanceLeft)) {
      try {
        report.suggestions = await requestSuggestions(services, { client, signal });
      } catch (error) {
        report.stoppedBy = describeLlmError(error);
      }
    }
    return report;
  } finally {
    usePrefetchStore.setState({ running: false, last: report });
  }
}

function topicPicker(db: DbOrTx) {
  const settings = getAllSettings(db);
  const chapterId = settings['study.currentChapterId'];
  const chapter = chapterId ? getChapter(db, chapterId) : undefined;
  return createTopicPicker({
    chapterThemes: chapter?.themes ?? [],
    interests: settings['study.interests'],
  });
}

function toInput(bundle: GapBundle) {
  return {
    id: bundle.id,
    word: bundle.target.word,
    type: bundle.target.forms.kind,
    meaning: bundle.target.meanings.slice(0, 2).join(', '),
    support: bundle.support,
    topic: bundle.topic,
  };
}

/**
 * Keep the sentences that use their target and are new to its card. The
 * rest are dropped, and their cards get another try on the next run.
 */
export function acceptGapItems(
  db: DbOrTx,
  bundles: readonly GapBundle[],
  items: readonly GenGapItem[],
): { rows: NewGapRow[]; rejected: number } {
  const rows: NewGapRow[] = [];
  let rejected = 0;
  for (const bundle of bundles) {
    const raw = items.find((i) => i.id === bundle.id);
    if (!raw) {
      rejected++;
      continue;
    }
    const exercise: GapExercise = {
      sentence: raw.sentence.trim(),
      answer: raw.answer.trim(),
      accepted: raw.accepted.map((a) => a.trim()).filter(Boolean),
      cue: raw.cue.trim(),
      translation: raw.translation.trim(),
      glosses: raw.glosses.filter((g) => g.de.trim() && g.en.trim()),
    };
    const hash = sentenceHash(exercise.sentence);
    const seen = [
      ...recentHashes(db, bundle.target.itemId),
      ...rows.filter((r) => r.itemId === bundle.target.itemId).map((r) => r.hash),
    ];
    if (gapProblem(exercise, bundle.target.forms) || seen.includes(hash)) {
      rejected++;
      continue;
    }
    rows.push({
      cardId: bundle.target.cardId,
      itemId: bundle.target.itemId,
      topic: bundle.topic,
      exercise,
      hash,
    });
  }
  return { rows, rejected };
}
