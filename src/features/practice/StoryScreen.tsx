import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { plural } from '@/core/format';
import { STORY_MIN_TARGETS, wordCount } from '@/core/story';
import { discardExercise, markExerciseUsed, nextStory, type Cached } from '@/data/repos/exercises';
import { storyCandidates } from '@/data/repos/practice';
import { recordStory, type StoryRating } from '@/data/repos/stories';
import { writeStoryNow } from '@/jobs/prefetch';
import { describeLlmError } from '@/llm/errors';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { Banner, Screen, Section } from '@/ui/layout';
import { spacing } from '@/ui/theme';
import { UmlautBar } from '@/ui/umlaut';

import { useServices } from '../services';
import { useLiveQuery } from '../use-live-query';
import { useOnline } from '../use-online';
import { StoryResult, StoryView, type StoryDone } from './StoryView';

/**
 * Read a mini story outside the Study session. One is written a day while
 * you are online; if none is waiting, you can ask for one now.
 */
export function StoryScreen() {
  const services = useServices();
  const { db, now } = services;
  const online = useOnline();
  const waiting = useLiveQuery(() => nextStory(db), ['exercise']);
  const words = useLiveQuery(() => storyCandidates(db, now()).length, ['card', 'item']);
  const [reading, setReading] = useState<Cached<'story'> | null>(null);
  const [finished, setFinished] = useState<{ done: StoryDone; ratings: StoryRating[] } | null>(
    null,
  );
  const [writing, setWriting] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const header = <Stack.Screen options={{ title: 'Mini story' }} />;

  if (reading && finished) {
    return (
      <Screen scroll={false}>
        {header}
        <StoryResult
          story={reading.payload}
          done={finished.done}
          ratings={finished.ratings}
          doneLabel="Done"
          onDone={() => router.back()}
        />
      </Screen>
    );
  }

  if (reading) {
    return (
      <Screen scroll={false} footer={<UmlautBar />}>
        {header}
        <StoryView
          story={reading.payload}
          onDone={(done) =>
            setFinished({
              done,
              ratings: recordStory(db, reading.payload, done.tapped, done.answers, now().getTime()),
            })
          }
          onBad={() => {
            discardExercise(db, reading.id, now().getTime());
            setReading(null);
          }}
        />
      </Screen>
    );
  }

  const write = () => {
    setWriting(true);
    setProblem(null);
    writeStoryNow(services)
      .then((ok) => {
        if (!ok) setProblem('That story did not pass the checks. Try again.');
      })
      .catch((e: unknown) => setProblem(describeLlmError(e)))
      .finally(() => setWriting(false));
  };

  return (
    <Screen testID="story-screen">
      {header}
      {waiting ? (
        <Section testID="story-waiting">
          <View style={{ alignItems: 'center', gap: spacing.sm }}>
            <Text style={{ fontSize: 56 }}>📖</Text>
            <AppText variant="title" style={{ textAlign: 'center' }}>
              {waiting.payload.title}
            </AppText>
            <AppText style={{ textAlign: 'center' }}>
              About {plural(wordCount(waiting.payload.text), 'word')}, built around{' '}
              {plural(waiting.payload.targets.length, 'word')} from your deck, then{' '}
              {plural(waiting.payload.questions.length, 'question')}.
            </AppText>
          </View>
          <Button
            testID="story-start"
            size="large"
            label="Read it"
            icon="book"
            onPress={() => {
              markExerciseUsed(db, waiting.id, now().getTime());
              setReading(waiting);
            }}
          />
        </Section>
      ) : (
        <Section testID="story-none">
          <View style={{ alignItems: 'center', gap: spacing.sm }}>
            <Text style={{ fontSize: 56 }}>🪶</Text>
            <AppText variant="heading" style={{ textAlign: 'center' }}>
              No story waiting
            </AppText>
            <AppText style={{ textAlign: 'center' }}>
              {words < STORY_MIN_TARGETS
                ? `Stories are built around words you know. Once ${STORY_MIN_TARGETS} words are past their first review, one gets written.`
                : 'A new one gets written once a day while you are online.'}
            </AppText>
          </View>
          {words >= STORY_MIN_TARGETS && online ? (
            <Button
              testID="story-write"
              label="Write one now"
              icon="create-outline"
              loading={writing}
              onPress={write}
            />
          ) : null}
        </Section>
      )}
      {problem ? (
        <Banner tone="error" testID="story-problem">
          <AppText color="errorText">{problem}</AppText>
        </Banner>
      ) : null}
    </Screen>
  );
}
