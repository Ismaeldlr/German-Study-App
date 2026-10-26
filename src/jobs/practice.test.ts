/// <reference types="node" />
import { and, eq } from 'drizzle-orm';

import { CardState } from '@/core/cards';
import { XP_PER_CHAT_MESSAGE } from '@/core/chat';
import { Rating } from '@/core/rating';
import { gradeStoryQuestion } from '@/core/story';
import { DAY_MS } from '@/core/time';
import { createChapter } from '@/data/repos/chapters';
import { getChat, lastChatAt, openChat } from '@/data/repos/chats';
import { markExerciseUsed, nextStory } from '@/data/repos/exercises';
import { createItem } from '@/data/repos/items';
import { chatTargets, storyCandidates } from '@/data/repos/practice';
import { activityByDay } from '@/data/repos/progress';
import { setSetting } from '@/data/repos/settings';
import { recordStory } from '@/data/repos/stories';
import { recordReview } from '@/data/repos/study';
import { weakSpots } from '@/data/repos/weak-spots';
import { card, mistake, review } from '@/data/schema';
import { itemInput, verbInput } from '@/data/testing/fixtures';
import { createTestDb } from '@/data/testing/test-db';
import type { Services } from '@/features/services';
import { createMemoryKeyStore } from '@/llm/key-store';
import { createFakeFetch } from '@/llm/testing/fake-fetch';
import { createMockLlmFetch } from '@/llm/testing/mock-llm-fetch';

import { endChat, sendChatMessage, startChat } from './chat';
import { acceptStory, runPrefetch } from './prefetch';

const NOW = new Date(2026, 9, 19, 9);
const T = NOW.getTime();

async function services(clock = { t: T }, overrides: Partial<Services> = {}): Promise<Services> {
  const db = await createTestDb();
  setSetting(db, 'llm.provider', 'custom');
  setSetting(db, 'llm.customBaseUrl', 'http://mock.test/v1');
  setSetting(db, 'llm.model', 'mock-mini');
  const chapter = createChapter(db, { number: 1, title: 'Wohnen', themes: ['Umzug'] });
  setSetting(db, 'study.currentChapterId', chapter);
  return {
    db,
    keyStore: createMemoryKeyStore({ custom: 'test-key' }),
    fetch: createMockLlmFetch().fetch,
    now: () => new Date(clock.t),
    ...overrides,
  };
}

const cardOf = (s: Services, itemId: number, type: string) =>
  s.db
    .select()
    .from(card)
    .where(and(eq(card.itemId, itemId), eq(card.type, type as never)))
    .get()!;

/** Every card in review and not due for weeks, so prefetch has nothing else to write. */
function knownItem(s: Services, itemId: number, due = T + 20 * DAY_MS) {
  s.db
    .update(card)
    .set({
      state: CardState.Review,
      stability: 10,
      difficulty: 5,
      reps: 4,
      lastReview: T - 10 * DAY_MS,
      scheduledDays: 10,
      due,
    })
    .where(eq(card.itemId, itemId))
    .run();
}

function deck(s: Services) {
  const ids = [
    createItem(s.db, itemInput(), T - 30 * DAY_MS),
    createItem(
      s.db,
      itemInput({ lemma: 'Miete', plural: 'Mieten', meanings: ['rent'] }),
      T - 29 * DAY_MS,
    ),
    createItem(s.db, verbInput(), T - 28 * DAY_MS),
    createItem(
      s.db,
      itemInput({ lemma: 'Balkon', article: 'der', plural: 'Balkone', meanings: ['balcony'] }),
      T - 27 * DAY_MS,
    ),
  ];
  for (const id of ids) knownItem(s, id);
  return ids;
}

