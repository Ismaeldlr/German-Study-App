/**
 * Screen tests render screens on their own, outside a navigator. Routing
 * calls become spies so tests can assert where a screen tried to go.
 */
import { AccessibilityInfo } from 'react-native';

// Tests run with Reduce Motion on: everything renders in its final state at
// once, and no animation frame updates a component outside act().
jest.mocked(AccessibilityInfo.isReduceMotionEnabled).mockResolvedValue(true);

jest.mock('expo-router', () => {
  const router = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn() };
  return {
    router,
    useRouter: () => router,
    useLocalSearchParams: () => ({}),
    Link: ({ children }: { children: unknown }) => children,
    Stack: { Screen: () => null },
    Tabs: { Screen: () => null },
  };
});

// Local notifications go to an in-memory schedule that tests can read back.
// Permission is granted unless a test says otherwise.
jest.mock('@/features/notifications', () => {
  const scheduled: { content: unknown; trigger: unknown }[] = [];
  const granted = { granted: true, canAskAgain: true, status: 'granted', expires: 'never' };
  return {
    AndroidImportance: { DEFAULT: 3 },
    SchedulableTriggerInputTypes: { DAILY: 'daily', DATE: 'date' },
    getPermissionsAsync: jest.fn(async () => granted),
    requestPermissionsAsync: jest.fn(async () => granted),
    setNotificationChannelAsync: jest.fn(async () => null),
    scheduleNotificationAsync: jest.fn(async (request: { content: unknown; trigger: unknown }) => {
      scheduled.push(request);
      return `reminder-${scheduled.length}`;
    }),
    cancelAllScheduledNotificationsAsync: jest.fn(async () => {
      scheduled.length = 0;
    }),
    getAllScheduledNotificationsAsync: jest.fn(async () => [...scheduled]),
  };
});

jest.mock('@react-native-community/netinfo', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-community/netinfo/jest/netinfo-mock.js'),
);

// Tests behave as if the keyboard opens whenever a field has focus.
jest.mock('react-native-keyboard-controller', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mock = require('react-native-keyboard-controller/jest');
  const state = { isVisible: true, height: 300 };
  return {
    ...mock,
    useKeyboardState: (selector?: (s: typeof state) => unknown) =>
      selector ? selector(state) : state,
  };
});

jest.mock(
  'react-native-safe-area-context',
  () =>
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('react-native-safe-area-context/jest/mock').default,
);
