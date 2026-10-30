import { router, Stack } from 'expo-router';
import { View } from 'react-native';

import { getLesson, lessonTopics, nextLesson } from '@/curriculum';
import {
  currentLesson,
  setCurrentLesson,
  startTopics,
  topicProgress,
} from '@/data/repos/curriculum';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { Banner, Screen, Section } from '@/ui/layout';
import { spacing } from '@/ui/theme';

import { useServices } from '../services';
import { useLiveQuery } from '../use-live-query';
import { moduleOf, openLesson, practiseTopics, TopicRow } from './parts';

/**
 * One Momente lesson: its themes, the grammar it teaches and the topics
 * that practise it. Practise the whole lesson, add it to your reviews, or
 * tell the app that class is on it now.
 */
export function LessonScreen({ lessonRef }: { lessonRef: string }) {
  const { db, now } = useServices();
  const progress = useLiveQuery(() => topicProgress(db), ['item', 'card']);
  const current = useLiveQuery(() => currentLesson(db), ['settings', 'chapter']);
  const [book, number] = lessonRef.split('-');
  const lesson = getLesson(`${book}/${number}`);

  if (!lesson) {
    return (
      <Screen testID="lesson-missing">
        <Stack.Screen options={{ title: 'Lektion' }} />
        <AppText>This lesson does not exist.</AppText>
        <Button label="Back" variant="secondary" onPress={() => router.back()} />
      </Screen>
    );
  }

  const topics = lessonTopics(lesson);
  const ids = topics.map((t) => t.id);
  const notStarted = topics.filter((t) => !progress.has(t.id));
  const isCurrent = current?.book === lesson.book && current.number === lesson.number;
  const next = nextLesson(lesson);
  const time = () => now().getTime();

  return (
    <Screen testID="lesson-screen">
      <Stack.Screen options={{ title: `Lektion ${lesson.number}` }} />
      <View style={{ gap: spacing.xs }}>
        <AppText variant="overline">
          Momente {lesson.book} · Modul {moduleOf(lesson)}
        </AppText>
        <AppText variant="title" testID="lesson-title">
          {lesson.title}
        </AppText>
        <AppText variant="caption">{lesson.themes.join(' · ')}</AppText>
      </View>

      {isCurrent ? (
        <Banner tone="info" testID="lesson-current">
          <AppText>📍 Class is on this lesson.</AppText>
        </Banner>
      ) : null}

      <Section title="Grammatik" icon="📖" testID="lesson-grammar">
        {lesson.grammar.map((g, i) => (
          <AppText key={i}>• {g}</AppText>
        ))}
      </Section>

      <Section title="Practise it" icon="🧩" testID="lesson-topics">
        {topics.map((t) => (
          <TopicRow key={t.id} topic={t} progress={progress.get(t.id)} />
        ))}
        <Button
          testID="lesson-practise"
          size="large"
          icon="play"
          label={topics.length === 1 ? 'Practise this lesson' : `Practise all ${topics.length}`}
          onPress={() => practiseTopics(db, ids, time())}
        />
        {notStarted.length ? (
          <Button
            testID="lesson-add"
            icon="add"
            label={
              notStarted.length === topics.length
                ? 'Add to my reviews'
                : 'Add the rest to my reviews'
            }
            variant="secondary"
            onPress={() =>
              startTopics(
                db,
                notStarted.map((t) => t.id),
                time(),
              )
            }
          />
        ) : null}
        {!isCurrent ? (
          <Button
            testID="lesson-set-current"
            icon="location-outline"
            label="My class is on this lesson"
            variant="ghost"
            onPress={() => setCurrentLesson(db, lesson)}
          />
        ) : null}
      </Section>

      {next ? (
        <Button
          testID="lesson-next"
          icon="arrow-forward"
          label={`Next: Lektion ${next.number} (${next.book})`}
          variant="secondary"
          onPress={() => openLesson(next)}
        />
      ) : null}
    </Screen>
  );
}
