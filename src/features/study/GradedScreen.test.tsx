import { useNetInfo } from '@react-native-community/netinfo';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { and, eq } from 'drizzle-orm';

import type { TranslationExercise } from '@/core/translation';
import { savePendingGrade, unseenGrades, waitingGrades } from '@/data/repos/grading';
import { createItem } from '@/data/repos/items';
import { setSetting } from '@/data/repos/settings';
import { card } from '@/data/schema';
import { itemInput } from '@/data/testing/fixtures';
import { createMemoryKeyStore } from '@/llm/key-store';
import { gradeWaiting } from '@/jobs/grading';
import { createMockLlmFetch } from '@/llm/testing/mock-llm-fetch';

import { HomeScreen } from '../home/HomeScreen';
import { ServicesProvider, type Services } from '../services';
import { createTestServices, renderWithServices } from '../testing/render-with-services';
import { GradedScreen } from './GradedScreen';

const T = new Date(2026, 9, 19, 9).getTime();

async function setup() {
  const s = await createTestServices({
    now: () => new Date(T),
    keyStore: createMemoryKeyStore({ custom: 'test-key' }),
    fetch: createMockLlmFetch().fetch,
  });
  setSetting(s.db, 'llm.provider', 'custom');
  setSetting(s.db, 'llm.customBaseUrl', 'http://mock.test/v1');
  setSetting(s.db, 'llm.model', 'mock-mini');
  const wohnung = createItem(s.db, itemInput(), T - 1000);
  const produce = s.db
    .select()
    .from(card)
    .where(and(eq(card.itemId, wohnung), eq(card.type, 'produce')))
    .get()!;
  const exercise: TranslationExercise = {
    english: 'I like the flat.',
    reference: 'Ich mag die Wohnung.',
    cues: ['flat'],
    targets: [{ cardId: produce.id, itemId: wohnung, word: 'die Wohnung', meaning: 'flat' }],
    grammar: null,
  };
  savePendingGrade(s.db, {
    exerciseId: null,
    exercise,
    answer: 'Ich mag das Haus.',
    responseMs: 8000,
    answeredAt: T - 500,
  });
  return s;
}

const home = (s: Services) => renderWithServices(<HomeScreen />, s);

describe('Graded translations', () => {
  it('grades waiting answers on request and shows the feedback', async () => {
    const s = await setup();
    await renderWithServices(<GradedScreen />, s);
    expect(screen.getByTestId('graded-waiting')).toHaveTextContent(/1 answer waits/);

    await fireEvent.press(screen.getByRole('button', { name: 'Grade now' }));
    expect(await screen.findByText('I like the flat.')).toBeOnTheScreen();
    expect(screen.queryByTestId('graded-waiting')).not.toBeOnTheScreen();
    expect(screen.getByText(/You wrote: Ich mag das Haus\./)).toBeOnTheScreen();
    expect(screen.getByText(/die Wohnung: not used/)).toBeOnTheScreen();
    expect(waitingGrades(s.db)).toEqual([]);
  });

  it('tells you on Home about answers waiting, then about new grades', async () => {
    const s = await setup();
    // Opening Home online grades waiting answers right away; offline they wait.
    const offline: Services = {
      ...s,
      fetch: async () => {
        throw new TypeError('Network request failed');
      },
    };
    await home(offline);
    expect(screen.getByTestId('waiting-banner')).toHaveTextContent(/1 translation waits/);
    expect(waitingGrades(s.db)).toHaveLength(1);
    await screen.unmount();

    await gradeWaiting(s);
    await home(s);
    expect(screen.getByTestId('graded-banner')).toHaveTextContent(/1 translation graded/);
    await screen.unmount();

    // Opening the list marks them seen.
    await renderWithServices(<GradedScreen />, s);
    expect(screen.getByText(/^New · /)).toBeOnTheScreen();
    expect(unseenGrades(s.db)).toEqual([]);
  });

  it('grades waiting answers as soon as the phone is back online', async () => {
    const s = await setup();
    const network = (connected: boolean) =>
      jest.mocked(useNetInfo).mockReturnValue({
        isConnected: connected,
        isInternetReachable: connected,
      } as never);
    network(false);
    try {
      await home(s);
      expect(waitingGrades(s.db)).toHaveLength(1);
      network(true);
      await screen.rerender(
        <ServicesProvider services={s}>
          <HomeScreen />
        </ServicesProvider>,
      );
      await waitFor(() => expect(waitingGrades(s.db)).toEqual([]));
      expect(await screen.findByTestId('graded-banner')).toBeOnTheScreen();
    } finally {
      network(true);
    }
  });
});
