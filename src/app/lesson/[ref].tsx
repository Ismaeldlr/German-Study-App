import { useLocalSearchParams } from 'expo-router';

import { LessonScreen } from '@/features/grammar/LessonScreen';

/** `/lesson/A2.1-6`: lesson 6 of Momente A2.1. */
export default function LessonRoute() {
  const { ref } = useLocalSearchParams<{ ref: string }>();
  return <LessonScreen key={ref} lessonRef={ref} />;
}
