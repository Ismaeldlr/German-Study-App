import { useLocalSearchParams } from 'expo-router';

import { MISTAKE_CATEGORIES } from '@/core/model';
import { StudyScreen } from '@/features/study/StudyScreen';

/** `/study` runs the daily session; `/study?focus=article` drills one weak spot. */
export default function StudyRoute() {
  const { focus } = useLocalSearchParams<{ focus?: string }>();
  return <StudyScreen focus={MISTAKE_CATEGORIES.find((c) => c === focus) ?? null} />;
}
