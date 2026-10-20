import { useNetInfo } from '@react-native-community/netinfo';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { and, eq } from 'drizzle-orm';

import { CardState } from '@/core/cards';
import type { DrillItem } from '@/core/drills';
import type { TranslationExercise } from '@/core/translation';
import { saveExercises } from '@/data/repos/exercises';
import { createGrammarItem } from '@/data/repos/grammar';
import { waitingGrades } from '@/data/repos/grading';
import { createItem } from '@/data/repos/items';
import { setSetting } from '@/data/repos/settings';
import { card, mistake, pendingGrade, review } from '@/data/schema';
import { itemInput, verbInput } from '@/data/testing/fixtures';
import { createMemoryKeyStore } from '@/llm/key-store';
import { createMockLlmFetch } from '@/llm/testing/mock-llm-fetch';
import type { FetchLike } from '@/llm/types';
import { UmlautProvider } from '@/ui/umlaut';

import type { Services } from '../services';
import { createTestServices, renderWithServices } from '../testing/render-with-services';
import { StudyScreen } from './StudyScreen';
import { useStudyStore } from './store';

const DAY = 86_400_000;
const T = new Date(2026, 9, 19, 9).getTime();
const GEN = { provider: 'custom', model: 'mock', promptVersion: 'x@1', tokensIn: 0, tokensOut: 0 };

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
  setSetting(services.db, 'study.newItemsBase', 0);
  return { services, clock };
}

const cardOf = (s: Services, itemId: number, type: string) =>
  s.db
    .select()
    .from(card)
    .where(and(eq(card.itemId, itemId), eq(card.type, type as never)))
    .get()!;

/** Reviewed long ago; only the production card is due. */
function matureItem(s: Services, itemId: number, produceStability = 40) {
  for (const c of s.db.select().from(card).where(eq(card.itemId, itemId)).all()) {
    s.db
      .update(card)
      .set({
        state: CardState.Review,
        stability: c.type === 'produce' ? produceStability : 40,
        difficulty: 5,
        reps: 6,
        lastReview: T - 30 * DAY,
        scheduledDays: 30,
        due: c.type === 'produce' ? T - 1000 : T + 20 * DAY,
      })
      .where(eq(card.id, c.id))
      .run();
  }
}

const render = (services: Services) =>
  renderWithServices(
    <UmlautProvider>
      <StudyScreen />
    </UmlautProvider>,
    services,
  );

beforeEach(() => useStudyStore.getState().reset());

const DRILL: DrillItem[] = [
  ['Ich fahre mit ___ Bus.', 'der Bus', 'dem'],
  ['Wir wohnen bei ___ Eltern.', 'meine Eltern', 'meinen'],
  ['Sie kommt von ___ Arbeit.', 'die Arbeit', 'der'],
  ['Er spricht mit ___ Nachbarin.', 'seine Nachbarin', 'seiner'],
  ['Nach ___ Kurs essen wir.', 'der Kurs', 'dem'],
].map(([sentence, hint, answer]) => ({
  sentence,
  hint,
  answer,
  accepted: [],
  translation: '(translation)',
  explanation: `mit, bei, von, nach take the dative: ${answer}.`,
  category: 'case_ending',
}));

async function answerItem(text: string) {
  await fireEvent.changeText(screen.getByLabelText('Your answer'), text);
  await fireEvent.press(screen.getByRole('button', { name: 'Check' }));
}

