import { Screen } from '@/ui/layout';

import { LlmSettings } from './LlmSettings';
import { AboutSection, DataSettings, StudySettings } from './StudySettings';

export function SettingsScreen() {
  return (
    <Screen testID="settings-screen">
      <StudySettings />
      <LlmSettings />
      <DataSettings />
      <AboutSection />
    </Screen>
  );
}
