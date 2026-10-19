import { fireEvent, screen } from '@testing-library/react-native';
import { and, eq } from 'drizzle-orm';

import { CardState } from '@/core/cards';
import { saveGapExercises } from '@/data/repos/exercises';
import { createChapter } from '@/data/repos/chapters';
import { createItem } from '@/data/repos/items';
import { setSetting } from '@/data/repos/settings';
import { todayQueue } from '@/data/repos/study';
import { recordUsage } from '@/data/repos/usage';
import { card, item, review, suggestion } from '@/data/schema';
import { itemInput } from '@/data/testing/fixtures';
import { HomeScreen } from '@/features/home/HomeScreen';
import { UsageScreen } from '@/features/settings/UsageScreen';
import { createMemoryKeyStore } from '@/llm/key-store';
import { createMockLlmFetch } from '@/llm/testing/mock-llm-fetch';

import { createTestServices, renderWithServices } from '../testing/render-with-services';
import { SuggestionsScreen } from './SuggestionsScreen';

const NOW = new Date(2026, 9, 19, 9);
const DAY = 86_400_000;

async function llmServices() {
  const services = await createTestServices({
    keyStore: createMemoryKeyStore({ custom: 'test-key' }),
    fetch: createMockLlmFetch().fetch,
  });
  setSetting(services.db, 'llm.provider', 'custom');
  setSetting(services.db, 'llm.customBaseUrl', 'http://mock.test/v1');
  setSetting(services.db, 'llm.model', 'mock-mini');
  const chapter = createChapter(services.db, { number: 2, title: 'Wohnen', themes: ['Wohnung'] });
  setSetting(services.db, 'study.currentChapterId', chapter);
  createItem(services.db, itemInput({ chapterId: chapter }), NOW.getTime() - DAY);
  return { services, chapter };
}

describe('Suggested words', () => {
  it('asks for words, then adds one and turns one down with a tap each', async () => {
    const { services, chapter } = await llmServices();
    await renderWithServices(<SuggestionsScreen />, services);
    expect(screen.getByTestId('suggestions-empty')).toBeOnTheScreen();

    await fireEvent.changeText(screen.getByLabelText('Topic (optional)'), 'Wohnung');
    await fireEvent.press(screen.getByRole('button', { name: 'Suggest words' }));
    expect(await screen.findByTestId('suggest-message')).toHaveTextContent(/new suggestions below/);

    const rows = services.db.select().from(suggestion).all();
    const zimmer = rows.find((r) => r.lemma === 'Zimmer')!;
    const miete = rows.find((r) => r.lemma === 'Miete')!;
    expect(screen.getByTestId(`suggestion-reason-${zimmer.id}`)).toHaveTextContent(
      'Why: Goes with Wohnung, which you know.',
    );
    await fireEvent.press(screen.getByTestId(`suggestion-accept-${zimmer.id}`));
    expect(screen.getByTestId('suggest-message')).toHaveTextContent(
      'Added das Zimmer to 2. Wohnen.',
    );
    const added = services.db.select().from(item).where(eq(item.lemma, 'Zimmer')).get();
    expect(added).toMatchObject({ chapterId: chapter, source: 'llm', article: 'das' });

    await fireEvent.press(screen.getByTestId(`suggestion-reject-${miete.id}`));
    expect(screen.queryByTestId(`suggestion-${miete.id}`)).not.toBeOnTheScreen();
    expect(
      services.db.select().from(suggestion).where(eq(suggestion.id, miete.id)).get(),
    ).toMatchObject({
      status: 'rejected',
    });
  });

  it('shows why the call failed', async () => {
    const services = await createTestServices();
    await renderWithServices(<SuggestionsScreen />, services);
    await fireEvent.press(screen.getByRole('button', { name: 'Suggest words' }));
    expect(await screen.findByTestId('suggest-message')).toHaveTextContent(/base URL|API key/);
  });

  it('points to waiting suggestions from Home', async () => {
    const { services } = await llmServices();
    services.db
      .insert(suggestion)
      .values({ lemma: 'Miete', reason: 'Goes with Wohnung.', createdAt: NOW.getTime() })
      .run();
    await renderWithServices(<HomeScreen />, services);
    expect(screen.getByTestId('suggestions-banner')).toHaveTextContent(/1 suggested word waiting/);
  });
});

describe('Usage screen', () => {
  it('shows spend against the cap, per day, and how each prompt version fares', async () => {
    const services = await createTestServices();
    setSetting(services.db, 'llm.monthlyCap', 1);
    recordUsage(
      services.db,
      { provider: 'custom', model: 'mock-mini', inputTokens: 1000, outputTokens: 500, at: NOW },
      { input: 100, output: 200 },
    );
    const itemId = createItem(services.db, itemInput(), NOW.getTime());
    const gap = {
      sentence: 'Die ___ ist hell.',
      answer: 'Wohnung',
      accepted: [],
      cue: 'flat',
      translation: 'The flat is bright.',
      glosses: [],
    };
    saveGapExercises(
      services.db,
      [
        { cardId: 1, itemId, topic: 'x', exercise: gap, hash: 'a' },
        { cardId: 1, itemId, topic: 'x', exercise: gap, hash: 'b' },
      ],
      {
        provider: 'custom',
        model: 'mock-mini',
        promptVersion: 'gen_gap_batch@1',
        tokensIn: 0,
        tokensOut: 0,
      },
      NOW.getTime(),
    );
    await renderWithServices(<UsageScreen />, services);

    expect(screen.getByTestId('usage-spent')).toHaveTextContent('$0.20 of $1.00');
    expect(screen.getByTestId('usage-cache-gen_gap_batch@1')).toHaveTextContent(
      '2 ready · 0 used · 0 marked bad',
    );
    expect(screen.getByText(/2026-10-19 · mock-mini · 1 call/)).toBeOnTheScreen();
    expect(screen.queryByTestId('usage-over-cap')).not.toBeOnTheScreen();
  });
});

describe('adaptive new items', () => {
  it('cuts new words for overdue reviews and pauses them when recall is low', async () => {
    const services = await createTestServices();
    const { db } = services;
    setSetting(db, 'study.newItemsBase', 3);
    for (let i = 0; i < 5; i++) {
      createItem(db, itemInput({ lemma: `Neu${i}`, meanings: [`new ${i}`] }), NOW.getTime() - DAY);
    }
    const newItems = () => todayQueue(db, NOW).filter((e) => e.kind === 'new_item').length;
    expect(newItems()).toBe(3);

    // Ten overdue reviews cost one new word.
    for (let i = 0; i < 10; i++) {
      const id = createItem(db, itemInput({ lemma: `Alt${i}` }), NOW.getTime() - 10 * DAY);
      db.update(card)
        .set({
          state: CardState.Review,
          stability: 3,
          difficulty: 5,
          reps: 2,
          due: NOW.getTime() - 2 * DAY,
        })
        .where(and(eq(card.itemId, id), eq(card.type, 'recognize')))
        .run();
    }
    expect(newItems()).toBe(2);

    // Recall under 80% over the last three days: no new words at all.
    const someCard = db.select().from(card).get()!;
    for (let i = 0; i < 10; i++) {
      db.insert(review)
        .values({
          cardId: someCard.id,
          reviewedAt: NOW.getTime() - DAY,
          rating: i < 7 ? 3 : 1,
          mode: 'classic',
          correct: i < 7,
          stateBefore: 2,
        })
        .run();
    }
    expect(newItems()).toBe(0);
  });
});
