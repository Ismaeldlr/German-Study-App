import { fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { eq } from 'drizzle-orm';

import { DAY_MS } from '@/core/time';
import { createItem } from '@/data/repos/items';
import { getSetting } from '@/data/repos/settings';
import { recordReview } from '@/data/repos/study';
import { card } from '@/data/schema';
import { itemInput } from '@/data/testing/fixtures';
import type { Services } from '@/features/services';

import { HomeScreen } from '../home/HomeScreen';
import { SettingsScreen } from '../settings/SettingsScreen';
import { createTestServices, renderWithServices } from '../testing/render-with-services';
import { ProgressScreen } from './ProgressScreen';

/** A deck answered once a day for the `days` days before today. */
async function studied(days: number): Promise<Services> {
  const services = await createTestServices();
  const today = services.now().getTime();
  const id = createItem(services.db, itemInput(), today - 30 * DAY_MS);
  const [first] = services.db.select().from(card).where(eq(card.itemId, id)).all();
  for (let d = days; d >= 1; d--) {
    recordReview(
      services.db,
      {
        cardId: first.id,
        rating: 3,
        mode: 'classic',
        responseMs: 2000,
        answer: 'x',
        correct: true,
      },
      today - d * DAY_MS,
    );
  }
  return services;
}

describe('Progress screen', () => {
  it('shows the level, the streak and the badges you earned', async () => {
    await renderWithServices(<ProgressScreen />, await studied(3));

    expect(screen.getByTestId('progress-level')).toHaveTextContent(/Level 1.*Neuling.*30 XP/);
    expect(screen.getByTestId('progress-streak')).toHaveTextContent(/3.*current/);
    expect(screen.getByLabelText(/Auf Kurs: Study 3 days in a row, unlocked/)).toBeOnTheScreen();
    expect(screen.getByLabelText('Eine Woche: Study 7 days in a row')).toBeOnTheScreen();
    expect(screen.getByTestId('progress-activity')).toHaveTextContent(/3 cards answered on 3 days/);
  });
});

describe('Home screen: streak and goal', () => {
  it('asks you to keep a streak alive', async () => {
    await renderWithServices(<HomeScreen />, await studied(4));

    expect(screen.getByTestId('home-streak')).toHaveTextContent(/4day streak/);
    expect(screen.getByTestId('home-week')).toHaveTextContent(/Study today to keep your 4 days/);
    expect(screen.getByRole('button', { name: 'Study' })).toBeOnTheScreen();
  });

  it('points to your progress once nothing is left', async () => {
    const services = await studied(2);
    services.db.update(card).set({ suspended: true }).run();
    await renderWithServices(<HomeScreen />, services);

    expect(screen.queryByRole('button', { name: 'Study' })).not.toBeOnTheScreen();
    expect(screen.getByText(/Alles erledigt!/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'See your progress' }));
    expect(router.push).toHaveBeenCalledWith('/progress');
  });
});

describe('Settings: daily goal', () => {
  it('picks a goal preset', async () => {
    const services = await renderWithServices(<SettingsScreen />);
    await fireEvent.press(await screen.findByRole('radio', { name: 'Serious' }));
    expect(getSetting(services.db, 'study.dailyGoalXp')).toBe(200);
    expect(screen.getByText(/200 XP a day, about 7 min/)).toBeOnTheScreen();
  });
});
