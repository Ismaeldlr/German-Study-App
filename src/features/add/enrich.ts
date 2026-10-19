import {
  draftFromRecord,
  failedDraft,
  withDuplicate,
  withNounCheck,
  type Draft,
  type DraftFields,
} from '@/core/drafts';
import { displayLemma } from '@/core/cards';
import { findDuplicates, lemmaKey } from '@/core/duplicates';
import { batches, parseLine, parseVocabularyList, type ParsedLine } from '@/core/parse-list';
import type { Db } from '@/data/db';
import { checkNounAgainstList } from '@/data/nouns';
import { allLemmas, type ItemInput } from '@/data/repos/items';
import { describeLlmError, isLlmError, type LlmErrorKind } from '@/llm/errors';
import { enrichWords } from '@/llm/tasks/enrich-words';
import { runTask } from '@/llm/tasks/task';

import { getLlmClient } from '../llm-client';
import type { Services } from '../services';

/** Errors that make the remaining batches pointless too. */
const FATAL: ReadonlySet<LlmErrorKind> = new Set([
  'no_key',
  'not_configured',
  'budget',
  'auth',
  'aborted',
]);

export interface EnrichProgress {
  done: number;
  total: number;
}

/**
 * Send lines to the LLM in batches of about 25 and turn the records into
 * drafts. A failed batch leaves its lines as editable failed rows; a
 * missing key, a spent budget or a rejected key stops the whole run.
 */
export async function enrichLines(
  services: Services,
  lines: readonly ParsedLine[],
  options: { signal?: AbortSignal; onProgress?: (p: EnrichProgress) => void } = {},
): Promise<Draft[]> {
  const toSend = lines.filter((l) => !l.heading);
  const drafts: Draft[] = lines
    .filter((l) => l.heading)
    .map((l) => ({ ...failedDraft(l, l.reason ?? 'Skipped'), status: 'unclear' as const }));

  if (toSend.length) {
    const client = await getLlmClient(services);
    const groups = batches(toSend, 25);
    let done = 0;
    options.onProgress?.({ done, total: toSend.length });
    for (const group of groups) {
      try {
        const result = await runTask(
          client,
          enrichWords,
          { lines: group.map((l) => ({ id: l.index, text: l.raw })) },
          { signal: options.signal, timeoutMs: 60_000 },
        );
        const byId = new Map(result.output.items.map((r) => [r.id, r]));
        for (const line of group) drafts.push(draftFromRecord(line, byId.get(line.index)!));
      } catch (error) {
        if (isLlmError(error) && FATAL.has(error.kind)) throw error;
        const reason = `The LLM could not fill this in: ${describeLlmError(error)}`;
        for (const line of group) drafts.push(failedDraft(line, reason));
      }
      done += group.length;
      options.onProgress?.({ done, total: toSend.length });
    }
  }

  drafts.sort((a, b) => a.lineIndex - b.lineIndex);
  return annotateDrafts(services.db, drafts);
}

export async function enrichText(
  services: Services,
  text: string,
  options: { signal?: AbortSignal; onProgress?: (p: EnrichProgress) => void } = {},
): Promise<Draft[]> {
  return enrichLines(services, parseVocabularyList(text), options);
}

export async function enrichOne(
  services: Services,
  word: string,
  signal?: AbortSignal,
): Promise<Draft> {
  const [draft] = await enrichLines(services, [parseLine(word.trim(), 0)], { signal });
  return draft;
}

/**
 * Flag duplicates (against the deck and within the batch) and check nouns
 * against the offline Wiktionary list.
 */
export function annotateDrafts(db: Db, drafts: readonly Draft[]): Draft[] {
  const deck = allLemmas(db).map((l) => ({ ...l, lemma: l.lemma, label: displayLemma(l) }));
  const seen = new Map<string, number>();
  return drafts.map((draft) => {
    let annotated = annotate(draft, deck);
    const key = lemmaKey(draft.fields.lemma);
    if (key && draft.status !== 'unclear') {
      const earlier = seen.get(key);
      if (earlier !== undefined) {
        annotated = {
          ...annotated,
          include: false,
          flags: [
            ...annotated.flags,
            { field: 'duplicate', tone: 'warning', message: `Same word as line ${earlier + 1}.` },
          ],
        };
      } else {
        seen.set(key, draft.lineIndex);
      }
    }
    return annotated;
  });
}

/** Re-run the deck and noun checks after you edit a draft by hand. */
export function refreshDraft(db: Db, draft: Draft, fields: DraftFields): Draft {
  const deck = allLemmas(db).map((l) => ({ ...l, label: displayLemma(l) }));
  const kept = draft.flags.filter(
    (f) =>
      f.field !== 'duplicate' &&
      !(f.field === 'article' && f.message.startsWith('Wiktionary')) &&
      !(f.field === 'plural' && /Wiktionary/.test(f.message)),
  );
  return annotate({ ...draft, fields, flags: kept, duplicateOf: undefined }, deck);
}

function annotate(draft: Draft, deck: { id: number; lemma: string; label: string }[]): Draft {
  const { exact, near } = findDuplicates(draft.fields.lemma, deck);
  const duplicate = exact[0] ? { id: exact[0].id, lemma: exact[0].label } : undefined;
  let next = withDuplicate(
    draft,
    duplicate,
    near.slice(0, 2).map((n) => n.label),
  );
  if (next.fields.kind === 'noun' && next.fields.lemma) {
    next = withNounCheck(next, checkNounAgainstList(next.fields));
  }
  return next;
}

export function draftToItemInput(
  fields: DraftFields,
  options: { chapterId: number | null; note?: string | null },
): ItemInput {
  return {
    ...fields,
    chapterId: options.chapterId,
    tags: [],
    source: 'user',
    notes: options.note ?? null,
  };
}
