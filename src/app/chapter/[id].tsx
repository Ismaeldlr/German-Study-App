import { useLocalSearchParams } from 'expo-router';

import { ChapterScreen } from '@/features/chapters/ChapterScreen';

export default function ChapterRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ChapterScreen key={id} chapterId={Number(id)} />;
}
