import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo } from 'react';
import { ActivityIndicator, View, useColorScheme } from 'react-native';
import { KeyboardProvider } from 'react-native-keyboard-controller';

import { getAppDb } from '@/data/expo-db';
import migrations from '@/data/migrations/migrations';
import { ServicesProvider, type Services } from '@/features/services';
import { expoKeyStore } from '@/llm/expo-key-store';
import { AppText } from '@/ui/AppText';
import { UmlautProvider } from '@/ui/umlaut';
import { palettes } from '@/ui/theme';

export default function RootLayout() {
  const db = getAppDb();
  const { success, error } = useMigrations(db, migrations);
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const palette = palettes[scheme];
  const services = useMemo<Services>(
    () => ({ db, keyStore: expoKeyStore, now: () => new Date() }),
    [db],
  );

  const navTheme = useMemo(() => {
    const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: palette.primary,
        background: palette.background,
        card: palette.background,
        text: palette.text,
        border: palette.border,
      },
    };
  }, [scheme, palette]);

  if (error) {
    return (
      <View
        style={{
          flex: 1,
          padding: 24,
          justifyContent: 'center',
          backgroundColor: palette.background,
        }}
      >
        <AppText variant="heading">Database migration failed</AppText>
        <AppText>{error.message}</AppText>
      </View>
    );
  }
  if (!success) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: palette.background,
        }}
      >
        <ActivityIndicator color={palette.primary} />
      </View>
    );
  }

  return (
    // The app is edge-to-edge on Android, so the bars are translucent.
    <KeyboardProvider statusBarTranslucent navigationBarTranslucent preserveEdgeToEdge>
      <ServicesProvider services={services}>
        <ThemeProvider value={navTheme}>
          <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
          <UmlautProvider>
            <Stack>
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="study" options={{ title: 'Study' }} />
              <Stack.Screen name="add" options={{ title: 'Add a word' }} />
              <Stack.Screen name="paste" options={{ title: 'Paste a list' }} />
              <Stack.Screen name="chapters" options={{ title: 'Chapters' }} />
              <Stack.Screen name="item/[id]" options={{ title: 'Word' }} />
              <Stack.Screen name="edit/[id]" options={{ title: 'Edit word' }} />
              <Stack.Screen name="suggestions" options={{ title: 'Suggested words' }} />
              <Stack.Screen name="usage" options={{ title: 'LLM usage' }} />
              <Stack.Screen name="add-grammar" options={{ title: 'Add a grammar point' }} />
              <Stack.Screen name="weak-spots" options={{ title: 'Weak spots' }} />
              <Stack.Screen name="leeches" options={{ title: 'Leeches' }} />
              <Stack.Screen name="graded" options={{ title: 'Graded translations' }} />
            </Stack>
          </UmlautProvider>
        </ThemeProvider>
      </ServicesProvider>
    </KeyboardProvider>
  );
}
