import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { eq } from 'drizzle-orm';

import { createItem } from '@/data/repos/items';
import { setSetting } from '@/data/repos/settings';
import { card, review, studySession } from '@/data/schema';
import { itemInput, verbInput } from '@/data/testing/fixtures';
import { UmlautProvider } from '@/ui/umlaut';

import * as Notifications from '../notifications';
import { createTestServices, renderWithServices } from '../testing/render-with-services';
import { StudyScreen } from './StudyScreen';
import { useStudyStore } from './store';

const DAY = 86_400_000;

async function deck(clock: { t: number }) {
  const services = await createTestServices({ now: () => new Date(clock.t) });
  const created = clock.t - 2 * DAY;
  createItem(services.db, itemInput(), created);
  createItem(
    services.db,
    itemInput({ lemma: 'Küche', plural: 'Küchen', meanings: ['kitchen'] }),
    created + 1,
  );
  createItem(
    services.db,
    itemInput({ lemma: 'Zimmer', article: 'das', plural: 'Zimmer', meanings: ['room'] }),
    created + 2,
  );
  createItem(services.db, verbInput(), created + 3);
  return services;
}

/** A deck where only Küche's production card is due. */
async function kuecheDue(clock: { t: number }) {
  const services = await deck(clock);
  setSetting(services.db, 'study.newItemsBase', 0);
  const kueche = services.db
    .select()
    .from(card)
    .all()
    .find((c) => c.itemId === 2 && c.type === 'produce')!;
  services.db
    .update(card)
    .set({
      state: 2,
      stability: 10,
      difficulty: 5,
      due: clock.t - DAY,
      lastReview: clock.t - 10 * DAY,
      reps: 3,
      scheduledDays: 9,
    })
    .where(eq(card.id, kueche.id))
    .run();
  return services;
}

const render = (services: Awaited<ReturnType<typeof deck>>) =>
  renderWithServices(
    <UmlautProvider>
      <StudyScreen />
    </UmlautProvider>,
    services,
  );

beforeEach(() => useStudyStore.getState().reset());

