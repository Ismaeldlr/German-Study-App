import { fireEvent, screen } from '@testing-library/react-native';
import { eq } from 'drizzle-orm';

import { CardState } from '@/core/cards';
import { BLANK, sentenceHash, type GapExercise } from '@/core/gap-fill';
import { saveGapExercises } from '@/data/repos/exercises';
import { createItem } from '@/data/repos/items';
import { setSetting } from '@/data/repos/settings';
import { card, exercise, review } from '@/data/schema';
import { itemInput, verbInput } from '@/data/testing/fixtures';
import { UmlautProvider } from '@/ui/umlaut';

import type { Services } from '../services';
import { createTestServices, renderWithServices } from '../testing/render-with-services';
import { StudyScreen } from './StudyScreen';
import { useStudyStore } from './store';

const DAY = 86_400_000;
const T = new Date(2026, 9, 19, 9).getTime();

const sentence = (overrides: Partial<GapExercise> = {}): GapExercise => ({
  sentence: `Wir ${BLANK} im Mai in eine größere Wohnung um.`,
  answer: 'ziehen',
  accepted: [],
  cue: 'to move (house)',
  translation: 'We are moving into a bigger flat in May.',
  glosses: [{ de: 'größere', en: 'bigger' }],
  ...overrides,
});

/** umziehen's production card is due, in the given state, with a sentence cached. */
async function setup(state: number, cached: GapExercise | null = sentence()) {
  const clock = { t: T };
  const services = await createTestServices({ now: () => new Date(clock.t) });
  setSetting(services.db, 'study.newItemsBase', 0);
  const itemId = createItem(services.db, verbInput(), T - 5 * DAY);
  createItem(services.db, itemInput(), T - 5 * DAY);
  const produce = services.db
    .select()
    .from(card)
    .all()
    .find((c) => c.itemId === itemId && c.type === 'produce')!;
  services.db
    .update(card)
    .set({
      state,
      stability: 4,
      difficulty: 5,
      reps: 2,
      lastReview: T - 4 * DAY,
      scheduledDays: 4,
      due: T - 1000,
    })
    .where(eq(card.id, produce.id))
    .run();
  if (cached) {
    saveGapExercises(
      services.db,
      [
        {
          cardId: produce.id,
          itemId,
          topic: 'Umzug',
          exercise: cached,
          hash: sentenceHash(cached.sentence),
        },
      ],
      {
        provider: 'custom',
        model: 'mock',
        promptVersion: 'gen_gap_batch@1',
        tokensIn: 0,
        tokensOut: 0,
      },
      T - DAY,
    );
  }
  return { services, clock, produceId: produce.id };
}

const render = (services: Services) =>
  renderWithServices(
    <UmlautProvider>
      <StudyScreen />
    </UmlautProvider>,
    services,
  );

beforeEach(() => useStudyStore.getState().reset());