describe('grammar drills in the Study session', () => {
  it('introduces a new grammar point, drills it item by item and rates the set', async () => {
    const { services } = await setup();
    setSetting(services.db, 'study.newItemsBase', 1);
    const rule = createGrammarItem(
      services.db,
      {
        name: 'Dativ nach mit, bei, von',
        label: 'dative after mit, bei, von',
        summary: 'After mit, bei and von, use the dative.',
        examples: [{ de: 'Ich fahre mit dem Bus.', en: 'I go by bus.' }],
        categories: ['case_ending'],
      },
      null,
      T - DAY,
    );
    saveExercises(
      services.db,
      'grammar_drill',
      [
        {
          itemIds: [rule],
          topic: null,
          payload: { point: 'Dativ nach mit, bei, von', items: DRILL },
          hash: null,
        },
      ],
      GEN,
      T - DAY,
    );
    await render(services);

    expect(await screen.findByText('New grammar point')).toBeOnTheScreen();
    expect(screen.getByText('After mit, bei and von, use the dative.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Try it' }));

    expect(screen.getByTestId('drill-progress')).toHaveTextContent('Grammar drill · 1 of 5');
    expect(screen.getByTestId('drill-hint')).toHaveTextContent('(der Bus)');
    await answerItem('dem');
    expect(screen.getByTestId('drill-result')).toHaveTextContent(/Right!/);
    await fireEvent.press(screen.getByRole('button', { name: 'Next' }));

    await answerItem('meine');
    expect(screen.getByTestId('drill-result')).toHaveTextContent(/Not quite: meinen/);
    expect(screen.getByText(/take the dative: meinen/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Next' }));

    for (const answer of ['der', 'seiner', 'dem']) {
      await answerItem(answer);
      await fireEvent.press(screen.getByRole('button', { name: /Next|Finish/ }));
    }

    // One miss in five is still a pass, rated Hard.
    expect(await screen.findByTestId('feedback-expected')).toHaveTextContent('4 of 5 right');
    expect(screen.getByTestId('feedback-rating')).toHaveTextContent('Rated Hard');
    const logged = services.db.select().from(review).all();
    expect(logged).toEqual([
      expect.objectContaining({ mode: 'grammar_drill', rating: 2, correct: true }),
    ]);
  });
});

describe('translations in the Study session', () => {
  async function withTranslation(fetch?: FetchLike) {
    const { services, clock } = await setup(fetch);
    const wohnung = createItem(services.db, itemInput(), T - 60 * DAY);
    matureItem(services, wohnung);
    const produce = cardOf(services, wohnung, 'produce');
    const exercise: TranslationExercise = {
      english: 'I like the flat.',
      reference: 'Ich mag die Wohnung.',
      cues: ['flat'],
      targets: [{ cardId: produce.id, itemId: wohnung, word: 'die Wohnung', meaning: 'flat' }],
      grammar: null,
    };
    saveExercises(
      services.db,
      'translation',
      [{ itemIds: [wohnung], topic: null, payload: exercise, hash: null }],
      GEN,
      T - DAY,
    );
    return { services, clock, produce };
  }

  it('grades the sentence while you wait and rates the word', async () => {
    const { services, produce } = await withTranslation();
    await render(services);

    expect(await screen.findByText('Write it in German')).toBeOnTheScreen();
    expect(screen.getByTestId('translation-english')).toHaveTextContent('I like the flat.');
    expect(screen.getByTestId('translation-cues')).toHaveTextContent('Practise: flat');
    await answerItem('Ich mag die Wohnung');

    expect(await screen.findByText('Right!')).toBeOnTheScreen();
    expect(screen.getByTestId('feedback-rating')).toHaveTextContent('Rated Good');
    expect(screen.getByTestId(`verdict-${produce.id}`)).toHaveTextContent(
      'die Wohnung: used correctly',
    );
    expect(services.db.select().from(review).all()).toEqual([
      expect.objectContaining({ cardId: produce.id, mode: 'translation', rating: 3 }),
    ]);
    const [row] = services.db.select().from(pendingGrade).all();
    expect(row).toMatchObject({ status: 'graded', seenAt: expect.any(Number) });
  });

  it('shows corrections when the sentence is off', async () => {
    const { services } = await withTranslation();
    await render(services);
    await answerItem('Ich mag das Haus');
    expect(await screen.findByText('Not quite')).toBeOnTheScreen();
    expect(screen.getByTestId('feedback-expected')).toHaveTextContent('Ich mag die Wohnung.');
    expect(screen.getAllByTestId('translation-error').length).toBeGreaterThan(0);
    expect(screen.getByTestId('feedback-rating')).toHaveTextContent('Rated Again');
  });

  it('saves the answer for later when offline', async () => {
    jest.mocked(useNetInfo).mockReturnValue({
      isConnected: false,
      isInternetReachable: false,
    } as never);
    try {
      const { services } = await withTranslation();
      await render(services);
      await answerItem('Ich mag die Wohnung');

      expect(await screen.findByText('Saved for grading')).toBeOnTheScreen();
      expect(screen.getByTestId('feedback-note')).toHaveTextContent(/You are offline/);
      expect(screen.queryByTestId('feedback-rating')).not.toBeOnTheScreen();
      expect(services.db.select().from(review).all()).toEqual([]);
      expect(waitingGrades(services.db)).toHaveLength(1);

      await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
      expect(await screen.findByTestId('summary-deferred')).toHaveTextContent(
        '1 translation waits for grading',
      );
    } finally {
      jest.mocked(useNetInfo).mockReturnValue({
        isConnected: true,
        isInternetReachable: true,
      } as never);
    }
  });

  it('keeps the other words of a waiting translation out of the session', async () => {
    jest.mocked(useNetInfo).mockReturnValue({
      isConnected: false,
      isInternetReachable: false,
    } as never);
    try {
      const { services } = await setup();
      const wohnung = createItem(services.db, itemInput(), T - 60 * DAY);
      const fahren = createItem(services.db, verbInput(), T - 60 * DAY);
      matureItem(services, wohnung);
      matureItem(services, fahren);
      const targets = [wohnung, fahren].map((itemId) => ({
        cardId: cardOf(services, itemId, 'produce').id,
        itemId,
        word: itemId === wohnung ? 'die Wohnung' : 'fahren',
        meaning: itemId === wohnung ? 'flat' : 'to drive',
      }));
      const exercise: TranslationExercise = {
        english: 'I like the flat, and we want to drive.',
        reference: 'Ich mag die Wohnung und wir möchten fahren.',
        cues: ['flat', 'to drive'],
        targets,
        grammar: null,
      };
      saveExercises(
        services.db,
        'translation',
        [{ itemIds: [wohnung, fahren], topic: null, payload: exercise, hash: null }],
        GEN,
        T - DAY,
      );
      await render(services);
      await answerItem('Ich mag die Wohnung und wir möchten fahren.');
      expect(await screen.findByText('Saved for grading')).toBeOnTheScreen();

      // The grade rates both words once it lands, so neither comes up on its own.
      await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
      expect(await screen.findByTestId('summary-deferred')).toHaveTextContent(
        '1 translation waits for grading',
      );
      expect(services.db.select().from(review).all()).toEqual([]);
    } finally {
      jest.mocked(useNetInfo).mockReturnValue({
        isConnected: true,
        isInternetReachable: true,
      } as never);
    }
  });

  it('lets you move on when grading is slow', async () => {
    jest.useFakeTimers();
    try {
      // The provider does not answer until the request times out.
      const slow: FetchLike = (_url, init) =>
        new Promise((_, reject) =>
          init.signal?.addEventListener('abort', () => reject(new Error('aborted'))),
        );
      const { services } = await withTranslation(slow);
      await render(services);
      await answerItem('Ich mag die Wohnung');

      expect(await screen.findByTestId('study-grading')).toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: 'Grade later' })).not.toBeOnTheScreen();
      await act(() => jest.advanceTimersByTime(4000));
      await fireEvent.press(screen.getByRole('button', { name: 'Grade later' }));

      expect(await screen.findByText('Saved for grading')).toBeOnTheScreen();
      expect(waitingGrades(services.db)).toHaveLength(1);
      // Let the request time out; the answer keeps waiting for the next try.
      await act(() => jest.advanceTimersByTime(120_000));
      expect(waitingGrades(services.db)).toHaveLength(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('reveals the reference and rates the word Again on Don’t know', async () => {
    const { services } = await withTranslation();
    await render(services);
    await fireEvent.press(await screen.findByRole('button', { name: "Don't know" }));
    expect(await screen.findByText('Here it is')).toBeOnTheScreen();
    expect(screen.getByTestId('feedback-expected')).toHaveTextContent('Ich mag die Wohnung.');
    expect(screen.getByTestId('feedback-rating')).toHaveTextContent('Rated Again');
  });
});

describe('contrast sets in the Study session', () => {
  it('practises two mixed-up words together and rates each one', async () => {
    const { services } = await setup();
    const stellen = createItem(
      services.db,
      verbInput({
        lemma: 'stellen',
        verbPresent3: 'stellt',
        verbPreterite: 'stellte',
        verbParticiple: 'gestellt',
        verbAuxiliary: 'haben',
        separable: false,
        meanings: ['to put (upright)'],
      }),
      T - 60 * DAY,
    );
    const stehen = createItem(
      services.db,
      verbInput({
        lemma: 'stehen',
        verbPresent3: 'steht',
        verbPreterite: 'stand',
        verbParticiple: 'gestanden',
        verbAuxiliary: 'haben',
        separable: false,
        meanings: ['to stand'],
      }),
      T - 60 * DAY,
    );
    matureItem(services, stellen, 5);
    matureItem(services, stehen, 5);
    const a = cardOf(services, stellen, 'produce');
    const b = cardOf(services, stehen, 'produce');
    const items = [
      [0, 'Ich ___ die Vase auf den Tisch.', 'stelle'],
      [1, 'Die Vase ___ auf dem Tisch.', 'steht'],
      [0, 'Wir ___ das Sofa ans Fenster.', 'stellen'],
      [1, 'Das Sofa ___ am Fenster.', 'steht'],
    ].map(([word, sentence, answer]) => ({
      word: word as number,
      sentence: sentence as string,
      hint: word === 0 ? 'put' : 'stands',
      answer: answer as string,
      accepted: [],
      translation: '(translation)',
      explanation: word === 0 ? 'You put something somewhere: stellen.' : 'It stands: stehen.',
      category: 'wrong_word' as const,
    }));
    saveExercises(
      services.db,
      'contrast',
      [
        {
          itemIds: [stellen, stehen],
          topic: null,
          payload: {
            words: [
              { itemId: stellen, cardId: a.id, word: 'stellen', meaning: 'to put' },
              { itemId: stehen, cardId: b.id, word: 'stehen', meaning: 'to stand' },
            ],
            explanation: 'stellen is what you do; stehen is where it is.',
            items,
          },
          hash: null,
        },
      ],
      GEN,
      T - DAY,
    );
    await render(services);

    expect(await screen.findByText('stellen or stehen')).toBeOnTheScreen();
    expect(screen.getByTestId('drill-progress')).toHaveTextContent('Which word? · 1 of 4');
    expect(screen.getByTestId('drill-sentence')).toHaveTextContent(/^Ich ____ die Vase/);
    for (const answer of ['stelle', 'steht', 'stehen', 'steht']) {
      await answerItem(answer);
      await fireEvent.press(screen.getByRole('button', { name: /Next|Finish/ }));
    }

    expect(await screen.findByTestId('feedback-note')).toHaveTextContent(/stehen is where/);
    const ratings = screen.getAllByTestId('feedback-rating').map((n) => n.props.children.join(''));
    expect(ratings).toEqual(['stellen: rated Again', 'stehen: rated Good']);
    const logged = services.db.select().from(review).all();
    expect(logged.map((r) => [r.cardId, r.mode, r.rating])).toEqual([
      [a.id, 'contrast', 1],
      [b.id, 'contrast', 3],
    ]);
    // Your "stehen" for stellen is logged as a mix-up of the two.
    expect(services.db.select().from(mistake).all()[0]).toMatchObject({
      itemId: stellen,
      confusedItemId: stehen,
    });

    // stellen, missed, comes back once; stehen was rated by the set and does not.
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText(/Say it in German|Fill the gap/)).toBeOnTheScreen();
    await answerItem('stellen');
    expect(await screen.findByText('Right!')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByTestId('summary-cards')).toHaveTextContent('3 cards done');
  });
});

describe('mix-ups in the Study session', () => {
  it('calls another deck word a mix-up, not a spelling slip, and logs the pair', async () => {
    const { services } = await setup();
    const verb = (
      lemma: string,
      present3: string,
      preterite: string,
      participle: string,
      en: string,
    ) =>
      createItem(
        services.db,
        verbInput({
          lemma,
          verbPresent3: present3,
          verbPreterite: preterite,
          verbParticiple: participle,
          verbAuxiliary: 'haben',
          separable: false,
          meanings: [en],
        }),
        T - 60 * DAY,
      );
    const stellen = verb('stellen', 'stellt', 'stellte', 'gestellt', 'to put (upright)');
    const stehen = verb('stehen', 'steht', 'stand', 'gestanden', 'to stand');
    // stellen's production card is mature but past its translations: asked as a classic card.
    matureItem(services, stellen);
    services.db
      .update(card)
      .set({ due: T + 20 * DAY })
      .where(eq(card.itemId, stehen))
      .run();
    await render(services);

    expect(await screen.findByText(/Say it in German/)).toBeOnTheScreen();
    await answerItem('stehen');
    expect(await screen.findByText('Not quite')).toBeOnTheScreen();
    expect(
      screen.getByText('stehen is another word (to stand). Here it is stellen.'),
    ).toBeOnTheScreen();
    expect(screen.queryByText(/spelling is off/)).not.toBeOnTheScreen();
    expect(services.db.select().from(mistake).all()).toEqual([
      expect.objectContaining({ itemId: stellen, category: 'wrong_word', confusedItemId: stehen }),
    ]);
  });
});
