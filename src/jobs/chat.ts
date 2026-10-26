import {
  CHAT_MESSAGE_MAX,
  contextWindow,
  userTurns,
  type ChatMessage,
  type ChatResult,
} from '@/core/chat';
import { matchTarget } from '@/core/translation';
import type { DbOrTx } from '@/data/db';
import { getChapter } from '@/data/repos/chapters';
import { addChatTurn, createChat, finishChat, getChat, scenarioOf } from '@/data/repos/chats';
import { chatTargets } from '@/data/repos/practice';
import { getAllSettings } from '@/data/repos/settings';
import type { ChatRow } from '@/data/schema';
import { getLlmClient } from '@/features/llm-client';
import type { Services } from '@/features/services';
import { LlmError } from '@/llm/errors';
import { chatOpen } from '@/llm/tasks/chat-open';
import { chatSummary } from '@/llm/tasks/chat-summary';
import { chatTurn } from '@/llm/tasks/chat-turn';
import { runTask } from '@/llm/tasks/task';

import { topicPicker } from './prefetch';

/**
 * Running a roleplay chat. Every step needs the LLM, so chats only run
 * online. Starting and sending throw an LlmError the screen shows with a
 * retry; nothing is saved for a turn until its reply is in. Ending works
 * offline too: only the teacher's feedback is left out then.
 */

const TIMEOUT_MS = 30_000;

/** Topics to offer: the current chapter's themes, then your interests. */
export function chatTopics(db: DbOrTx): string[] {
  const settings = getAllSettings(db);
  const chapterId = settings['study.currentChapterId'];
  const themes = chapterId ? (getChapter(db, chapterId)?.themes ?? []) : [];
  return [...new Set([...themes, ...settings['study.interests']].map((t) => t.trim()))].filter(
    Boolean,
  );
}

/** Set up a scenario for the topic, or one picked like any other, and save its opening line. */
export async function startChat(
  services: Services,
  options: { topic?: string | null; maxTurns: number; signal?: AbortSignal },
): Promise<number> {
  const { db } = services;
  const client = await getLlmClient(services);
  const topic = options.topic?.trim() || topicPicker(db)();
  const targets = chatTargets(db, services.now());
  const { output } = await runTask(
    client,
    chatOpen,
    { topic, targets: targets.map((t) => ({ word: t.word, meaning: t.meaning })) },
    { signal: options.signal, timeoutMs: TIMEOUT_MS },
  );
  return createChat(
    db,
    {
      scenario: {
        title: output.title.trim(),
        character: output.character.trim(),
        situation: output.situation.trim(),
      },
      topic,
      targets,
      maxTurns: options.maxTurns,
      opening: { content: output.reply.trim(), translation: output.translation.trim() },
    },
    services.now().getTime(),
  );
}

/** Send one message: it comes back checked, with the character's reply. */
export async function sendChatMessage(
  services: Services,
  chatId: number,
  text: string,
  options: { signal?: AbortSignal } = {},
): Promise<ChatRow> {
  const { db } = services;
  const row = getChat(db, chatId);
  if (!row) throw new Error('This chat is gone.');
  if (row.endedAt !== null || userTurns(row.messages) >= row.maxTurns) {
    throw new Error('This chat has ended.');
  }
  const message = text.trim().slice(0, CHAT_MESSAGE_MAX);
  if (!message) throw new LlmError('bad_request', 'Write a message first.');
  const sentAt = services.now().getTime();
  const client = await getLlmClient(services);
  const { output } = await runTask(
    client,
    chatTurn,
    {
      scenario: scenarioOf(row),
      targets: row.targets.map((t) => ({ word: t.word, meaning: t.meaning })),
      summary: row.summary,
      recent: contextWindow(row.messages).map((m) => ({
        from: m.role === 'user' ? ('learner' as const) : ('you' as const),
        text: m.content,
      })),
      message,
      turn: userTurns(row.messages) + 1,
      turns: row.maxTurns,
    },
    { signal: options.signal, timeoutMs: TIMEOUT_MS },
  );
  const errors = output.correction.errors
    .map((e) => ({
      category: e.category,
      text: e.text.trim(),
      correction: e.correction.trim(),
      explanation: e.explanation.trim(),
    }))
    .filter((e) => e.text || e.correction);
  const used = output.used.flatMap((u) => {
    const target = matchTarget(row.targets, u.word);
    return target ? [{ word: target.word, verdict: u.verdict }] : [];
  });
  const mine: ChatMessage = {
    role: 'user',
    content: message,
    at: sentAt,
    correction: {
      verdict: errors.length ? output.correction.verdict : 'correct',
      corrected: output.correction.corrected.trim() || message,
      errors,
    },
    used,
  };
  const reply: ChatMessage = {
    role: 'assistant',
    content: output.reply.trim(),
    translation: output.translation.trim(),
    at: services.now().getTime(),
  };
  addChatTurn(db, chatId, { message: mine, reply, summary: output.summary }, reply.at);
  return getChat(db, chatId)!;
}

/**
 * End the chat: ask for the teacher's look back, if the LLM can be
 * reached, then rate the target words you used. Never throws for the LLM.
 */
export async function endChat(
  services: Services,
  chatId: number,
  options: { signal?: AbortSignal } = {},
): Promise<ChatResult> {
  const { db } = services;
  const row = getChat(db, chatId);
  if (!row) throw new Error('This chat is gone.');
  if (row.result) return row.result;
  let summary: { feedback: string; wellUsed: string[] } | null = null;
  const mine = row.messages.filter((m) => m.role === 'user');
  if (mine.length) {
    try {
      const client = await getLlmClient(services);
      const result = await runTask(
        client,
        chatSummary,
        {
          scenario: scenarioOf(row),
          targets: row.targets.map((t) => t.word),
          messages: mine.map((m) => ({
            text: m.content,
            corrected: m.correction?.corrected ?? m.content,
            errors: (m.correction?.errors ?? []).map(
              (e) => `${e.category}: ${e.text} → ${e.correction}`,
            ),
          })),
        },
        { signal: options.signal, timeoutMs: TIMEOUT_MS },
      );
      summary = result.output;
    } catch {
      // Offline or over budget: the chat still ends, just without the feedback.
    }
  }
  return finishChat(db, chatId, summary, services.now().getTime());
}