describe('gap fill in the Study session', () => {
  it('asks a learning card in a cached sentence with the first letter as a free hint', async () => {
    const { services, clock } = await setup(CardState.Learning);
    await render(services);

    expect(await screen.findByText('Fill the gap')).toBeOnTheScreen();
    expect(screen.getByTestId('gap-blank')).toHaveTextContent('z___');
    expect(screen.getByTestId('gap-cue')).toHaveTextContent('(to move (house))');
    expect(screen.queryByTestId('gap-hint')).not.toBeOnTheScreen();

    // Tap a glossed word for its English.
    await fireEvent.press(screen.getByText('größere'));
    expect(screen.getByTestId('gap-gloss')).toHaveTextContent('größere: bigger');

    clock.t += 4000;
    await fireEvent.changeText(screen.getByLabelText('Your answer'), 'ziehen');
    await fireEvent.press(screen.getByRole('button', { name: 'Check' }));

    expect(await screen.findByText('Right!')).toBeOnTheScreen();
    // The free first letter does not lower the rating.
    expect(screen.getByTestId('feedback-rating')).toHaveTextContent('Rated Good');
    expect(screen.getByTestId('feedback-example')).toHaveTextContent(
      /Wir ziehen im Mai in eine größere Wohnung um\.We are moving/,
    );
    expect(services.db.select().from(review).all()).toEqual([
      expect.objectContaining({ mode: 'gap_fill', rating: 3, answer: 'ziehen', correct: true }),
    ]);
    const [row] = services.db.select().from(exercise).all();
    expect(row.usedAt).toBe(T);
  });

  it('rates a review card Hard when you ask for the hint', async () => {
    const { services } = await setup(CardState.Review);
    await render(services);

    expect(await screen.findByTestId('gap-blank')).toHaveTextContent('____');
    await fireEvent.press(screen.getByRole('button', { name: 'Hint' }));
    expect(screen.getByTestId('gap-blank')).toHaveTextContent('z___');
    await fireEvent.changeText(screen.getByLabelText('Your answer'), 'ziehen');
    await fireEvent.press(screen.getByRole('button', { name: 'Check' }));
    expect(await screen.findByTestId('feedback-rating')).toHaveTextContent('Rated Hard');
  });

  it('names a wrong ending and shows the sentence it belongs in', async () => {
    const { services } = await setup(CardState.Review);
    await render(services);
    await fireEvent.changeText(await screen.findByLabelText('Your answer'), 'zieht');
    await fireEvent.press(screen.getByRole('button', { name: 'Check' }));

    expect(await screen.findByText('Not quite')).toBeOnTheScreen();
    expect(screen.getByText(/Right word, wrong form/)).toBeOnTheScreen();
    expect(screen.getByTestId('feedback-rating')).toHaveTextContent('Rated Again');
  });

  it('drops a bad sentence and asks the same card as a classic card instead', async () => {
    const { services } = await setup(CardState.Review);
    await render(services);
    await fireEvent.press(await screen.findByRole('button', { name: 'Bad sentence' }));

    expect(screen.getByText(/Say it in German/)).toBeOnTheScreen();
    const [row] = services.db.select().from(exercise).all();
    expect(row.discarded).toBe(true);
    await fireEvent.changeText(screen.getByLabelText('Your answer'), 'umziehen');
    await fireEvent.press(screen.getByRole('button', { name: 'Check' }));
    expect(await screen.findByText('Right!')).toBeOnTheScreen();
    expect(services.db.select().from(review).all()[0].mode).toBe('classic');
  });

  it('falls back to a classic card when nothing is cached', async () => {
    const { services } = await setup(CardState.Review, null);
    await render(services);
    expect(await screen.findByText(/Say it in German/)).toBeOnTheScreen();
  });

  it('ends at the time target with a note on the summary', async () => {
    const { services, clock } = await setup(CardState.Review);
    setSetting(services.db, 'study.sessionMinutes', 1);
    // A second due card, so there is work left when time runs out.
    const second = services.db
      .select()
      .from(card)
      .all()
      .find((c) => c.itemId === 2 && c.type === 'recognize')!;
    services.db
      .update(card)
      .set({
        state: CardState.Review,
        stability: 4,
        difficulty: 5,
        reps: 2,
        lastReview: T - 4 * DAY,
        due: T - 1,
      })
      .where(eq(card.id, second.id))
      .run();
    await render(services);

    // Warm-up first: the classic recognition card.
    expect(await screen.findByText('What does this mean?')).toBeOnTheScreen();
    clock.t += 2 * 60_000;
    await fireEvent.press(screen.getByRole('button', { name: 'Show meaning' }));
    await fireEvent.press(screen.getByRole('button', { name: "I didn't" }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Continue' }));

    expect(await screen.findByTestId('summary-time-up')).toHaveTextContent(
      /That was your 1 minute\. The rest waits/,
    );
  });
});
