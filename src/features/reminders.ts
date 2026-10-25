import { reminderPlan } from '@/core/reminders';
import type { DbOrTx } from '@/data/db';
import { pulse } from '@/data/repos/progress';
import { getSetting } from '@/data/repos/settings';

import * as Notifications from './notifications';

/**
 * The daily study reminder as local notifications. The app schedules
 * nothing else, so planning again starts by cancelling everything. Errors
 * are swallowed: without notifications the app works just the same.
 */

const CHANNEL_ID = 'study-reminders';

/** Ask for permission to notify, unless it is already granted or was refused for good. */
export async function requestReminderPermission(): Promise<boolean> {
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    if (!current.canAskAgain) return false;
    return (await Notifications.requestPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

let pending: Promise<void> = Promise.resolve();

/**
 * Replace the scheduled reminders with a fresh plan from the settings and
 * the streak as of `now`. Calls run one after another, so two quick ones
 * cannot leave duplicates behind.
 */
export function syncReminders(db: DbOrTx, now: Date): Promise<void> {
  pending = pending.then(() => schedule(db, now)).catch(() => {});
  return pending;
}

async function schedule(db: DbOrTx, now: Date): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
  if (!getSetting(db, 'ui.reminderEnabled')) return;
  // Never prompts: permission is only asked for when you turn reminders on.
  if (!(await Notifications.getPermissionsAsync()).granted) return;
  const channelId = await reminderChannel();
  const plan = reminderPlan(pulse(db, now).streak, getSetting(db, 'ui.reminderHour'), now);
  for (const reminder of plan) {
    await Notifications.scheduleNotificationAsync({
      content: { title: reminder.title, body: reminder.body },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: reminder.date,
        channelId,
      },
    });
  }
}

/**
 * An Android channel of their own, so reminders can be silenced apart
 * from anything else. Expo Go 57 cannot create channels (the call fails
 * natively); there the reminders go to its default channel.
 */
async function reminderChannel(): Promise<string | undefined> {
  try {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Study reminders',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
    return CHANNEL_ID;
  } catch {
    return undefined;
  }
}