describe('stories', () => {
  it('writes one story a day around words you know, with gap questions on them', async () => {
    const clock = { t: T };
    const s = await services(clock);
    const [wohnung, miete, umziehen, balkon] = deck(s);

    const report = await runPrefetch(s);
    expect(report).toMatchObject({ stories: 1, rejected: 0, stoppedBy: null });
    const story = nextStory(s.db)!;
    expect(story.itemIds).toEqual([wohnung, miete, umziehen, balkon]);
    expect(story.payload.targets.map((t) => [t.word, t.forms])).toEqual([
      ['die Wohnung', ['Wohnung']],
      ['die Miete', ['Miete']],
      ['umziehen', ['umziehen']],
      ['der Balkon', ['Balkon']],
    ]);
    expect(story.payload.targets[0]).toMatchObject({
      recognizeCardId: cardOf(s, wohnung, 'recognize').id,
      produceCardId: cardOf(s, wohnung, 'produce').id,
    });
    expect(story.payload.questions).toHaveLength(4);
    expect(story.payload.text.split('\n\n')).toHaveLength(3);

    // One is waiting: nothing new.
    expect((await runPrefetch(s)).stories).toBe(0);
    // Read today: still nothing until tomorrow.
    markExerciseUsed(s.db, story.id, T);
    expect((await runPrefetch(s)).stories).toBe(0);
    clock.t += DAY_MS;
    expect((await runPrefetch(s)).stories).toBe(1);
  });

  it('waits until at least three of your words are in review', async () => {
    const s = await services();
    createItem(s.db, itemInput(), T - DAY_MS);
    knownItem(s, 1);
    expect((await runPrefetch(s)).stories).toBe(0);
    expect(nextStory(s.db)).toBeNull();
  });

  it('prefers words that get no review soon, and the current chapter’s', async () => {
    const s = await services();
    const [wohnung, miete, umziehen] = deck(s);
    knownItem(s, wohnung, T + DAY_MS);
    s.db
      .update(card)
      .set({ due: T - 1 })
      .where(eq(card.id, cardOf(s, miete, 'recognize').id))
      .run();
    expect(storyCandidates(s.db, NOW).map((c) => c.itemId)).toEqual([umziehen, 4, miete, wohnung]);
  });

  it('drops words missing from the text and questions that do not fit, keeping the rest', async () => {
    const s = await services();
    deck(s);
    const candidates = storyCandidates(s.db, NOW);
    const text = `${'Lena wohnt seit einem Jahr in Leipzig und arbeitet viel. '.repeat(10)}Die Wohnung ist hell, die Miete ist hoch, und der Balkon ist groß.`;
    const question = (target: number, sentence: string, answer: string) => ({
      target,
      sentence,
      answer,
      accepted: [],
      cue: '',
      translation: '',
    });
    const story = acceptStory(candidates, {
      title: ' Neu in Leipzig ',
      text,
      targets: [
        { id: 1, forms: ['Wohnung', 'Wohnungen'] },
        { id: 2, forms: ['Miete'] },
        { id: 3, forms: ['umziehen'] },
        { id: 4, forms: ['Balkon'] },
      ],
      glosses: [{ de: 'hell', en: 'bright' }],
      questions: [
        question(1, 'Lena mag ihre neue ___ sehr.', 'Wohnung'),
        question(2, 'Die ___ ist leider sehr hoch.', 'Wohnung'),
        question(4, 'Auf dem ___ sitzt sie gern.', 'Balkon'),
        question(2, 'Lena bezahlt die ___ jeden Monat.', 'Miete'),
      ],
    })!;
    expect(story.title).toBe('Neu in Leipzig');
    // umziehen is not in the text, and Wohnungen is not either.
    expect(story.targets.map((t) => [t.word, t.forms])).toEqual([
      ['die Wohnung', ['Wohnung']],
      ['die Miete', ['Miete']],
      ['der Balkon', ['Balkon']],
    ]);
    // The second question's answer is not a form of Miete; the fourth is.
    expect(story.questions.map((q) => [q.target, q.answer])).toEqual([
      [0, 'Wohnung'],
      [2, 'Balkon'],
      [1, 'Miete'],
    ]);
  });

  it('rates what you tapped as a lapse and the gap answers by how they went', async () => {
    const s = await services();
    const [wohnung, miete, umziehen] = deck(s);
    await runPrefetch(s);
    const story = nextStory(s.db)!.payload;
    const answer = (q: number, given: string) => ({
      ...gradeStoryQuestion(
        story.questions[q],
        given,
        story.targets[story.questions[q].target].kind,
      ),
      answer: given,
    });

    const ratings = recordStory(
      s.db,
      story,
      new Set([1]),
      [answer(0, 'Wohnung'), answer(1, 'miete'), answer(2, 'umziehe'), answer(3, '')],
      T,
    );
    expect(ratings.map((r) => [r.cardId, r.rating])).toEqual([
      [cardOf(s, wohnung, 'produce').id, Rating.Good],
      [cardOf(s, miete, 'recognize').id, Rating.Again],
      [cardOf(s, miete, 'produce').id, Rating.Hard],
      [cardOf(s, umziehen, 'produce').id, Rating.Again],
      [cardOf(s, 4, 'produce').id, Rating.Again],
    ]);
    const logged = s.db.select().from(review).all();
    expect(logged.every((r) => r.mode === 'story')).toBe(true);
    // Untapped words with no question get no review.
    expect(logged.map((r) => r.cardId)).not.toContain(cardOf(s, wohnung, 'recognize').id);
    const mistakes = s.db.select().from(mistake).all();
    expect(mistakes.map((m) => [m.itemId, m.category])).toEqual([
      [miete, 'capitalization'],
      [umziehen, 'verb_form'],
    ]);
  });
});

