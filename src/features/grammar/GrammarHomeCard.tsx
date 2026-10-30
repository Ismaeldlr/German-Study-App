import { router } from 'expo-router';

import { lessonTopics, TOPICS } from '@/curriculum';
import { currentLesson, topicProgress } from '@/data/repos/curriculum';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { Row, Section } from '@/ui/layout';

import { useServices } from '../services';
import { useLiveQuery } from '../use-live-query';
import { LessonCard, practiseTopics } from './parts';

/**
 * Home's way into the grammar path: the lesson class is on, ready to
 * practise in one tap, or an invitation to open the path.
 */
export function GrammarHomeCard() {
  const { db, now } = useServices();
  const progress = useLiveQuery(() => topicProgress(db), ['item', 'card']);
  const lesson = useLiveQuery(() => currentLesson(db), ['settings', 'chapter']);
  const open = () => router.push('/grammar');

  if (lesson) {
    const ids = lessonTopics(lesson).map((t) => t.id);
    return (
      <Section title="Grammatik" icon="🧩" testID="home-grammar">
        <LessonCard lesson={lesson} progress={progress} current />
        <Row style={{ flexWrap: 'nowrap' }}>
          <Button
            testID="home-grammar-practise"
            icon="play"
            label="Practise"
            style={{ flex: 1 }}
            onPress={() => practiseTopics(db, ids, now().getTime())}
          />
          <Button
            testID="home-grammar-open"
            label="All grammar"
            variant="secondary"
            style={{ flex: 1 }}
            onPress={open}
          />
        </Row>
      </Section>
    );
  }

  return (
    <Section title="Grammatik" icon="🧩" testID="home-grammar">
      <AppText>
        All {TOPICS.length} grammar topics from Momente A1 to B1, explained and ready to practise
        offline.
      </AppText>
      <AppText variant="caption">
        Tell it which lesson your class is on, and that lesson shows up here.
      </AppText>
      <Button testID="home-grammar-open" label="Open the grammar path" onPress={open} />
    </Section>
  );
}
