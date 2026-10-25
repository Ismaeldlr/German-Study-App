import * as Haptics from 'expo-haptics';

/**
 * Taps you can feel on right and wrong answers. A setting turns them off;
 * the root layout keeps `setHapticsEnabled` in sync with it. Failures are
 * ignored: a phone without a vibration motor just stays still.
 */

let enabled = true;

export function setHapticsEnabled(value: boolean): void {
  enabled = value;
}

function run(effect: () => Promise<void>): void {
  if (!enabled) return;
  try {
    void effect().catch(() => {});
  } catch {
    // No haptics on this device.
  }
}

export const haptics = {
  tap: () => run(() => Haptics.selectionAsync()),
  success: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  warning: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  error: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
  celebrate: () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)),
};
