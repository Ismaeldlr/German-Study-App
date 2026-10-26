import { and, desc, eq, gte, isNotNull, isNull, sql } from 'drizzle-orm';

import {
  chatWordOutcome,
  messageMistakes,
  wordKey,
  wordVerdicts,
  type ChatMessage,
  type ChatResult,
  type ChatScenario,
  type ChatTarget,
  type ChatWordResult,
} from '@/core/chat';
import { ratingFor } from '@/core/rating';
import { startOfLocalDay } from '@/core/time';

import { notifyChange } from '../changes';
import type { DbOrTx } from '../db';
import { card, chat, mistake, type ChatRow } from '../schema';
import { recordReview } from './study';

/**
 * Roleplay chats. Every turn is saved the moment the reply arrives, and the
 * mistakes in your message go to the weak spots right away. When the chat
 * ends, each target word you used gets one rating, logged as a chat review.
 */

export interface NewChat {
  scenario: ChatScenario;
  topic: string | null;
  targets: ChatTarget[];
  maxTurns: number;
  /** The character's first line. */
  opening: { content: string; translation: string };
}

export function createChat(db: DbOrTx, input: NewChat, now: number): number {
  const [row] = db
    .insert(chat)
    .values({
      scenario: input.scenario.title,
      character: input.scenario.character,
      situation: input.scenario.situation,
      topic: input.topic,
      targets: input.targets,
      targetItemIds: input.targets.map((t) => t.itemId),
      maxTurns: input.maxTurns,
      messages: [
        {
          role: 'assistant',
          content: input.opening.content,
          translation: input.opening.translation,
          at: now,
        },
      ],
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: chat.id })
    .all();
  notifyChange('chat');
  return row.id;
}

export function getChat(db: DbOrTx, id: number): ChatRow | undefined {
  return db.select().from(chat).where(eq(chat.id, id)).get();
}

export function scenarioOf(
  row: Pick<ChatRow, 'scenario' | 'character' | 'situation'>,
): ChatScenario {
  return { title: row.scenario, character: row.character, situation: row.situation };
}

/**
 * Save one exchange: your checked message and the character's reply, with
 * the new rolling summary. Your mistakes are logged for the weak spots in
 * the same transaction.
 */
export function addChatTurn(
  db: DbOrTx,
  id: number,
  turn: { message: ChatMessage; reply: ChatMessage; summary: string },
  now: number,
): void {
  db.transaction((tx) => {
    const row = getChat(tx, id);
    if (!row) throw new Error(`Chat ${id} not found`);
    tx.update(chat)
      .set({
        messages: [...row.messages, turn.message, turn.reply],
        summary: turn.summary.trim() || row.summary,
        updatedAt: now,
      })
      .where(eq(chat.id, id))
      .run();
    for (const note of messageMistakes(turn.message)) {
      tx.insert(mistake)
        .values({
          reviewId: null,
          itemId: null,
          category: note.category,
          yourText: note.yourText,
          correction: note.correction,
          explanation: note.explanation,
          confusedItemId: null,
          createdAt: now,
        })
        .run();
    }
  });
  notifyChange('chat', 'mistake');
}

/** A chat you started today and have not finished, to pick up again. */
export function openChat(db: DbOrTx, now: Date): ChatRow | undefined {
  return db
    .select()
    .from(chat)
    .where(and(isNull(chat.endedAt), gte(chat.updatedAt, startOfLocalDay(now))))
    .orderBy(desc(chat.updatedAt), desc(chat.id))
    .get();
}

/** When you last finished a chat, or null. */
export function lastChatAt(db: DbOrTx): number | null {
  const row = db
    .select({ at: sql<number | null>`max(${chat.endedAt})` })
    .from(chat)
    .where(isNotNull(chat.endedAt))
    .get();
  return row?.at ?? null;
}

/**
 * End a chat: rate each target word you used, once, from how it went
 * across the whole chat, and store the result. Ending a chat twice keeps
 * the first result.
 */
export function finishChat(
  db: DbOrTx,
  id: number,
  summary: { feedback: string; wellUsed: string[] } | null,
  now: number,
): ChatResult {
  const result = db.transaction((tx): ChatResult => {
    const row = getChat(tx, id);
    if (!row) throw new Error(`Chat ${id} not found`);
    if (row.result) return row.result;
    const words: ChatWordResult[] = [];
    for (const target of row.targets) {
      const outcome = chatWordOutcome(wordVerdicts(target, row.messages));
      const current = tx.select().from(card).where(eq(card.id, target.cardId)).get();
      if (!outcome || !current) continue;
      const rating = ratingFor({ outcome, cardState: current.state });
      const firstUse = row.messages.find(
        (m) => m.role === 'user' && m.used?.some((u) => wordKey(u.word) === wordKey(target.word)),
      );
      recordReview(
        tx,
        {
          cardId: current.id,
          rating,
          mode: 'chat',
          responseMs: null,
          answer: firstUse?.content ?? null,
          correct: outcome !== 'wrong',
        },
        now,
      );
      words.push({ cardId: current.id, itemId: target.itemId, word: target.word, outcome, rating });
    }
    const done: ChatResult = {
      feedback: summary?.feedback.trim() || null,
      wellUsed: (summary?.wellUsed ?? [])
        .map((w) => w.trim())
        .filter(Boolean)
        .slice(0, 5),
      words,
    };
    tx.update(chat)
      .set({ result: done, endedAt: now, updatedAt: now })
      .where(eq(chat.id, id))
      .run();
    return done;
  });
  notifyChange('chat');
  return result;
}

/** When each message you wrote in a chat was sent, for XP by day. */
export function chatMessageTimes(db: DbOrTx): number[] {
  return db
    .select({ messages: chat.messages })
    .from(chat)
    .all()
    .flatMap((r) => r.messages.filter((m) => m.role === 'user').map((m) => m.at));
}
