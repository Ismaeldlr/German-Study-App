import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { and, eq } from 'drizzle-orm';

import { CardState } from '@/core/cards';
import { DAY_MS } from '@/core/time';
import { createChapter } from '@/data/repos/chapters';
import { getChat } from '@/data/repos/chats';
import { nextStory } from '@/data/repos/exercises';
import { createItem } from '@/data/repos/items';
import { setSetting } from '@/data/repos/settings';
import { card, mistake, review } from '@/data/schema';
import { itemInput, verbInput } from '@/data/testing/fixtures';
import { createMemoryKeyStore } from '@/llm/key-store';
import { createMockLlmFetch } from '@/llm/testing/mock-llm-fetch';
import type { FetchLike } from '@/llm/types';
import { UmlautProvider } from '@/ui/umlaut';
import { runPrefetch } from '@/jobs/prefetch';

import type { Services } from '../services';
import { createTestServices, renderWithServices } from '../testing/render-with-services';
import { ChatScreen } from './ChatScreen';
import { StoryScreen } from './StoryScreen';

const T = new Date(2026, 9, 19, 9).getTime();

async function setup(fetch: FetchLike = createMockLlmFetch().fetch) {
  const clock = { t: T };
  const services = await createTestServices({
    now: () => new Date(clock.t),
    keyStore: createMemoryKeyStore({ custom: 'test-key' }),
    fetch,
  });
  setSetting(services.db, 'llm.provider', 'custom');
  setSetting(services.db, 'llm.customBaseUrl', 'http://mock.test/v1');
  setSetting(services.db, 'llm.model', 'mock-mini');
  const chapter = createChapter(services.db, { number: 1, title: 'Wohnen', themes: ['Umzug'] });
  setSetting(services.db, 'study.currentChapterId', chapter);
  setSetting(services.db, 'study.interests', ['Fußball']);
  const ids = [
    createItem(services.db, itemInput(), T - 30 * DAY_MS),
    createItem(
      services.db,
      itemInput({ lemma: 'Miete', plural: 'Mieten', meanings: ['rent'] }),
      T - 29 * DAY_MS,
    ),
    createItem(services.db, verbInput(), T - 28 * DAY_MS),
  ];
  // Every card known and not due for weeks.
  services.db
    .update(card)
    .set({
      state: CardState.Review,
      stability: 10,
      difficulty: 5,
      reps: 4,
      lastReview: T - 10 * DAY_MS,
      scheduledDays: 10,
      due: T + 20 * DAY_MS,
    })
    .run();
  return { services, clock, ids };
}

const cardOf = (s: Services, itemId: number, type: string) =>
  s.db
    .select()
    .from(card)
    .where(and(eq(card.itemId, itemId), eq(card.type, type as never)))
    .get()!;

const render = (ui: React.ReactElement, services: Services) =>
  renderWithServices(<UmlautProvider>{ui}</UmlautProvider>, services);

