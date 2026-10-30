import { useLocalSearchParams } from 'expo-router';

import { TopicScreen } from '@/features/grammar/TopicScreen';

export default function TopicRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <TopicScreen key={id} topicId={id} />;
}
