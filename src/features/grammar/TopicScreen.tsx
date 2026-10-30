import { router, Stack } from 'expo-router';
import { Pressable, View } from 'react-native';

import {
  getBlock,
  getLesson,
  getTopic,
  lessonLabel,
  topicsInBlock,
  type Lesson,
} from '@/curriculum';
import { startTopic, stopTopic, topicProgress } from '@/data/repos/curriculum';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { Row, Screen, Section } from '@/ui/layout';
import { spacing, useTheme } from '@/ui/theme';

import { useServices } from '../services';
import { useLiveQuery } from '../use-live-query';
import { describeDue } from '../words/describe';
import {
  Example,
  ExplanationSection,
  openLesson,
  practiseTopics,
  RichText,
  TopicRow,
  TopicStatus,
} from './parts';

/**
 * One grammar topic: the rule, tables and examples, where Momente teaches
 * it, and buttons to practise it now or keep it in your reviews.
 */
export function TopicScreen({ topicId }: { topicId: string }) {
  const { db, now } = useServices();
  const theme = useTheme();
  const progress = useLiveQuery(() => topicProgress(db), ['item', 'card']);
  const topic = getTopic(topicId);

  if (!topic) {
    return (
      <Screen testID="topic-missing">
        <Stack.Screen options={{ title: 'Grammar' }} />
        <AppText>This grammar topic does not exist.</AppText>
        <Button label="Back" variant="secondary" onPress={() => router.back()} />
      </Screen>
    );
  }

  const mine = progress.get(topic.id);
  const block = getBlock(topic.block);
  const lessons = topic.lessons.map(getLesson).filter((l): l is Lesson => l !== undefined);
  const related = topicsInBlock(topic.block).filter((t) => t.id !== topic.id);
  const time = () => now().getTime();

  return (
    <Screen testID="topic-screen">
      <Stack.Screen options={{ title: block.name }} />
      <View style={{ gap: spacing.xs }}>
        <AppText variant="overline">
          {topic.level} · {block.icon} {block.name}
        </AppText>
        <AppText variant="title" testID="topic-name">
          {topic.name}
        </AppText>
        <AppText variant="label" color="textMuted">
          {topic.label}
        </AppText>
      </View>

      <Section testID="topic-status">
        <Row>
          {mine ? <TopicStatus progress={mine} /> : null}
          <AppText variant="caption" style={{ flex: 1 }}>
            {!mine
              ? 'Not in your reviews yet.'
              : mine.state === 'suspended'
                ? 'Taken out of your reviews.'
                : mine.due === null
                  ? 'In your reviews: it comes up as a new grammar point.'
                  : `In your reviews: ${describeDue(mine.due, time())}.`}
          </AppText>
        </Row>
        <Button
          testID="topic-practise"
          size="large"
          icon="play"
          label="Practise now"
          onPress={() => practiseTopics(db, [topic.id], time())}
        />
        {!mine || mine.state === 'suspended' ? (
          <Button
            testID="topic-add"
            icon="add"
            label={mine ? 'Back into my reviews' : 'Add to my reviews'}
            variant="secondary"
            onPress={() => startTopic(db, topic.id, time())}
          />
        ) : (
          <Button
            testID="topic-stop"
            label="Stop reviewing it"
            variant="ghost"
            onPress={() => stopTopic(db, topic.id, time())}
          />
        )}
      </Section>

      <Section title="In short" icon="💡" testID="topic-summary">
        <RichText>{topic.summary}</RichText>
      </Section>

      <Section title="The rule" icon="📘" testID="topic-explanation">
        {topic.sections.map((section, i) => (
          <ExplanationSection key={i} section={section} />
        ))}
      </Section>

      <Section title="Beispiele" icon="💬" testID="topic-examples">
        {topic.examples.map((e, i) => (
          <Example key={i} de={e.de} en={e.en} />
        ))}
      </Section>

      {lessons.length ? (
        <Section title="In Momente" icon="📖" testID="topic-lessons">
          {lessons.map((l) => (
            <Pressable
              key={`${l.book}/${l.number}`}
              accessibilityRole="button"
              onPress={() => openLesson(l)}
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, gap: 2 })}
            >
              <AppText variant="label" style={{ color: theme.primary }}>
                {lessonLabel(l)}
              </AppText>
              <AppText variant="caption">{l.title}</AppText>
            </Pressable>
          ))}
        </Section>
      ) : null}

      {related.length ? (
        <Section title={`More ${block.name}`} icon={block.icon} testID="topic-related">
          {related.map((t) => (
            <TopicRow key={t.id} topic={t} progress={progress.get(t.id)} />
          ))}
        </Section>
      ) : null}
    </Screen>
  );
}
