import type { z } from 'zod';

import type { LlmClient } from '../client';
import { LlmError } from '../errors';
import type { LlmMessage, TokenCounts } from '../types';

/**
 * A typed LLM task: a versioned prompt and a zod schema for its output.
 * The system prompt is static per version and goes first, so providers with
 * prompt caching can discount it. Only the user message varies per call.
 */
export interface LlmTask<Input, Output> {
  name: string;
  version: string;
  system: string;
  buildUser(input: Input): string;
  schema: z.ZodType<Output>;
  /** A number, or a function of the input for tasks whose output grows with it. */
  maxTokens: number | ((input: Input) => number);
  temperature?: number;
  /** Checks zod cannot express. Return a problem description, or null when fine. */
  check?(output: Output, input: Input): string | null;
}

export interface TaskResult<Output> {
  output: Output;
  usage: TokenCounts;
  attempts: number;
  model: string;
  promptVersion: string;
}

export interface RunTaskOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  model?: string;
}

/**
 * Run a task and validate its JSON. On a validation failure it retries once
 * with the error attached, then throws `invalid_output` so the caller can
 * fall back to offline content.
 */
export async function runTask<Input, Output>(
  client: LlmClient,
  task: LlmTask<Input, Output>,
  input: Input,
  options: RunTaskOptions = {},
): Promise<TaskResult<Output>> {
  const messages: LlmMessage[] = [
    { role: 'system', content: task.system },
    { role: 'user', content: task.buildUser(input) },
  ];
  const usage: TokenCounts = { inputTokens: 0, outputTokens: 0 };
  let lastProblem = '';

  for (let attempt = 1; attempt <= 2; attempt++) {
    const response = await client.complete({
      model: options.model,
      messages,
      maxTokens: typeof task.maxTokens === 'function' ? task.maxTokens(input) : task.maxTokens,
      temperature: task.temperature,
      json: true,
      signal: options.signal,
      timeoutMs: options.timeoutMs,
    });
    usage.inputTokens += response.usage.inputTokens;
    usage.outputTokens += response.usage.outputTokens;

    const outcome = validate(task, input, response.text);
    if (outcome.ok) {
      return {
        output: outcome.value,
        usage,
        attempts: attempt,
        model: response.model,
        promptVersion: `${task.name}@${task.version}`,
      };
    }
    lastProblem = outcome.problem;
    messages.push(
      { role: 'assistant', content: response.text },
      {
        role: 'user',
        content: `Your reply failed validation: ${outcome.problem}\nReply again with only the corrected JSON object.`,
      },
    );
  }

  throw new LlmError('invalid_output', `${task.name} returned invalid output: ${lastProblem}`);
}

type Validation<T> = { ok: true; value: T } | { ok: false; problem: string };

function validate<Input, Output>(
  task: LlmTask<Input, Output>,
  input: Input,
  text: string,
): Validation<Output> {
  let json: unknown;
  try {
    json = JSON.parse(extractJson(text));
  } catch {
    return { ok: false, problem: 'the reply was not valid JSON.' };
  }
  const parsed = task.schema.safeParse(json);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .slice(0, 5)
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    return { ok: false, problem: issues };
  }
  const problem = task.check?.(parsed.data, input) ?? null;
  return problem ? { ok: false, problem } : { ok: true, value: parsed.data };
}

/** Models sometimes wrap JSON in a code fence or add a sentence around it. */
export function extractJson(text: string): string {
  const trimmed = text.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  if (fenced?.[1]) return fenced[1].trim();
  const start = trimmed.search(/[[{]/);
  if (start > 0) {
    const open = trimmed[start];
    const end = trimmed.lastIndexOf(open === '{' ? '}' : ']');
    if (end > start) return trimmed.slice(start, end + 1);
  }
  return trimmed;
}
