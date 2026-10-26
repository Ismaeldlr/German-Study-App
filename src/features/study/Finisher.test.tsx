import { act, fireEvent, screen } from '@testing-library/react-native';
import { and, eq } from 'drizzle-orm';

import { CardState } from '@/core/cards';
import type { StoryExercise } from '@/core/story';
import { DAY_MS } from '@/core/time';
import { markExerciseUsed, saveExercises } from '@/data/repos/exercises';
import { createItem } from '@/data/repos/items';
import { setSetting } from '@/data/repos/settings';
import { card, review, studySession } from '@/data/schema';
import { itemInput } from '@/data/testing/fixtures';
import { createMemoryKeyStore } from '@/llm/key-store';
import { createMockLlmFetch } from '@/llm/testing/mock-llm-fetch';
import { UmlautProvider } from '@/ui/umlaut';

import type { Services } from '../services';
import { createTestServices, renderWithServices } from '../testing/render-with-services';
import { StudyScreen } from './StudyScreen';
import { useStudyStore } from './store';

const T = new Date(2026, 9, 19, 9).getTime();
const GEN = { provider: 'custom', model: 'mock', promptVersion: 'x@1', tokensIn: 0, tokensOut: 0 };

/** Wohnung and Miete known for a while; only Wohnung's production card is due. */
async function setup(options: { llm?: boolean } = {}) {
  const services = await createTestServices({
    now: () => new Date(T),
    ...(options.llm
      ? {
          keyStore: createMemoryKeyStore({ custom: 'test-key' }),
          fetch: createMockLlmFetch().fetch,
        }
      : {}),
  });
  if (options.llm) {
    setSetting(services.db, 'llm.provider', 'custom');
    setSetting(services.db, 'llm.customBaseUrl', 'http://mock.test/v1');
    setSetting(services.db, 'llm.model', 'mock-mini');
  }
  setSetting(services.db, 'study.newItemsBase', 0);
  const wohnung = createItem(services.db, itemInput(), T - 30 * DAY_MS);
  const miete = createItem(
    services.db,
    itemInput({ lemma: 'Miete', plural: 'Mieten', meanings: ['rent'] }),
    T - 30 * DAY_MS,
  );
  for (const c of services.db.select().from(card).all()) {
    const due = c.itemId === wohnung && c.type === 'produce' ? T - 1000 : T + 20 * DAY_MS;
    services.db
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
      .where(eq(card.id, c.id))
      .run();
  }
  return { services, wohnung, miete };
}

const cardOf = (s: Services, itemId: number, type: string) =>
  s.db
    .select()
    .from(card)
    .where(and(eq(card.itemId, itemId), eq(card.type, type as never)))
    .get()!;

function cacheStory(s: Services, wohnung: number, miete: number) {
  const target = (itemId: number, word: string, meaning: string, form: string) => ({
    itemId,
    recognizeCardId: cardOf(s, itemId, 'recognize').id,
    produceCardId: cardOf(s, itemId, 'produce').id,
    word,
    meaning,
    kind: 'noun' as const,
    forms: [form],
  });
  const story: StoryExercise = {
    title: 'Die neue Wohnung',
    text: 'Lena hat eine neue Wohnung.\n\nDie Miete ist nicht hoch.',
    glosses: [],
    targets: [
      target(wohnung, 'die Wohnung', 'flat, apartment', 'Wohnung'),
      target(miete, 'die Miete', 'rent', 'Miete'),
    ],
    questions: [
      {
        target: 1,
        sentence: 'Lena bezahlt jeden Monat die ___.',
        answer: 'Miete',
        accepted: [],
        cue: 'rent',
        translation: 'Lena pays the rent every month.',
        glosses: [],
      },
    ],
  };
  saveExercises(
    s.db,
    'story',
    [{ itemIds: [wohnung, miete], topic: 'Umzug', payload: story, hash: null }],
    GEN,
    T - DAY_MS,
  );
}

const render = (services: Services) =>
  renderWithServices(
    <UmlautProvider>
      <StudyScreen />
    </UmlautProvider>,
    services,
  );

