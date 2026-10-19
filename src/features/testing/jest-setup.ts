/**
 * Screen tests render screens on their own, outside a navigator. Routing
 * calls become spies so tests can assert where a screen tried to go.
 */

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
