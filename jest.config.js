const moduleNameMapper = { '^@/(.*)$': '<rootDir>/src/$1' };

/** @type {import('jest').Config} */
module.exports = {
  projects: [
    {
      // Pure TypeScript: scheduling, LLM layer, repositories on sql.js. Runs in milliseconds.
      displayName: 'logic',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/src/**/*.test.ts'],
      transform: { '^.+\\.[jt]sx?$': 'babel-jest' },
      moduleNameMapper,
    },
    {
      // Screens through React Native Testing Library.
      displayName: 'screens',
      preset: 'jest-expo',
      setupFiles: ['<rootDir>/src/features/testing/jest-setup.ts'],
      testMatch: ['<rootDir>/src/**/*.test.tsx'],
      moduleNameMapper,
      transformIgnorePatterns: [
        'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*)',
      ],
    },
  ],
};
