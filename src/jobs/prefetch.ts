import { and, asc, eq, ne } from 'drizzle-orm';
import { create } from 'zustand';

import { displayLemma } from '@/core/cards';
import {
  CONTRAST_SIZE,
  drillProblem,
  DRILL_SIZE,
  type ContrastItem,
  type ContrastSet,
  type DrillItem,
} from '@/core/drills';
import { lemmaKey } from '@/core/duplicates';
import { gapProblem, glossKey, isFresh, sentenceHash, type GapExercise } from '@/core/gap-fill';
import { isFormOf } from '@/core/inflection';
import { batches } from '@/core/parse-list';
import { buildGapBundles, type GapBundle, type GapTarget } from '@/core/selector';
import {
  STORY_MAX_QUESTIONS,
  STORY_MAX_WORDS,
  STORY_MIN_QUESTIONS,
  STORY_MIN_TARGETS,
  STORY_MIN_WORDS,
  textKeys,
  wordCount,
  type StoryExercise,
  type StoryQuestion,
} from '@/core/story';
import { startOfLocalDay } from '@/core/time';
import { createTopicPicker } from '@/core/topics';
import { translationProblem, type TranslationExercise } from '@/core/translation';
import type { DbOrTx } from '@/data/db';
import { getChapter } from '@/data/repos/chapters';
import {
  nextStory,
  pruneUnusedFor,
  recentHashes,
  saveExercises,
  saveGapExercises,
  unusedExercises,
  writtenSince,
  type GenerationInfo,
  type NewExerciseRow,
  type NewGapRow,
} from '@/data/repos/exercises';
import { allLemmas, getItem } from '@/data/repos/items';
import {
  confusedPairsInDeck,
  confusedWithIds,
  listLeeches,
  setMemoryHook,
  wrongAnswersFor,
} from '@/data/repos/leeches';
import {
  drillTargets,
  gapTargets,
  supportPool,
  translationTargets,
  storyCandidates,
  type DrillTarget,
  type StoryCandidate,
} from '@/data/repos/practice';
import { getAllSettings } from '@/data/repos/settings';
import { dailyAllowance, newItemsIntroducedToday } from '@/data/repos/study';
import { card, item, type ItemRow } from '@/data/schema';
import { getLlmClient } from '@/features/llm-client';
import type { Services } from '@/features/services';
import type { LlmClient } from '@/llm/client';
import { describeLlmError, isLlmError, type LlmErrorKind } from '@/llm/errors';
import { genContrast } from '@/llm/tasks/gen-contrast';
import { genGapBatch, type GenGapItem } from '@/llm/tasks/gen-gap-batch';
import { genGrammarDrill, type GenDrillOutput } from '@/llm/tasks/gen-grammar-drill';
import { genTranslation, type GenTranslationItem } from '@/llm/tasks/gen-translation';
import { genStory, type GenStoryOutput } from '@/llm/tasks/gen-story';
import { leechHelp } from '@/llm/tasks/leech-help';
import { runTask, type LlmTask, type TaskResult } from '@/llm/tasks/task';

import { gradeWaiting } from './grading';
import { requestSuggestions, shouldAutoSuggest } from './suggest';

/**
 * Tops up the exercise cache while online. First it grades translations
 * waiting in the queue; then it writes gap sentences for cards due today
 * or tomorrow and for at-risk cards, translations for mature cards, drills
 * for grammar points, contrast sets for words you mix up, memory hooks
 * for leeches, and one mini story a day. Over the budget cap, without a key
 * or offline, it stops and the app keeps working from the cache and classic
 * cards.
 */

export const GAP_BATCH_SIZE = 10;
/** At most this many calls per run, so one run stays cheap. */
export const MAX_GAP_BATCHES = 3;
/** Translations per run, in one call. Each covers one or two words. */
export const TRANSLATION_BATCH = 4;
export const MAX_DRILLS = 2;
export const MAX_CONTRASTS = 1;
export const MAX_LEECH_HELP = 1;

/** Failures that only spoil one call; anything else ends the run. */
const BATCH_ONLY: ReadonlySet<LlmErrorKind> = new Set(['invalid_output', 'bad_response']);

