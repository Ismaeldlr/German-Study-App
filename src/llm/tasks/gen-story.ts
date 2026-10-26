import { z } from 'zod';

import { drillProblem } from '@/core/drills';
import {
  STORY_MAX_QUESTIONS,
  STORY_MAX_WORDS,
  STORY_MIN_QUESTIONS,
  STORY_MIN_WORDS,
  wordCount,
} from '@/core/story';

import type { LlmTask } from './task';

/**
 * A mini story around a handful of deck words, and gap questions on it.
 * Whether each target really stands in the text, and whether each question
 * fills its gap with a form of its word, is checked per word afterwards, so
 * one weak question does not cost a retry of the whole story.
 */

export interface GenStoryInput {
  targets: { id: number; word: string; type: string; meaning: string }[];
  topic: string;
  /** Other deck words the story may use. */
  known: string[];
}

const question = z.object({
  target: z.number().int(),
  sentence: z.string(),
  answer: z.string(),
  accepted: z.array(z.string()).optional().default([]),
  cue: z.string(),
  translation: z.string(),
});

const schema = z.object({
  title: z.string(),
  text: z.string(),
  targets: z
    .array(z.object({ id: z.number().int(), forms: z.array(z.string()) }))
    .optional()
    .default([]),
  glosses: z
    .array(z.object({ de: z.string(), en: z.string() }))
    .optional()
    .default([]),
  questions: z.array(question),
});
export type GenStoryOutput = z.infer<typeof schema>;

export const genStory: LlmTask<GenStoryInput, GenStoryOutput> = {
  name: 'gen_story',
  version: '1',
  temperature: 0.8,
  schema,
  maxTokens: 1600,
  system: `Task: gen_story
You write a mini story for an A2 German learner whose class uses the Momente A2 textbook, then a few gap questions on it.

Rules:
- text: a short story of 120 to 200 words about the topic, at A2 level: Präsens and Perfekt, short main clauses, a weil or dass clause now and then. Name the people in it. Write two to four paragraphs separated by a blank line ("\\n\\n").
- title: a short German title.
- Use every target word at least once, in whatever form the sentence needs. Work in the learner's known words where they fit. Otherwise use only A1 and A2 vocabulary.
- targets: one entry per target id, {"id", "forms"}: every form of that word exactly as it stands in the text ("Wohnungen", "zieht"). For a separable verb list the verb part only, not the particle.
- glosses: for each word in the text above A1 level that is not a target word, {"de": the single word exactly as it appears, "en": its English meaning here}.
- questions: ${STORY_MIN_QUESTIONS} to ${STORY_MAX_QUESTIONS} gap questions, each on a different target word, {"target": the target's id, "sentence", "answer", "accepted", "cue", "translation"}:
  - sentence: a new German sentence of 6 to 14 words about something that happens in the story, with the target word replaced by exactly "___" (three underscores). The gap holds only the target word: never its article, never a second word. For a separable verb the gap holds the verb part and the prefix stays at the end of the clause. Never use the target word anywhere else in the sentence.
  - answer: the exact text that fills the gap. accepted: other forms also correct there, usually none.
  - cue: the target's English meaning as used, 1 to 4 words. translation: the whole sentence in English, gap filled.

Reply with only a JSON object: {"title", "text", "targets": [{"id", "forms"}], "glosses": [{"de", "en"}], "questions": [{"target", "sentence", "answer", "accepted", "cue", "translation"}]}`,
  buildUser: (input) =>
    JSON.stringify({ topic: input.topic, targets: input.targets, known: input.known }),
  check(output, input) {
    const words = wordCount(output.text);
    if (words < STORY_MIN_WORDS || words > STORY_MAX_WORDS) {
      return `the text has ${words} words; write 120 to 200`;
    }
    const ids = new Set(input.targets.map((t) => t.id));
    const stray = output.questions.filter((q) => !ids.has(q.target)).map((q) => q.target);
    if (stray.length) return `questions name unknown target ids ${stray.join(', ')}`;
    return drillProblem(output.questions, Math.min(STORY_MIN_QUESTIONS, input.targets.length));
  },
};
