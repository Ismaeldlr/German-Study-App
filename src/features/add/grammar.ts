import { cleanExamples, type GrammarFields } from '@/core/grammar';
import { getChapter } from '@/data/repos/chapters';
import { getSetting } from '@/data/repos/settings';
import { describeGrammar } from '@/llm/tasks/describe-grammar';
import { runTask } from '@/llm/tasks/task';

import { getLlmClient } from '../llm-client';
import type { Services } from '../services';

/** Ask the LLM to write up a grammar point you named. Throws an LlmError on failure. */
export async function describeGrammarPoint(
  services: Services,
  name: string,
  signal?: AbortSignal,
): Promise<GrammarFields> {
  const client = await getLlmClient(services);
  const chapterId = getSetting(services.db, 'study.currentChapterId');
  const chapter = chapterId ? getChapter(services.db, chapterId) : undefined;
  const { output } = await runTask(
    client,
    describeGrammar,
    {
      name: name.trim(),
      chapter: chapter ? { title: chapter.title, themes: chapter.themes } : null,
    },
    { signal, timeoutMs: 45_000 },
  );
  return {
    name: output.name.trim() || name.trim(),
    label: output.label.trim(),
    summary: output.summary.trim(),
    examples: cleanExamples(output.examples).slice(0, 3),
    categories: [...new Set(output.categories)],
  };
}