export interface PrefetchReport {
  at: number;
  /** New gap sentences. */
  generated: number;
  rejected: number;
  translations: number;
  drills: number;
  contrasts: number;
  hooks: number;
  stories: number;
  graded: number;
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

/** Thrown inside a run to end it; the report already says why. */
class StopRun extends Error {}

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
    translations: 0,
    drills: 0,
    contrasts: 0,
    hooks: 0,
    stories: 0,
    graded: 0,
    suggestions: 0,
    stoppedBy: null,
  };
  usePrefetchStore.setState({ running: true });

  /** Run one call; a failure that would spoil the rest too ends the run. */
  const attempt = async (call: () => Promise<void>) => {
    try {
      await call();
    } catch (error) {
      if (error instanceof StopRun) throw error;
      report.stoppedBy = describeLlmError(error);
      if (!isLlmError(error) || !BATCH_ONLY.has(error.kind)) throw new StopRun();
    }
  };

  try {
    const deck = new Set(allLemmas(db).map((l) => l.id));
    pruneUnusedFor(db, (itemId) => deck.has(itemId));

    let client: LlmClient;
    try {
      client = await getLlmClient(services);
    } catch (error) {
      report.stoppedBy = describeLlmError(error);
      return report;
    }
    const context: RunContext = { services, client, signal, topic: topicPicker(db) };

    const grading = await gradeWaiting(services, { client, signal });
    report.graded = grading.graded;
    report.stoppedBy = grading.stoppedBy;
    if (grading.fatal) return report;

    const targets = gapTargets(db, now).slice(0, maxBatches * GAP_BATCH_SIZE);
    const bundles = buildGapBundles(targets, supportPool(db, now), context.topic);
    for (const group of batches(bundles, GAP_BATCH_SIZE)) {
      await attempt(async () => {
        const result = await run(context, genGapBatch, { bundles: group.map(toInput) }, 90_000);
        const { rows, rejected } = acceptGapItems(db, group, result.output.items);
        saveGapExercises(db, rows, info(context, result), services.now().getTime());
        report.generated += rows.length;
        report.rejected += rejected;
      });
    }

    await attempt(async () => {
      const made = await writeTranslations(context, now);
      report.translations += made.saved;
      report.rejected += made.rejected;
    });

    for (const target of drillTargets(db, now).slice(0, MAX_DRILLS)) {
      await attempt(async () => {
        if (await writeDrill(context, target, now)) report.drills++;
        else report.rejected++;
      });
    }

    for (const words of contrastNeeds(db).slice(0, MAX_CONTRASTS)) {
      await attempt(async () => {
        if (await writeContrast(context, words)) report.contrasts++;
        else report.rejected++;
      });
    }

    const leeches = listLeeches(db).filter((l) => !l.item.memoryHook && l.item.kind !== 'grammar');
    for (const leech of leeches.slice(0, MAX_LEECH_HELP)) {
      await attempt(async () => {
        const made = await helpLeech(context, leech.item);
        report.hooks++;
        if (made) report.contrasts++;
      });
    }

    if (needsStory(db, now)) {
      await attempt(async () => {
        if (await writeStory(context, now)) report.stories++;
        else report.rejected++;
      });
    }

    const allowanceLeft = dailyAllowance(db, now) - newItemsIntroducedToday(db, now);
    if (shouldAutoSuggest(db, now, allowanceLeft)) {
      await attempt(async () => {
        report.suggestions = await requestSuggestions(services, { client, signal });
      });
    }
    return report;
  } catch (error) {
    if (error instanceof StopRun) return report;
    report.stoppedBy = describeLlmError(error);
    return report;
  } finally {
    usePrefetchStore.setState({ running: false, last: report });
  }
}

interface RunContext {
  services: Services;
  client: LlmClient;
  signal?: AbortSignal;
  topic: () => string;
}

function run<I, O>(
  context: RunContext,
  task: LlmTask<I, O>,
  input: I,
  timeoutMs = 60_000,
): Promise<TaskResult<O>> {
  return runTask(context.client, task, input, { signal: context.signal, timeoutMs });
}

function info(context: RunContext, result: TaskResult<unknown>): GenerationInfo {
  return {
    provider: context.client.providerId,
    model: result.model,
    promptVersion: result.promptVersion,
    tokensIn: result.usage.inputTokens,
    tokensOut: result.usage.outputTokens,
  };
}