describe('Study screen', () => {
  it('introduces a new word, then asks for its meaning with multiple choice', async () => {
    const clock = { t: new Date(2026, 9, 19, 9).getTime() };
    const services = await deck(clock);
    setSetting(services.db, 'study.newItemsBase', 1);
    await render(services);

    expect(await screen.findByTestId('study-intro')).toBeOnTheScreen();
    expect(screen.getByText('die Wohnung')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Got it' }));

    expect(screen.getByText('What does this mean?')).toBeOnTheScreen();
    clock.t += 3000;
    await fireEvent.press(screen.getByRole('button', { name: 'flat, apartment' }));

    expect(await screen.findByText('Right!')).toBeOnTheScreen();
    expect(screen.getByTestId('feedback-rating')).toHaveTextContent('Rated Good');
    const logged = services.db.select().from(review).all();
    expect(logged).toEqual([
      expect.objectContaining({ rating: 3, mode: 'classic', responseMs: 3000, correct: true }),
    ]);

    // The new card is in a short learning step, so it comes back in this session.
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByText('What does this mean?')).toBeOnTheScreen();
    expect(screen.queryByTestId('study-intro')).not.toBeOnTheScreen();
  });

  it('rates a wrong pick Again, shows the answer and logs the mistake', async () => {
    const clock = { t: new Date(2026, 9, 19, 9).getTime() };
    const services = await deck(clock);
    setSetting(services.db, 'study.newItemsBase', 1);
    await render(services);
    await fireEvent.press(await screen.findByRole('button', { name: 'Got it' }));
    await fireEvent.press(screen.getByRole('button', { name: 'kitchen' }));

    expect(await screen.findByText('Not quite')).toBeOnTheScreen();
    expect(screen.getByTestId('feedback-expected')).toHaveTextContent('flat, apartment');
    expect(screen.getByTestId('feedback-rating')).toHaveTextContent('Rated Again');
  });

  it('grades typed answers, with umlaut slips rated Hard, and ends with a summary', async () => {
    const clock = { t: new Date(2026, 9, 19, 9).getTime() };
    const services = await kuecheDue(clock);
    await render(services);

    expect(await screen.findByText(/Say it in German/)).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText('Your answer'), 'die Kueche');
    await fireEvent.press(screen.getByRole('button', { name: 'Check' }));

    expect(await screen.findByText('Almost: a small slip')).toBeOnTheScreen();
    expect(screen.getByTestId('feedback-rating')).toHaveTextContent('Rated Hard');
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByTestId('study-summary')).toBeOnTheScreen();
    expect(screen.getByTestId('summary-cards')).toHaveTextContent('1 card done');
    expect(screen.getByTestId('summary-recall')).toHaveTextContent('Recall: 100%');
    expect(screen.getByText(/die Küche: Kueche → die Küche/)).toBeOnTheScreen();
    const [session] = services.db.select().from(studySession).all();
    expect(session).toMatchObject({ cardsDone: 1, newItems: 0, accuracy: 1 });
    expect(session.endedAt).not.toBeNull();
  });

  it("plans the reminders again when a session ends, without today's", async () => {
    const clock = { t: new Date(2026, 9, 19, 9).getTime() };
    const services = await kuecheDue(clock);
    setSetting(services.db, 'ui.reminderEnabled', true);
    await render(services);

    await fireEvent.changeText(await screen.findByLabelText('Your answer'), 'die Küche');
    await fireEvent.press(screen.getByRole('button', { name: 'Check' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Continue' }));
    expect(await screen.findByTestId('study-summary')).toBeOnTheScreen();

    await waitFor(async () =>
      expect(await Notifications.getAllScheduledNotificationsAsync()).toHaveLength(7),
    );
    const [first] = await Notifications.getAllScheduledNotificationsAsync();
    expect(first.content.body).toBe('Keep your streak going: make it 2 days in a row.');
    expect(first.trigger).toMatchObject({ date: new Date(2026, 9, 20, 19) });
  });

  it('asks gender, plural and verb forms for cards unlocked the day after', async () => {
    const clock = { t: new Date(2026, 9, 19, 9).getTime() };
    const services = await deck(clock);
    setSetting(services.db, 'study.newItemsBase', 0);
    // Introduce Wohnung and umziehen yesterday.
    const cards = services.db.select().from(card).all();
    for (const c of cards.filter(
      (x) => x.type === 'recognize' && (x.itemId === 1 || x.itemId === 4),
    )) {
      services.db
        .update(card)
        .set({ state: 2, due: clock.t + 5 * DAY, lastReview: clock.t - DAY, reps: 1, stability: 3 })
        .where(eq(card.id, c.id))
        .run();
      services.db
        .insert(review)
        .values({
          cardId: c.id,
          reviewedAt: clock.t - DAY,
          rating: 3,
          mode: 'classic',
          correct: true,
          stateBefore: 0,
        })
        .run();
    }
    await render(services);

    const seen = new Set<string>();
    const answers: Record<string, string> = {
      'flat; apartment': 'Wohnung',
      'to move (house)': 'umziehen',
    };
    for (let i = 0; i < 30 && !screen.queryByTestId('study-summary'); i++) {
      if (screen.queryByText('Which article?')) {
        seen.add('gender');
        await fireEvent.press(screen.getByRole('button', { name: 'die' }));
      } else if (screen.queryByText('What is the plural?')) {
        seen.add('plural');
        await fireEvent.changeText(screen.getByLabelText('Your answer'), 'Wohnungen');
        await fireEvent.press(screen.getByRole('button', { name: 'Check' }));
      } else if (screen.queryByText('Verb forms (er/sie/es)')) {
        seen.add('verb_forms');
        await fireEvent.changeText(screen.getByLabelText('Präsens'), 'zieht um');
        await fireEvent.changeText(screen.getByLabelText('Präteritum'), 'zog um');
        await fireEvent.changeText(screen.getByLabelText('Perfekt'), 'ist umgezogen');
        await fireEvent.press(screen.getByRole('button', { name: 'Check' }));
      } else {
        seen.add('produce');
        const prompt = screen.getByTestId('study-prompt').props.children as string;
        await fireEvent.changeText(screen.getByLabelText('Your answer'), answers[prompt]);
        await fireEvent.press(screen.getByRole('button', { name: 'Check' }));
      }
      expect(await screen.findByText('Right!')).toBeOnTheScreen();
      await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    }
    expect([...seen].sort()).toEqual(['gender', 'plural', 'produce', 'verb_forms']);
    // Each new card came back once from its short learning step, then graduated.
    expect(screen.getByTestId('summary-cards')).toHaveTextContent('10 cards done');
  });

  it('says so when there is nothing to study', async () => {
    const services = await createTestServices();
    await render(services);
    expect(await screen.findByText('Nothing to study right now.')).toBeOnTheScreen();
  });
});
