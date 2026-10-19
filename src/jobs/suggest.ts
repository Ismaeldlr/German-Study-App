import { and, eq } from 'drizzle-orm';

import { draftFromRecord, withNounCheck } from '@/core/drafts';
import { startOfLocalDay } from '@/core/time';
import type { DbOrTx } from '@/data/db';
import { checkNounAgainstList } from '@/data/nouns';
import { getChapter } from '@/data/repos/chapters';
import { getAllSettings } from '@/data/repos/settings';
import { saveSuggestions, suggestedLemmas, type NewSuggestion } from '@/data/repos/suggestions';
import { card, item, suggestion } from '@/data/schema';
import { getLlmClient } from '@/features/llm-client';
import type { Services } from '@/features/services';
import type { LlmClient } from '@/llm/client';
import { suggestWords, type SuggestedWord } from '@/llm/tasks/suggest-words';
import { runTask } from '@/llm/tasks/task';

export const SUGGEST_COUNT = 8;
const KNOWN_LIMIT = 150;
const AVOID_LIMIT = 200;

/**
 * Ask for new words for the current chapter, or for a topic you give.
 * Candidates already in the deck or suggested before are dropped. Returns
 * how many new suggestions are waiting.
 */
export async function requestSuggestions(
  services: Services,
  options: { topic?: string | null; client?: LlmClient; signal?: AbortSignal } = {},
): Promise<number> {
  const { db } = services;
  const settings = getAllSettings(db);
  const chapterId = settings['study.currentChapterId'];
  const chapter = chapterId ? getChapter(db, chapterId) : undefined;
  const client = options.client ?? (await getLlmClient(services));
  const topic = options.topic?.trim() || null;

  const result = await runTask(
    client,
    suggestWords,
    {
      chapter: chapter ? { title: chapter.title, themes: chapter.themes } : null,
      topic: topic ?? (chapter ? null : (settings['study.interests'][0] ?? null)),
      known: knownLemmas(db, chapter?.id ?? null).slice(0, KNOWN_LIMIT),
      avoid: suggestedLemmas(db).slice(-AVOID_LIMIT),
      count: SUGGEST_COUNT,
    },
    { signal: options.signal, timeoutMs: 60_000 },
  );
  const candidates = result.output.items.map(toSuggestion);
  return saveSuggestions(db, candidates, chapter?.id ?? null, services.now().getTime());
}

/** The chapter's words first, then the rest of the deck, newest first. */
function knownLemmas(db: DbOrTx, chapterId: number | null): string[] {
  const rows = db.select({ lemma: item.lemma, chapterId: item.chapterId }).from(item).all();
  const inChapter = rows.filter((r) => chapterId !== null && r.chapterId === chapterId);
  const rest = rows.filter((r) => chapterId === null || r.chapterId !== chapterId).reverse();
  return [...inChapter, ...rest].map((r) => r.lemma);
}

function toSuggestion(word: SuggestedWord): NewSuggestion {
  const draft = draftFromRecord(
    { index: 0, raw: word.lemma, hints: {}, unclear: false },
    { ...word, status: 'ok', low_confidence: [], note: null },
  );
  const checked =
    draft.fields.kind === 'noun' ? withNounCheck(draft, checkNounAgainstList(draft.fields)) : draft;
  return { reason: word.reason.trim(), details: { fields: checked.fields, flags: checked.flags } };
}

/**
 * Suggest on its own only when it would help: today's new-item allowance
 * is unused, no new word is waiting, nothing is in the inbox, and it has
 * not already suggested today.
 */
export function shouldAutoSuggest(db: DbOrTx, now: Date, allowanceLeft: number): boolean {
  if (allowanceLeft <= 0) return false;
  if (!getAllSettings(db)['study.currentChapterId']) return false;
  const newWaiting = db
    .select({ id: card.id })
    .from(card)
    .innerJoin(item, eq(card.itemId, item.id))
    .where(and(eq(card.type, 'recognize'), eq(card.state, 0), eq(item.status, 'active')))
    .limit(1)
    .all().length;
  if (newWaiting) return false;
  const pendingOrToday = db
    .select({ status: suggestion.status, createdAt: suggestion.createdAt })
    .from(suggestion)
    .all()
    .some((s) => s.status === 'pending' || s.createdAt >= startOfLocalDay(now));
  return !pendingOrToday;
}
