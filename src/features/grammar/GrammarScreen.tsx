import { useState } from 'react';
import { View } from 'react-native';

import { plural } from '@/core/format';
import {
  BLOCKS,
  BOOKS,
  lessonLabel,
  lessonTopics,
  searchTopics,
  topicsInBlock,
  TOPICS,
  type Level,
  type Topic,
} from '@/curriculum';
import { currentLesson, topicProgress } from '@/data/repos/curriculum';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { Chip } from '@/ui/controls';
import { Row, Screen, Section, Segmented } from '@/ui/layout';
import { ProgressBar } from '@/ui/motion';
import { TextField } from '@/ui/TextField';
import { spacing, useTheme } from '@/ui/theme';

import { useServices } from '../services';
import { useLiveQuery } from '../use-live-query';
import { LessonCard, moduleOf, openLesson, practiseTopics, TopicRow } from './parts';

type Mode = 'path' | 'topics';

const LEVEL_FILTERS: { value: Level | null; label: string }[] = [
  { value: null, label: 'All levels' },
  { value: 'A1', label: 'A1' },
  { value: 'A2', label: 'A2' },
  { value: 'B1', label: 'B1' },
];

/**
 * The built-in grammar path: every grammar point Momente teaches from A1
 * to B1, with an explanation and practice that work offline. Follow the
 * book lesson by lesson, or pick a subject (Konjunktiv II, Nebensätze …)
 * and practise it today.
 */
export function GrammarScreen() {
  const { db, now } = useServices();
  const theme = useTheme();
  const progress = useLiveQuery(() => topicProgress(db), ['item', 'card']);
  const lesson = useLiveQuery(() => currentLesson(db), ['settings', 'chapter']);
  const [view, setView] = useState<Mode>('path');
  const [level, setLevel] = useState<Level | null>(null);
  const [query, setQuery] = useState('');

  const visible = TOPICS.filter((t) => !level || t.level === level);
  const found = query.trim() ? searchTopics(query, visible) : null;
  const started = TOPICS.filter((t) => progress.has(t.id)).length;

  return (
    <Screen testID="grammar-screen">
      <Section testID="grammar-intro">
        <AppText variant="heading">Grammatik nach Momente</AppText>
        <AppText>
          {TOPICS.length} topics from A1 to B1, each with an explanation and its own practice.
          Everything works offline, with no API key.
        </AppText>
        <AppText variant="caption" testID="grammar-started">
          {started
            ? `${plural(started, 'topic')} in your reviews.`
            : 'Practise a topic to add it to your reviews.'}
        </AppText>
        {lesson ? (
          <Button
            testID="grammar-current-lesson"
            icon="location-outline"
            label={`Class is on ${lessonLabel(lesson)}`}
            variant="secondary"
            onPress={() => openLesson(lesson)}
          />
        ) : null}
      </Section>

      <TextField
        testID="grammar-search"
        placeholder="Search: Konjunktiv II, um zu, der die das …"
        value={query}
        onChangeText={setQuery}
        accessibilityLabel="Search grammar topics"
      />
      <Row>
        {LEVEL_FILTERS.map((f) => (
          <Chip
            key={f.label}
            testID={`grammar-level-${f.value ?? 'all'}`}
            label={f.label}
            selected={level === f.value}
            onPress={() => setLevel(f.value)}
          />
        ))}
      </Row>

      {found ? (
        <Section title={`${plural(found.length, 'topic')} found`} testID="grammar-results">
          {found.length === 0 ? (
            <AppText variant="caption">
              Nothing matches. Try a German or English word, such as Dativ, past or weil.
            </AppText>
          ) : (
            found.map((t) => <TopicRow key={t.id} topic={t} progress={progress.get(t.id)} />)
          )}
        </Section>
      ) : (
        <>
          <Segmented
            testID="grammar-view"
            accessibilityLabel="Show"
            options={[
              { value: 'path', label: 'Momente path' },
              { value: 'topics', label: 'By subject' },
            ]}
            value={view}
            onChange={setView}
          />
          {view === 'path'
            ? BOOKS.filter((b) => !level || b.level === level).map((book) => {
                const ids = [
                  ...new Set(book.lessons.flatMap((l) => lessonTopics(l).map((t) => t.id))),
                ];
                const inDeck = ids.filter((id) => progress.has(id)).length;
                return (
                  <Section key={book.id} title={`Momente ${book.id}`} testID={`book-${book.id}`}>
                    <AppText variant="caption">
                      {inDeck} of {plural(ids.length, 'topic')} in your reviews
                    </AppText>
                    <ProgressBar
                      value={ids.length ? inDeck / ids.length : 0}
                      color={theme.xp}
                      track={theme.track}
                      height={6}
                    />
                    {book.lessons.map((l, i) => (
                      <View key={l.number} style={{ gap: spacing.sm }}>
                        {i % 3 === 0 ? (
                          <AppText variant="overline" style={{ marginTop: spacing.sm }}>
                            Modul {moduleOf(l)}
                          </AppText>
                        ) : null}
                        <LessonCard
                          lesson={l}
                          progress={progress}
                          current={lesson?.book === l.book && lesson.number === l.number}
                        />
                      </View>
                    ))}
                  </Section>
                );
              })
            : BLOCKS.map((block) => {
                const topics: Topic[] = topicsInBlock(block.id, visible);
                if (topics.length === 0) return null;
                return (
                  <Section
                    key={block.id}
                    title={block.name}
                    icon={block.icon}
                    testID={`block-${block.id}`}
                  >
                    <AppText variant="caption">{block.label}</AppText>
                    {topics.map((t) => (
                      <TopicRow key={t.id} topic={t} progress={progress.get(t.id)} />
                    ))}
                    <Button
                      testID={`block-practise-${block.id}`}
                      icon="play"
                      label={topics.length === 1 ? 'Practise it' : `Practise all ${topics.length}`}
                      variant="secondary"
                      onPress={() =>
                        practiseTopics(
                          db,
                          topics.map((t) => t.id),
                          now().getTime(),
                        )
                      }
                    />
                  </Section>
                );
              })}
        </>
      )}
    </Screen>
  );
}