async function answerDueCard() {
  await fireEvent.changeText(await screen.findByLabelText('Your answer'), 'die Wohnung');
  await fireEvent.press(screen.getByRole('button', { name: 'Check' }));
  await fireEvent.press(await screen.findByRole('button', { name: 'Continue' }));
}

beforeEach(() => useStudyStore.getState().reset());

describe('the session finisher', () => {
  it('closes the session with a story, whose ratings join the summary', async () => {
    const { services, miete } = await setup();
    cacheStory(services, 1, miete);
    await render(services);
    await answerDueCard();

    expect(await screen.findByTestId('finisher-title')).toHaveTextContent('A mini story');
    await fireEvent.press(screen.getByRole('button', { name: 'Read it' }));
    expect(screen.getByTestId('story-title')).toHaveTextContent('Die neue Wohnung');
    await fireEvent.press(screen.getByText('Wohnung.'));
    await fireEvent.press(screen.getByRole('button', { name: 'Done reading' }));
    await fireEvent.changeText(screen.getByLabelText('Your answer'), 'Miete');
    await fireEvent.press(screen.getByRole('button', { name: 'Check' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Finish' }));
    expect(screen.getByTestId('story-score')).toHaveTextContent(
      '1 of 1 question right · 1 deck word looked up',
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Finish the session' }));

    expect(await screen.findByTestId('study-summary')).toBeOnTheScreen();
    // The due card, the looked-up word and the question.
    expect(screen.getByTestId('summary-cards')).toHaveTextContent('3 cards done');
    const modes = services.db
      .select()
      .from(review)
      .all()
      .map((r) => r.mode);
    expect(modes).toEqual(['classic', 'story', 'story']);
    const [session] = services.db.select().from(studySession).all();
    expect(session).toMatchObject({ cardsDone: 3 });
  });

  it('closes with a short chat when the LLM is set up and no story waits', async () => {
    const { services } = await setup({ llm: true });
    await render(services);
    await answerDueCard();

    expect(await screen.findByTestId('finisher-title')).toHaveTextContent('A short chat');
    await fireEvent.press(screen.getByRole('button', { name: 'Start the chat' }));
    expect(await screen.findByTestId('chat-view')).toBeOnTheScreen();
    expect(screen.getByTestId('chat-turns')).toHaveTextContent('Message 1 of 5');
    // Wohnung was reviewed a moment ago, so the chat steers toward Miete only.
    expect(screen.getByTestId('chat-targets')).toHaveTextContent(/die Miete/);
    expect(screen.getByTestId('chat-targets')).not.toHaveTextContent(/Wohnung/);

    for (let i = 0; i < 5; i++) {
      await fireEvent.changeText(screen.getByLabelText('Your message'), 'Die Miete ist hoch.');
      await fireEvent.press(screen.getByRole('button', { name: 'Send' }));
      expect(await screen.findAllByTestId('chat-correct')).toHaveLength(i + 1);
    }
    await fireEvent.press(screen.getByRole('button', { name: 'See how it went' }));
    expect(await screen.findByTestId('chat-summary')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Finish the session' }));

    expect(await screen.findByTestId('study-summary')).toBeOnTheScreen();
    expect(screen.getByTestId('summary-cards')).toHaveTextContent('2 cards done');
  });

  it('is skipped when you stop the session yourself', async () => {
    const { services, wohnung, miete } = await setup();
    cacheStory(services, wohnung, miete);
    await render(services);
    expect(await screen.findByLabelText('Your answer')).toBeOnTheScreen();
    // What the header's Stop button does.
    await act(async () => useStudyStore.getState().finish());
    expect(await screen.findByTestId('study-summary')).toBeOnTheScreen();
    expect(screen.queryByTestId('finisher')).not.toBeOnTheScreen();
  });

  it('comes every other day only', async () => {
    const { services, wohnung, miete } = await setup();
    cacheStory(services, wohnung, miete);
    // A story read yesterday.
    cacheStory(services, wohnung, miete);
    markExerciseUsed(services.db, 1, T - DAY_MS);
    await render(services);
    await answerDueCard();
    expect(await screen.findByTestId('study-summary')).toBeOnTheScreen();
    expect(screen.queryByTestId('finisher')).not.toBeOnTheScreen();
  });
});