describe('chat', () => {
  it('opens a scenario, checks each message, steers to target words and rates the used ones', async () => {
    const clock = { t: T };
    const s = await services(clock);
    const [wohnung, miete] = deck(s);

    const id = await startChat(s, { topic: 'Umzug', maxTurns: 3 });
    let chat = getChat(s.db, id)!;
    expect(chat).toMatchObject({
      scenario: 'Im Treppenhaus: Umzug',
      character: 'Frau Becker, your neighbour',
      topic: 'Umzug',
      maxTurns: 3,
      endedAt: null,
    });
    expect(chat.targets.map((t) => t.word)).toEqual([
      'die Wohnung',
      'die Miete',
      'umziehen',
      'der Balkon',
    ]);
    expect(chat.messages).toEqual([
      expect.objectContaining({ role: 'assistant', content: expect.stringMatching(/^Hallo!/) }),
    ]);

    clock.t += 60_000;
    chat = await sendChatMessage(s, id, ' Meine wohnung ist zu klein. ');
    const [, mine, reply] = chat.messages;
    expect(mine).toMatchObject({
      role: 'user',
      content: 'Meine wohnung ist zu klein.',
      at: T + 60_000,
      correction: {
        verdict: 'minor',
        corrected: 'Meine Wohnung ist zu klein.',
        errors: [expect.objectContaining({ category: 'capitalization', text: 'wohnung' })],
      },
      used: [{ word: 'die Wohnung', verdict: 'slip' }],
    });
    expect(reply).toMatchObject({ role: 'assistant', translation: expect.any(String) });
    expect(chat.summary).toMatch(/1 messages/);
    // The mistake is logged at once, without a review.
    expect(s.db.select().from(mistake).all()).toEqual([
      expect.objectContaining({ category: 'capitalization', reviewId: null, itemId: null }),
    ]);

    clock.t += 60_000;
    await sendChatMessage(s, id, 'Ich habe gegangen, die Miete ist hoch.');
    clock.t += 60_000;
    chat = await sendChatMessage(s, id, 'Die Miete ist 800 Euro.');
    expect(chat.messages.at(-1)!.content).toMatch(/bis bald/);
    expect(openChat(s.db, new Date(clock.t))?.id).toBe(id);
    expect(weakSpots(s.db, new Date(clock.t)).map((w) => w.category)).toEqual([
      'verb_form',
      'capitalization',
    ]);

    const result = await endChat(s, id);
    expect(result.feedback).toMatch(/capital letters/);
    expect(result.wellUsed).toEqual(['die Wohnung', 'die Miete']);
    expect(result.words.map((w) => [w.cardId, w.outcome, w.rating])).toEqual([
      [cardOf(s, wohnung, 'produce').id, 'slip', Rating.Hard],
      [cardOf(s, miete, 'produce').id, 'correct', Rating.Good],
    ]);
    const logged = s.db.select().from(review).all();
    expect(logged).toEqual([
      expect.objectContaining({ mode: 'chat', answer: 'Meine wohnung ist zu klein.' }),
      expect.objectContaining({ mode: 'chat', answer: 'Ich habe gegangen, die Miete ist hoch.' }),
    ]);
    expect(lastChatAt(s.db)).toBe(clock.t);
    expect(openChat(s.db, new Date(clock.t))).toBeUndefined();
    // Ending again changes nothing.
    expect(await endChat(s, id)).toEqual(result);
    expect(s.db.select().from(review).all()).toHaveLength(2);

    // Each message you wrote earns XP on the day you wrote it.
    const today = activityByDay(s.db).get('2026-10-19')!;
    expect(today.reviews).toBe(2);
    expect(today.xp).toBe(3 * XP_PER_CHAT_MESSAGE + 15 + 15);
  });

  it('never steers toward a card you reviewed today', async () => {
    const s = await services();
    const [wohnung, miete] = deck(s);
    recordReview(
      s.db,
      {
        cardId: cardOf(s, wohnung, 'produce').id,
        rating: Rating.Good,
        mode: 'classic',
        responseMs: 1000,
        answer: 'die Wohnung',
        correct: true,
      },
      T - 1000,
    );
    expect(chatTargets(s.db, NOW).map((t) => t.itemId)).toEqual([miete, 3, 4]);
  });

  it('ends without feedback when the LLM cannot be reached, and saves nothing for a failed turn', async () => {
    const s = await services();
    deck(s);
    const id = await startChat(s, { topic: 'Umzug', maxTurns: 10 });
    const failing = { ...s, fetch: createFakeFetch([{ status: 500, body: 'down' }]).fetch };

    await expect(sendChatMessage(failing, id, 'Hallo!')).rejects.toThrow();
    expect(getChat(s.db, id)!.messages).toHaveLength(1);

    const offline = { ...s, fetch: createFakeFetch([]).fetch };
    await sendChatMessage(s, id, 'Hallo, die Miete ist hoch.');
    const result = await endChat(offline, id);
    expect(result.feedback).toBeNull();
    expect(result.words).toHaveLength(1);
  });
});
