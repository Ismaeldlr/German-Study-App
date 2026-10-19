import { router } from 'expo-router';
import { ScrollView, View } from 'react-native';

import { chapterLabel, listChapters } from '@/data/repos/chapters';
import { AppText } from '@/ui/AppText';
import { Chip } from '@/ui/controls';

import { useServices } from '../services';
import { useLiveQuery } from '../use-live-query';

/** Pick the chapter a word (or a whole pasted batch) lands in. */
export function ChapterPicker({
  value,
  onChange,
  label = 'Chapter',
}: {
  value: number | null;
  onChange: (chapterId: number | null) => void;
  label?: string;
}) {
  const { db } = useServices();
  const chapters = useLiveQuery(() => listChapters(db), ['chapter']);
  return (
    <View style={{ gap: 8 }}>
      <AppText variant="label">{label}</AppText>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Chip
            testID="chapter-none"
            label="No chapter"
            selected={value === null}
            onPress={() => onChange(null)}
          />
          {chapters.map((c) => (
            <Chip
              key={c.id}
              testID={`chapter-${c.id}`}
              label={chapterLabel(c)}
              selected={value === c.id}
              onPress={() => onChange(c.id)}
            />
          ))}
          <Chip
            testID="chapter-manage"
            label="+ Chapters"
            selected={false}
            onPress={() => router.push('/chapters')}
          />
        </View>
      </ScrollView>
    </View>
  );
}
