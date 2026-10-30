import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { ItemState } from '@/core/cards';
import { lessonLabel, lessonTopics, type Lesson, type Section, type Topic } from '@/curriculum';
import type { Db } from '@/data/db';
import { startTopics, type TopicProgress } from '@/data/repos/curriculum';
import { AppText, type AppTextProps } from '@/ui/AppText';
import { StatePill, stateColors } from '@/ui/controls';
import { fonts, radius, spacing, useTheme } from '@/ui/theme';

/** Topic and lesson screens take a lesson as "A2.1-6" in the URL. */
export function lessonParam(lesson: Pick<Lesson, 'book' | 'number'>): string {
  return `${lesson.book}-${lesson.number}`;
}

export function openTopic(id: string) {
  router.push({ pathname: '/topic/[id]', params: { id } });
}

/** Start these topics, so the practice counts, and practise them now. */
export function practiseTopics(db: Db, ids: readonly string[], now: number) {
  if (ids.length === 0) return;
  startTopics(db, ids, now);
  router.push({ pathname: '/study', params: { topics: ids.join(',') } });
}

export function openLesson(lesson: Pick<Lesson, 'book' | 'number'>) {
  router.push({ pathname: '/lesson/[ref]', params: { ref: lessonParam(lesson) } });
}

/** Momente groups its lessons in modules of three. */
export function moduleOf(lesson: Pick<Lesson, 'number'>): number {
  return Math.ceil(lesson.number / 3);
}

/** Text where **this** is bold, as the topic files mark the part that changes. */
export function RichText({ children, style, ...rest }: AppTextProps & { children: string }) {
  const parts = children.split('**');
  return (
    <AppText style={style} {...rest}>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <Text key={i} style={{ fontFamily: fonts.extrabold }}>
            {part}
          </Text>
        ) : (
          part
        ),
      )}
    </AppText>
  );
}

/** A grammar table, scrolling sideways when it is wider than the phone. */
export function GrammarTable({ rows, testID }: { rows: string[][]; testID?: string }) {
  const theme = useTheme();
  const [head, ...body] = rows;
  const wide = (head?.length ?? 0) > 3;
  const cell = (text: string, key: number, header: boolean) => (
    <View
      key={key}
      style={[
        styles.cell,
        wide ? styles.cellWide : styles.cellFlex,
        { borderColor: theme.border },
        header && { backgroundColor: theme.surfaceAlt },
      ]}
    >
      <RichText variant={header ? 'label' : 'caption'} style={{ color: theme.text }}>
        {text}
      </RichText>
    </View>
  );
  const table = (
    <View style={[styles.table, { borderColor: theme.border }]} testID={testID}>
      {head ? <View style={styles.row}>{head.map((c, i) => cell(c, i, true))}</View> : null}
      {body.map((row, r) => (
        <View key={r} style={styles.row}>
          {row.map((c, i) => cell(c, i, false))}
        </View>
      ))}
    </View>
  );
  return wide ? (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      {table}
    </ScrollView>
  ) : (
    table
  );
}

/** One part of a topic's explanation: text, bullets, a table and examples. */
export function ExplanationSection({ section }: { section: Section }) {
  const theme = useTheme();
  return (
    <View style={{ gap: spacing.sm }}>
      <AppText variant="label" accessibilityRole="header">
        {section.title}
      </AppText>
      {section.text ? <RichText>{section.text}</RichText> : null}
      {section.bullets?.map((b, i) => (
        <View key={i} style={styles.bullet}>
          <AppText style={{ color: theme.primary }}>•</AppText>
          <RichText style={{ flex: 1 }}>{b}</RichText>
        </View>
      ))}
      {section.table ? <GrammarTable rows={section.table} /> : null}
      {section.examples?.map((e, i) => (
        <Example key={i} de={e.de} en={e.en} />
      ))}
    </View>
  );
}

export function Example({ de, en }: { de: string; en: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.example, { borderLeftColor: theme.primary }]}>
      <AppText style={{ fontStyle: 'italic' }}>{de}</AppText>
      {en ? <AppText variant="caption">{en}</AppText> : null}
    </View>
  );
}

/** Where a topic stands: a state pill once started, "not started" before. */
export function TopicStatus({ progress }: { progress: TopicProgress | undefined }) {
  if (!progress) {
    return <AppText variant="caption">not started</AppText>;
  }
  return <StatePill state={progress.state} />;
}

function dotColor(theme: ReturnType<typeof useTheme>, state: ItemState | undefined) {
  return state ? stateColors(theme, state).dot : theme.track;
}

/** A topic in a list: its name, what it is in English, its level and where it stands. */
export function TopicRow({
  topic,
  progress,
  testID,
}: {
  topic: Topic;
  progress: TopicProgress | undefined;
  testID?: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      testID={testID ?? `topic-row-${topic.id}`}
      accessibilityRole="button"
      accessibilityLabel={topic.name}
      onPress={() => openTopic(topic.id)}
      style={({ pressed }) => [
        styles.topicRow,
        {
          borderBottomColor: theme.border,
          backgroundColor: pressed ? theme.surfaceAlt : undefined,
        },
      ]}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="label">{topic.name}</AppText>
        <AppText variant="caption">
          {topic.level} · {topic.label}
        </AppText>
      </View>
      <TopicStatus progress={progress} />
    </Pressable>
  );
}

/** A lesson on the path: its title, themes and the topics that teach its grammar. */
export function LessonCard({
  lesson,
  progress,
  current,
}: {
  lesson: Lesson;
  progress: ReadonlyMap<string, TopicProgress>;
  current: boolean;
}) {
  const theme = useTheme();
  const topics = lessonTopics(lesson);
  return (
    <Pressable
      testID={`lesson-${lessonParam(lesson)}`}
      accessibilityRole="button"
      accessibilityLabel={`${lessonLabel(lesson)}: ${lesson.title}`}
      onPress={() => openLesson(lesson)}
      style={({ pressed }) => [
        styles.lesson,
        {
          borderColor: current ? theme.primary : theme.border,
          backgroundColor: pressed ? theme.surfaceAlt : theme.surface,
          borderWidth: current ? 2 : StyleSheet.hairlineWidth,
        },
      ]}
    >
      <AppText variant="overline" style={{ color: current ? theme.primary : theme.textMuted }}>
        Lektion {lesson.number}
        {current ? ' · 📍 class is here' : ''}
      </AppText>
      <AppText variant="label">{lesson.title}</AppText>
      <AppText variant="caption">{lesson.themes.join(', ')}</AppText>
      <View style={{ gap: 4, marginTop: 4 }}>
        {topics.map((t) => (
          <Pressable
            key={t.id}
            accessibilityRole="button"
            accessibilityLabel={t.name}
            onPress={() => openTopic(t.id)}
            style={styles.lessonTopic}
            hitSlop={4}
          >
            <View
              style={[styles.dot, { backgroundColor: dotColor(theme, progress.get(t.id)?.state) }]}
            />
            <AppText variant="caption" style={{ flex: 1, color: theme.text }}>
              {t.name}
            </AppText>
          </Pressable>
        ))}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  table: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.sm, overflow: 'hidden' },
  row: { flexDirection: 'row' },
  cell: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
  },
  cellFlex: { flex: 1 },
  cellWide: { width: 132 },
  bullet: { flexDirection: 'row', gap: spacing.sm },
  example: { borderLeftWidth: 3, paddingLeft: spacing.md, gap: 2 },
  topicRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  lesson: { borderRadius: radius.md, padding: spacing.md, gap: 2 },
  lessonTopic: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