describe('Story screen', () => {
  it('reads with tap-to-translate, asks gap questions and rates the words', async () => {
    const { services, ids } = await setup();
    await runPrefetch(services);
    expect(nextStory(services.db)).not.toBeNull();
    await render(<StoryScreen />, services);

    expect(await screen.findByText(/^Lenas Tag/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Read it' }));
    expect(screen.getByTestId('story-read')).toBeOnTheScreen();
    expect(nextStory(services.db)).toBeNull();

    // A word outside the deck: its gloss, nothing else.
    await fireEvent.press(screen.getByText('Zeitung.'));
    expect(screen.getByTestId('story-gloss')).toHaveTextContent('Zeitung: newspaper');
    // A deck word: its meaning, and it counts as looked up.
    await fireEvent.press(screen.getByText('Miete'));
    expect(screen.getByTestId('story-gloss')).toHaveTextContent(/Miete: rent/);
    expect(screen.getByTestId('story-gloss')).toHaveTextContent(/From your deck/);

    await fireEvent.press(screen.getByRole('button', { name: 'Done reading' }));
    expect(screen.queryByTestId('story-read')).not.toBeOnTheScreen();
    expect(screen.getByTestId('drill-progress')).toHaveTextContent('Story questions · 1 of 3');
    for (const answer of ['Wohnung', 'Miete', 'umziehe']) {
      await fireEvent.changeText(screen.getByLabelText('Your answer'), answer);
      await fireEvent.press(screen.getByRole('button', { name: 'Check' }));
      await fireEvent.press(screen.getByRole('button', { name: /Next|Finish/ }));
    }

    expect(screen.getByTestId('story-score')).toHaveTextContent(
      '2 of 3 questions right · 1 deck word looked up',
    );
    const logged = services.db.select().from(review).all();
    expect(logged.map((r) => [r.cardId, r.rating, r.mode])).toEqual([
      [cardOf(services, ids[0], 'produce').id, 3, 'story'],
      [cardOf(services, ids[1], 'recognize').id, 1, 'story'],
      [cardOf(services, ids[1], 'produce').id, 3, 'story'],
      [cardOf(services, ids[2], 'produce').id, 1, 'story'],
    ]);
    expect(screen.getByTestId('story-xp')).toHaveTextContent('+28 XP');
    expect(screen.getByText('die Miete (looked up): rated Again')).toBeOnTheScreen();
    expect(screen.getByText('die Miete: rated Good')).toBeOnTheScreen();
  });

  it('writes one on request when none is waiting', async () => {
    const { services } = await setup();
    await render(<StoryScreen />, services);
    expect(screen.getByTestId('story-none')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Write one now' }));
    expect(await screen.findByText(/^Lenas Tag/, {}, { timeout: 3000 })).toBeOnTheScreen();
  });
});

describe('Chat screen', () => {
  it('runs a roleplay with inline corrections, then sums it up', async () => {
    const { services, clock, ids } = await setup();
    await render(<ChatScreen />, services);

    expect(screen.getByTestId('chat-planned-targets')).toHaveTextContent(
      /steers toward: die Wohnung, die Miete, umziehen$/,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Umzug' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Start chatting' }));
    expect(await screen.findByTestId('chat-view')).toBeOnTheScreen();
    expect(screen.getByText('Im Treppenhaus: Umzug')).toBeOnTheScreen();
    expect(screen.getByTestId('chat-turns')).toHaveTextContent('Message 1 of 10');

    // The character's line shows its English on tap.
    await fireEvent.press(screen.getByTestId('chat-reply'));
    expect(screen.getByTestId('chat-translation')).toHaveTextContent(/How are you today/);

    clock.t += 60_000;
    await fireEvent.changeText(screen.getByLabelText('Your message'), 'Meine wohnung ist klein.');
    await fireEvent.press(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByTestId('chat-correction')).toHaveTextContent(
      /Meine Wohnung ist klein\./,
    );
    // Folded until you ask for the details.
    expect(screen.queryByTestId('chat-error-detail')).not.toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('chat-correction'));
    expect(screen.getByTestId('chat-error-detail')).toHaveTextContent(
      /Capital letters: wohnung → Wohnung/,
    );
    const wohnungProduce = cardOf(services, ids[0], 'produce').id;
    expect(screen.getByTestId(`chat-target-${wohnungProduce}`)).toHaveTextContent('✓ die Wohnung');
    expect(services.db.select().from(mistake).all()).toHaveLength(1);

    await fireEvent.changeText(screen.getByLabelText('Your message'), 'Die Miete ist hoch.');
    await fireEvent.press(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByTestId('chat-correct')).toHaveTextContent(/Richtig!/);
    expect(screen.getByTestId('chat-turns')).toHaveTextContent('Message 3 of 10');

    await fireEvent.press(screen.getByRole('button', { name: 'End chat' }));
    expect(await screen.findByTestId('chat-summary')).toBeOnTheScreen();
    expect(screen.getByTestId('chat-feedback')).toHaveTextContent(/capital letters/);
    expect(screen.getAllByTestId('chat-word-rating').map((n) => n.props.children.join(''))).toEqual(
      ['die Wohnung: rated Hard', 'die Miete: rated Good'],
    );
    expect(screen.getByText(/Not used, so not rated: umziehen/)).toBeOnTheScreen();
    // Two messages at 10 XP, two words remembered at 15.
    expect(screen.getByTestId('chat-xp')).toHaveTextContent('+50 XP');
    expect(
      services.db
        .select()
        .from(review)
        .all()
        .map((r) => r.mode),
    ).toEqual(['chat', 'chat']);
  });

  it('keeps your message and says why when a turn fails', async () => {
    const { services } = await setup();
    const mock = createMockLlmFetch().fetch;
    let fail = false;
    const fetch: FetchLike = (url, init) =>
      fail ? Promise.resolve(new Response('down', { status: 500 })) : mock(url, init);
    await render(<ChatScreen />, { ...services, fetch });

    await fireEvent.press(screen.getByRole('button', { name: 'Start chatting' }));
    expect(await screen.findByTestId('chat-view')).toBeOnTheScreen();
    fail = true;
    await fireEvent.changeText(screen.getByLabelText('Your message'), 'Hallo!');
    await fireEvent.press(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByTestId('chat-error')).toBeOnTheScreen();
    expect(screen.getByLabelText('Your message').props.value).toBe('Hallo!');
    expect(getChat(services.db, 1)!.messages).toHaveLength(1);

    fail = false;
    await fireEvent.press(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(getChat(services.db, 1)!.messages).toHaveLength(3));
  });

  it('picks an unfinished chat from today up again', async () => {
    const { services } = await setup();
    await render(<ChatScreen />, services);
    await fireEvent.press(screen.getByRole('button', { name: 'Start chatting' }));
    expect(await screen.findByTestId('chat-view')).toBeOnTheScreen();
    await act(async () => screen.unmount());

    await render(<ChatScreen />, services);
    expect(screen.getByTestId('chat-open')).toHaveTextContent(/Im Treppenhaus/);
    await fireEvent.press(screen.getByRole('button', { name: 'Continue the chat' }));
    expect(screen.getByTestId('chat-view')).toBeOnTheScreen();
  });
});
