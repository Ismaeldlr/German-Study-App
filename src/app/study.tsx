import { useLocalSearchParams } from 'expo-router';

import { MISTAKE_CATEGORIES } from '@/core/model';
import { StudyScreen } from '@/features/study/StudyScreen';

/**
 * `/study` runs the daily session; `/study?focus=article` drills one weak
 * spot; `/study?topics=genus,dativ` practises those grammar topics.
 */
export default function StudyRoute() {
  const { focus, topics } = useLocalSearchParams<{ focus?: string; topics?: string }>();
  const chosen = topics ? topics.split(',').filter(Boolean) : null;
  return (
    <StudyScreen
      focus={MISTAKE_CATEGORIES.find((c) => c === focus) ?? null}
      topics={chosen?.length ? chosen : null}
    />
  );
}
