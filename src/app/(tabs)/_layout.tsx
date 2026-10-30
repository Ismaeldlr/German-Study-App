import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';

import { elevation, fonts, useTheme } from '@/ui/theme';

type IconName = keyof typeof Ionicons.glyphMap;

/** A filled icon for the tab you are on, an outline for the others. */
function icon(active: IconName, inactive: IconName) {
  return function TabIcon({
    color,
    size,
    focused,
  }: {
    color: ColorValue;
    size: number;
    focused: boolean;
  }) {
    return (
      <Ionicons
        name={focused ? active : inactive}
        color={typeof color === 'string' ? color : undefined}
        size={size}
      />
    );
  };
}

export default function TabLayout() {
  const theme = useTheme();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.textMuted,
        tabBarLabelStyle: { fontFamily: fonts.bold, fontSize: 11 },
        tabBarStyle: {
          backgroundColor: theme.surface,
          borderTopColor: theme.border,
          ...elevation(theme, 2),
        },
        headerShadowVisible: false,
        headerStyle: { backgroundColor: theme.background },
        headerTitleStyle: { fontFamily: fonts.extrabold, fontSize: 20 },
        sceneStyle: { backgroundColor: theme.background },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Home', headerShown: false, tabBarIcon: icon('home', 'home-outline') }}
      />
      <Tabs.Screen
        name="grammar"
        options={{ title: 'Grammar', tabBarIcon: icon('school', 'school-outline') }}
      />
      <Tabs.Screen
        name="progress"
        options={{
          title: 'Progress',
          headerShown: false,
          tabBarIcon: icon('trophy', 'trophy-outline'),
        }}
      />
      <Tabs.Screen
        name="words"
        options={{ title: 'Words', tabBarIcon: icon('book', 'book-outline') }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: 'Settings', tabBarIcon: icon('settings', 'settings-outline') }}
      />
    </Tabs>
  );
}
