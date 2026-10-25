import { Nunito_400Regular } from '@expo-google-fonts/nunito/400Regular';
import { Nunito_400Regular_Italic } from '@expo-google-fonts/nunito/400Regular_Italic';
import { Nunito_600SemiBold } from '@expo-google-fonts/nunito/600SemiBold';
import { Nunito_700Bold } from '@expo-google-fonts/nunito/700Bold';
import { Nunito_800ExtraBold } from '@expo-google-fonts/nunito/800ExtraBold';
import { Nunito_900Black } from '@expo-google-fonts/nunito/900Black';
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo } from 'react';
import { ActivityIndicator, AppState, View, useColorScheme } from 'react-native';
import { KeyboardProvider } from 'react-native-keyboard-controller';

import { getAppDb } from '@/data/expo-db';
import migrations from '@/data/migrations/migrations';
import { getSetting } from '@/data/repos/settings';
import { syncReminders } from '@/features/reminders';
import { ServicesProvider, useServices, type Services } from '@/features/services';
import { useLiveQuery } from '@/features/use-live-query';
import { expoKeyStore } from '@/llm/expo-key-store';
import { AppText } from '@/ui/AppText';
import { setHapticsEnabled } from '@/ui/haptics';
import { UmlautProvider } from '@/ui/umlaut';
import { fonts, palettes } from '@/ui/theme';

export default function RootLayout() {
  const db = getAppDb();
  const { success, error } = useMigrations(db, migrations);
  // A missing font falls back to the system one, so a load error does not block the app.
  const [fontsLoaded, fontError] = useFonts({
    Nunito_400Regular,
    Nunito_400Regular_Italic,
    Nunito_600SemiBold,
    Nunito_700Bold,
    Nunito_800ExtraBold,
    Nunito_900Black,
  });
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
  if (!success || !(fontsLoaded || fontError)) {
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
          <HapticsSetting />
          <ReminderSync />
          <UmlautProvider>
            <Stack
              screenOptions={{
                headerShadowVisible: false,
                headerTitleStyle: { fontFamily: fonts.extrabold, fontSize: 18 },
                headerTintColor: palette.primary,
                headerBackButtonDisplayMode: 'minimal',
                contentStyle: { backgroundColor: palette.background },
              }}
            >
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

/** Keeps the haptics module in step with the setting. */
function HapticsSetting() {
  const { db } = useServices();
  const enabled = useLiveQuery(() => getSetting(db, 'ui.haptics'), ['settings']);
  useEffect(() => setHapticsEnabled(enabled), [enabled]);
  return null;
}

/** Plans the study reminders again when the app opens and whenever it comes back to the front. */
function ReminderSync() {
  const { db, now } = useServices();
  useEffect(() => {
    void syncReminders(db, now());
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void syncReminders(db, now());
    });
    return () => subscription.remove();
  }, [db, now]);
  return null;
}
