import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { eq } from 'drizzle-orm';

import { createItem } from '@/data/repos/items';
import { getSetting } from '@/data/repos/settings';
import { recordReview } from '@/data/repos/study';
import { card } from '@/data/schema';
import { itemInput } from '@/data/testing/fixtures';

import * as Notifications from '../notifications';
import { createTestServices, renderWithServices } from '../testing/render-with-services';
import { SettingsScreen } from './SettingsScreen';

type Permission = Awaited<ReturnType<typeof Notifications.getPermissionsAsync>>;
const permission = (granted: boolean, canAskAgain: boolean) =>
  ({
    granted,
    canAskAgain,
    status: granted ? 'granted' : 'denied',
    expires: 'never',
  }) as Permission;

/** Test services at 9:00 on 19 October, with a card answered on each of `days` (October dates). */
async function studiedOn(days: number[], hour = 9) {
  const services = await createTestServices();
  const id = createItem(services.db, itemInput(), new Date(2026, 9, 1).getTime());
  const [first] = services.db.select().from(card).where(eq(card.itemId, id)).all();
  for (const day of days) {
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
      new Date(2026, 9, day, hour).getTime(),
    );
  }
  return services;
}

async function scheduled() {
  const requests = await Notifications.getAllScheduledNotificationsAsync();
  return requests.map((r) => ({
    ...(r.content as { title: string; body: string }),
    date: (r.trigger as unknown as { date: Date }).date,
  }));
}

const turnOn = () => fireEvent(screen.getByLabelText('Daily reminder'), 'valueChange', true);

describe('Daily reminder setting', () => {
  it('asks for permission only when turned on, then plans a week of reminders', async () => {
    jest.mocked(Notifications.getPermissionsAsync).mockResolvedValueOnce(permission(false, true));
    const services = await studiedOn([16, 17, 18]);
    await renderWithServices(<SettingsScreen />, services);
    expect(await screen.findByLabelText('Daily reminder')).toBeOnTheScreen();
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(screen.queryByTestId('reminder-next')).not.toBeOnTheScreen();

    await turnOn();

    expect(Notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(getSetting(services.db, 'ui.reminderEnabled')).toBe(true);
    expect(await screen.findByTestId('reminder-next')).toHaveTextContent(
      /^Next one today at 19:00/,
    );
    await waitFor(async () => expect(await scheduled()).toHaveLength(7));
    // The test deck's word was never introduced: its gender card is the one answered.
    expect((await scheduled())[0]).toEqual({
      title: 'Deine Wörter warten 🔥',
      body: '1 new word is waiting. Keep your 3-day streak going.',
      date: new Date(2026, 9, 19, 19),
    });
  });

  it('skips today once you studied', async () => {
    const services = await studiedOn([17, 18, 19], 8);
    await renderWithServices(<SettingsScreen />, services);
    await turnOn();

    expect(await screen.findByTestId('reminder-next')).toHaveTextContent(
      /^Next one tomorrow at 19:00/,
    );
    await waitFor(async () => expect(await scheduled()).toHaveLength(7));
    expect((await scheduled())[0]).toMatchObject({
      body: '1 new word is waiting. Keep your 3-day streak going.',
      date: new Date(2026, 9, 20, 19),
    });
  });

  it('moves the reminders to another hour', async () => {
    const services = await studiedOn([]);
    await renderWithServices(<SettingsScreen />, services);
    await turnOn();

    await fireEvent.press(await screen.findByRole('radio', { name: '21:00' }));

    expect(getSetting(services.db, 'ui.reminderHour')).toBe(21);
    expect(screen.getByTestId('reminder-next')).toHaveTextContent(/^Next one today at 21:00/);
    await waitFor(async () =>
      expect((await scheduled())[0]).toEqual({
        title: 'Deine Wörter warten 📚',
        body: '1 new word is waiting. A few minutes is all it takes to start a streak.',
        date: new Date(2026, 9, 19, 21),
      }),
    );
  });

  it('adds an evening reminder that names the reviews waiting', async () => {
    const services = await studiedOn([16, 17, 18]);
    const t = services.now().getTime();
    services.db
      .update(card)
      .set({ state: 2, stability: 3, difficulty: 5, due: t - 3600_000, lastReview: t - 86_400_000 })
      .run();
    await renderWithServices(<SettingsScreen />, services);
    await turnOn();
    await fireEvent(
      screen.getByLabelText('Again at 21:00 if I have not studied'),
      'valueChange',
      true,
    );

    expect(getSetting(services.db, 'ui.eveningReminder')).toBe(true);
    await waitFor(async () => expect(await scheduled()).toHaveLength(14));
    const [first, second] = await scheduled();
    expect(first).toMatchObject({
      body: '4 reviews are waiting. Keep your 3-day streak going.',
      date: new Date(2026, 9, 19, 19),
    });
    expect(second).toMatchObject({
      title: 'Noch Zeit heute 🌙',
      date: new Date(2026, 9, 19, 21),
    });

    // A 21:00 reminder has no evening one after it.
    await fireEvent.press(screen.getByRole('radio', { name: '21:00' }));
    expect(screen.queryByLabelText('Again at 21:00 if I have not studied')).not.toBeOnTheScreen();
    await waitFor(async () => expect(await scheduled()).toHaveLength(7));
  });

  it('cancels the reminders when turned off', async () => {
    const services = await studiedOn([18]);
    await renderWithServices(<SettingsScreen />, services);
    await turnOn();
    await waitFor(async () => expect(await scheduled()).toHaveLength(7));

    await fireEvent(screen.getByLabelText('Daily reminder'), 'valueChange', false);

    expect(getSetting(services.db, 'ui.reminderEnabled')).toBe(false);
    await waitFor(async () => expect(await scheduled()).toHaveLength(0));
  });

  it('stays off and says why when notifications are blocked', async () => {
    jest.mocked(Notifications.getPermissionsAsync).mockResolvedValueOnce(permission(false, false));
    jest.mocked(Notifications.requestPermissionsAsync).mockClear();
    const services = await studiedOn([18]);
    await renderWithServices(<SettingsScreen />, services);
    await turnOn();

    expect(await screen.findByTestId('reminder-blocked')).toHaveTextContent(
      /Notifications are off for this app/,
    );
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(getSetting(services.db, 'ui.reminderEnabled')).toBe(false);
    expect(screen.getByLabelText('Daily reminder')).toHaveProp('value', false);
  });
});