/** Topics from the current chapter's themes and your interests, never the same twice in a row. */
export function topicPicker(db: DbOrTx) {
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

/** Pair mature cards up, so one sentence practises two words. */
export function pairTargets<T>(targets: readonly T[], max: number): T[][] {
  return batches(targets.slice(0, max * 2), 2);
}

async function writeTranslations(context: RunContext, now: Date) {
  const { db } = context.services;
  const groups = pairTargets(translationTargets(db, now), TRANSLATION_BATCH);
  if (groups.length === 0) return { saved: 0, rejected: 0 };
  const grammar = grammarPool(db);
  const bundles = groups.map((targets, i) => ({
    id: i + 1,
    targets,
    grammar: grammar[i] ?? null,
    topic: context.topic(),
  }));
  const result = await run(context, genTranslation, {
    items: bundles.map((b) => ({
      id: b.id,
      targets: b.targets.map((t) => ({
        word: t.word,
        type: t.forms.kind,
        meaning: t.meanings.slice(0, 2).join(', '),
      })),
      grammar: b.grammar,
      topic: b.topic,
    })),
  });
  const { rows, rejected } = acceptTranslations(db, bundles, result.output.items);
  saveExercises(db, 'translation', rows, info(context, result), context.services.now().getTime());
  return { saved: rows.length, rejected };
}

/** Keep translations whose reference uses every target and that are new to their words. */
export function acceptTranslations(
  db: DbOrTx,
  bundles: readonly { id: number; targets: GapTarget[]; grammar: string | null; topic: string }[],
  items: readonly GenTranslationItem[],
): { rows: NewExerciseRow<'translation'>[]; rejected: number } {
  const rows: NewExerciseRow<'translation'>[] = [];
  let rejected = 0;
  for (const bundle of bundles) {
    const raw = items.find((i) => i.id === bundle.id);
    const exercise: TranslationExercise | null = raw
      ? {
          english: raw.english.trim(),
          reference: raw.reference.trim(),
          cues: bundle.targets.map((t, i) => raw.cues[i]?.trim() || t.meanings[0] || t.word),
          targets: bundle.targets.map((t) => ({
            cardId: t.cardId,
            itemId: t.itemId,
            word: t.word,
            meaning: t.meanings.slice(0, 2).join(', '),
          })),
          grammar: bundle.grammar,
        }
      : null;
    const hash = exercise ? sentenceHash(exercise.english) : '';
    const fresh = bundle.targets.every((t) =>
      isFresh(hash, recentHashes(db, t.itemId, undefined, 'translation')),
    );
    if (
      !exercise ||
      translationProblem(
        exercise,
        bundle.targets.map((t) => t.forms),
      ) ||
      !fresh
    ) {
      rejected++;
      continue;
    }
    rows.push({
      itemIds: bundle.targets.map((t) => t.itemId),
      topic: bundle.topic,
      payload: exercise,
      hash,
    });
  }
  return { rows, rejected };
}

/** Grammar points you have met, for translations to practise: soonest due first. */
function grammarPool(db: DbOrTx): string[] {
  return db
    .select({ lemma: item.lemma })
    .from(card)
    .innerJoin(item, eq(card.itemId, item.id))
    .where(
      and(
        eq(card.type, 'apply_grammar'),
        ne(card.state, 0),
        eq(card.suspended, false),
        eq(item.status, 'active'),
      ),
    )
    .orderBy(asc(card.due))
    .all()
    .map((r) => r.lemma);
}

async function writeDrill(context: RunContext, target: DrillTarget, now: Date): Promise<boolean> {
  const { db } = context.services;
  const known = supportPool(db, now).map((w) => w.word);
  const topic = context.topic();
  const result = await run(context, genGrammarDrill, {
    point: target.point,
    summary: target.summary,
    examples: target.examples,
    categories: target.categories,
    known: (known.length ? known : allLemmas(db).map((l) => l.lemma)).slice(0, 40),
    topic,
  });
  const row = acceptDrill(db, target, result.output, topic);
  if (!row) return false;
  saveExercises(
    db,
    'grammar_drill',
    [row],
    info(context, result),
    context.services.now().getTime(),
  );
  return true;
}

/** A drill is kept when it has enough well-formed items and is new to its grammar point. */
export function acceptDrill(
  db: DbOrTx,
  target: Pick<DrillTarget, 'itemId' | 'point' | 'categories'>,
  output: GenDrillOutput,
  topic: string,
): NewExerciseRow<'grammar_drill'> | null {
  const items: DrillItem[] = output.items.slice(0, DRILL_SIZE).map((i) => ({
    sentence: i.sentence.trim(),
    hint: i.hint.trim(),
    answer: i.answer.trim(),
    accepted: i.accepted.map((a) => a.trim()).filter(Boolean),
    translation: i.translation.trim(),
    explanation: i.explanation.trim(),
    category: i.category,
  }));
  const hash = sentenceHash(items.map((i) => i.sentence).join(' '));
  const recent = recentHashes(db, target.itemId, undefined, 'grammar_drill');
  if (drillProblem(items, DRILL_SIZE) || !isFresh(hash, recent)) return null;
  return {
    itemIds: [target.itemId],
    topic,
    payload: { point: target.point, items },
    hash,
  };
}

interface ContrastCandidate {
  item: ItemRow | null;
  cardId: number | null;
  word: string;
  meaning: string;
}

/** Confused pairs with no contrast set waiting. */
function contrastNeeds(db: DbOrTx): ContrastCandidate[][] {
  const waiting = unusedExercises(db, 'contrast').map((e) => e.itemIds);
  return confusedPairsInDeck(db)
    .filter((p) => !waiting.some((ids) => p.itemIds.every((id) => ids.includes(id))))
    .map((p) => p.itemIds.map((id) => deckCandidate(db, getItem(db, id)!)));
}

function deckCandidate(db: DbOrTx, row: ItemRow): ContrastCandidate {
  const produce = db
    .select({ id: card.id })
    .from(card)
    .where(and(eq(card.itemId, row.id), eq(card.type, 'produce'), eq(card.suspended, false)))
    .get();
  return {
    item: row,
    cardId: produce?.id ?? null,
    word: displayLemma(row),
    meaning: row.meanings.slice(0, 2).join(', '),
  };
}

async function writeContrast(context: RunContext, words: ContrastCandidate[]): Promise<boolean> {
  const { db } = context.services;
  const topic = context.topic();
  const mixups = words.flatMap((w) => (w.item ? wrongAnswersFor(db, w.item.id, 3) : []));
  const result = await run(context, genContrast, {
    words: words.map((w) => ({ word: w.word, type: w.item?.kind ?? 'phrase', meaning: w.meaning })),
    topic,
    mixups,
  });
  const set = acceptContrast(words, result.output);
  if (!set) return false;
  const itemIds = words.flatMap((w) => (w.item ? [w.item.id] : []));
  saveExercises(
    db,
    'contrast',
    [
      {
        itemIds,
        topic,
        payload: set,
        hash: sentenceHash(set.items.map((i) => i.sentence).join(' ')),
      },
    ],
    info(context, result),
    context.services.now().getTime(),
  );
  return true;
}

/**
 * Keep the items whose answer is a form of their word (for deck words), and
 * the set when each word still has two items.
 */
export function acceptContrast(
  words: readonly ContrastCandidate[],
  output: { explanation: string; items: Omit<ContrastItem, 'category'>[] },
): ContrastSet | null {
  const items: ContrastItem[] = output.items
    .filter((i) => i.word >= 0 && i.word < words.length)
    .filter((i) => {
      const source = words[i.word].item;
      return !source || isFormOf(i.answer, source);
    })
    .map((i) => ({
      word: i.word,
      sentence: i.sentence.trim(),
      hint: i.hint.trim(),
      answer: i.answer.trim(),
      accepted: i.accepted.map((a) => a.trim()).filter(Boolean),
      translation: i.translation.trim(),
      explanation: i.explanation.trim(),
      category: 'wrong_word' as const,
    }))
    .slice(0, CONTRAST_SIZE);
  if (drillProblem(items, CONTRAST_SIZE - 2)) return null;
  if (words.some((_, w) => items.filter((i) => i.word === w).length < 2)) return null;
  return {
    words: words.map((w) => ({
      itemId: w.item?.id ?? null,
      cardId: w.cardId,
      word: w.word,
      meaning: w.meaning,
    })),
    explanation: output.explanation.trim(),
    items,
  };
}

/**
 * A memory hook for a leech, and a contrast set with the word it gets
 * confused with: the one your answers show, or the one the LLM names.
 * Returns whether a contrast set was saved.
 */
async function helpLeech(context: RunContext, leech: ItemRow): Promise<boolean> {
  const { db } = context.services;
  const confusedId = confusedWithIds(db, leech.id)[0];
  const confused = confusedId ? getItem(db, confusedId) : undefined;
  const result = await run(context, leechHelp, {
    word: displayLemma(leech),
    type: leech.kind,
    meanings: leech.meanings,
    forms: formsLine(leech),
    wrongAnswers: wrongAnswersFor(db, leech.id),
    confusedWith: confused ? displayLemma(confused) : null,
  });
  setMemoryHook(db, leech.id, result.output.hook, context.services.now().getTime());

  const partner = result.output.partner;
  if (!partner && !confused) return false;
  // A contrast set for this word is already waiting.
  if (unusedExercises(db, 'contrast').some((e) => e.itemIds.includes(leech.id))) return false;
  const inDeck =
    confused ??
    db
      .select()
      .from(item)
      .where(eq(item.status, 'active'))
      .all()
      .find(
        (row) => row.id !== leech.id && lemmaKey(displayLemma(row)) === lemmaKey(partner!.word),
      );
  const other: ContrastCandidate = inDeck
    ? deckCandidate(db, inDeck)
    : { item: null, cardId: null, word: partner!.word.trim(), meaning: partner!.meaning.trim() };
  return writeContrast(context, [deckCandidate(db, leech), other]);
}

function formsLine(row: ItemRow): string | null {
  if (row.kind === 'noun' && row.article) {
    return row.plural
      ? `${row.article} ${row.lemma}, Pl. die ${row.plural}`
      : `${row.article} ${row.lemma}`;
  }
  if (row.kind === 'verb' && row.verbParticiple) {
    const aux = row.verbAuxiliary === 'sein' ? 'ist' : 'hat';
    return `${row.verbPresent3}, ${row.verbPreterite}, ${aux} ${row.verbParticiple}`;
  }
  return null;
}

/**
 * One story a day: write one when none is waiting, none was written today,
 * and enough of your words are in review to build it around.
 */
export function needsStory(db: DbOrTx, now: Date): boolean {
  return (
    !nextStory(db) &&
    writtenSince(db, 'story', startOfLocalDay(now)) === 0 &&
    storyCandidates(db, now).length >= STORY_MIN_TARGETS
  );
}

/** Write a story right away, for the Practice section. Throws an LlmError when it cannot. */
export async function writeStoryNow(services: Services, signal?: AbortSignal): Promise<boolean> {
  const client = await getLlmClient(services);
  const context: RunContext = { services, client, signal, topic: topicPicker(services.db) };
  return writeStory(context, services.now());
}

async function writeStory(context: RunContext, now: Date): Promise<boolean> {
  const { db } = context.services;
  const candidates = storyCandidates(db, now);
  if (candidates.length < STORY_MIN_TARGETS) return false;
  const chosen = new Set(candidates.map((c) => c.itemId));
  const known = supportPool(db, now)
    .filter((w) => !chosen.has(w.itemId))
    .map((w) => w.word)
    .slice(0, 30);
  const topic = context.topic();
  const result = await run(
    context,
    genStory,
    {
      targets: candidates.map((c, i) => ({
        id: i + 1,
        word: c.word,
        type: c.kind,
        meaning: c.meaning,
      })),
      topic,
      known,
    },
    90_000,
  );
  const story = acceptStory(candidates, result.output);
  if (!story) return false;
  saveExercises(
    db,
    'story',
    [
      {
        itemIds: story.targets.map((t) => t.itemId),
        topic,
        payload: story,
        hash: sentenceHash(story.text),
      },
    ],
    info(context, result),
    context.services.now().getTime(),
  );
  return true;
}

/**
 * Keep the deck words that really stand in the text, in forms that are
 * theirs, and the questions that fill their gap with a form of their word,
 * one per word. The story is kept while enough of both remain.
 */
export function acceptStory(
  candidates: readonly StoryCandidate[],
  output: GenStoryOutput,
): StoryExercise | null {
  const text = output.text.replace(/\r\n/g, '\n').trim();
  const words = wordCount(text);
  if (words < STORY_MIN_WORDS || words > STORY_MAX_WORDS) return null;
  const inText = textKeys(text);
  const kept = candidates.flatMap((candidate, i) => {
    const listed = output.targets.find((t) => t.id === i + 1)?.forms ?? [];
    const forms = [
      ...new Set(
        listed
          .map((f) => f.trim())
          .filter((f) => f && inText.has(glossKey(f)) && isFormOf(f, candidate.source)),
      ),
    ];
    return forms.length ? [{ id: i + 1, candidate, forms }] : [];
  });
  if (kept.length < Math.min(STORY_MIN_TARGETS, candidates.length)) return null;

  const questions: StoryQuestion[] = [];
  for (const raw of output.questions) {
    const target = kept.findIndex((k) => k.id === raw.target);
    if (target < 0 || questions.some((q) => q.target === target)) continue;
    const question: StoryQuestion = {
      target,
      sentence: raw.sentence.trim(),
      answer: raw.answer.trim(),
      accepted: raw.accepted.map((a) => a.trim()).filter(Boolean),
      cue: raw.cue.trim(),
      translation: raw.translation.trim(),
      glosses: [],
    };
    if (gapProblem(question, kept[target].candidate.source)) continue;
    questions.push(question);
  }
  if (questions.length < Math.min(STORY_MIN_QUESTIONS, kept.length)) return null;

  return {
    title: output.title.trim(),
    text,
    glosses: output.glosses
      .map((g) => ({ de: g.de.trim(), en: g.en.trim() }))
      .filter((g) => g.de && g.en),
    targets: kept.map(({ candidate: { source: _, ...target }, forms }) => ({ ...target, forms })),
    questions: questions.slice(0, STORY_MAX_QUESTIONS),
  };
}
