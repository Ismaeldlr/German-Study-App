import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { FINISHER_CHAT_TURNS, type ChatResult } from '@/core/chat';
import type { FinisherKind } from '@/core/finisher';
import { plural } from '@/core/format';
import { xpFor } from '@/core/progress';
import { wordCount } from '@/core/story';
import { createBudgetGuard } from '@/data/repos/budget';
import { getChat } from '@/data/repos/chats';
import { discardExercise, markExerciseUsed, nextStory } from '@/data/repos/exercises';
import { recordStory, type StoryRating } from '@/data/repos/stories';
import { startChat } from '@/jobs/chat';
import { describeLlmError } from '@/llm/errors';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { Banner, Row } from '@/ui/layout';
import { FadeIn } from '@/ui/motion';
import { spacing, useTheme } from '@/ui/theme';

import { getLlmClient } from '../llm-client';
import { ChatSummary, ChatView, chatXp } from '../practice/ChatView';
import { StoryResult, StoryView, type StoryDone } from '../practice/StoryView';
import { useServices } from '../services';
import { useOnline } from '../use-online';
import type { FinisherOutcome } from './store';

type Stage =
  | { name: 'offer' }
  | { name: 'story' }
  | { name: 'story-done'; done: StoryDone; ratings: StoryRating[] }
  | { name: 'starting' }
  | { name: 'chat'; chatId: number }
  | { name: 'chat-done'; chatId: number; result: ChatResult };

/**
 * The session's closer, on finisher days: a mini story or a short chat.
 * It offers the first kind that can run now (a story waiting, or a
 * connection for a chat), falls back to the other, and can always be
 * skipped. With neither possible, the session just ends.
 */
export function Finisher({
  kinds,
  onDone,
  onSkip,
}: {
  kinds: readonly FinisherKind[];
  onDone: (outcome: FinisherOutcome) => void;
  onSkip: () => void;
}) {
  const services = useServices();
  const { db, now } = services;
  const theme = useTheme();
  const online = useOnline();
  const [story, setStory] = useState(() => (kinds.includes('story') ? nextStory(db) : null));
  // Whether a chat could start: a key saved, the provider set up, budget left. null while checking.
  const [chatReady, setChatReady] = useState<boolean | null>(() =>
    kinds.includes('chat') ? null : false,
  );
  const [chatProblem, setChatProblem] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>({ name: 'offer' });

  useEffect(() => {
    if (!kinds.includes('chat')) return;
    let live = true;
    getLlmClient(services).then(
      () => {
        if (live) setChatReady(createBudgetGuard(services.db, services.now).check(0).allowed);
      },
      () => {
        if (live) setChatReady(false);
      },
    );
    return () => {
      live = false;
    };
  }, [kinds, services]);

  const checking = chatReady === null;
  const kind = checking
    ? null
    : (kinds.find((k) =>
        k === 'story' ? story !== null : online && chatReady && chatProblem === null,
      ) ?? null);

  // Nothing can run: end quietly, unless a chat just failed to start and you should hear why.
  const nothing = stage.name === 'offer' && !checking && kind === null && chatProblem === null;
  useEffect(() => {
    if (nothing) onSkip();
  }, [nothing, onSkip]);

  if (stage.name === 'story' && story) {
    return (
      <StoryView
        story={story.payload}
        onDone={(done) =>
          setStage({
            name: 'story-done',
            done,
            ratings: recordStory(db, story.payload, done.tapped, done.answers, now().getTime()),
          })
        }
        onBad={() => {
          discardExercise(db, story.id, now().getTime());
          setStory(null);
          setStage({ name: 'offer' });
        }}
      />
    );
  }

  if (stage.name === 'story-done' && story) {
    const { done, ratings } = stage;
    return (
      <StoryResult
        story={story.payload}
        done={done}
        ratings={ratings}
        doneLabel="Finish the session"
        onDone={() =>
          onDone({
            ratings: ratings.map((r) => r.rating),
            xp: ratings.reduce((sum, r) => sum + xpFor('story', r.rating), 0),
            mistakes: done.answers.flatMap((a, i) => {
              const target = story.payload.targets[story.payload.questions[i].target];
              return a.mistake ? [{ ...a.mistake, lemma: target.word }] : [];
            }),
          })
        }
      />
    );
  }

  if (stage.name === 'chat') {
    return (
      <ChatView
        chatId={stage.chatId}
        onEnded={(result) => setStage({ name: 'chat-done', chatId: stage.chatId, result })}
      />
    );
  }

  if (stage.name === 'chat-done') {
    const chat = getChat(db, stage.chatId);
    if (!chat) return null;
    const { result } = stage;
    return (
      <ChatSummary
        chat={chat}
        result={result}
        doneLabel="Finish the session"
        onDone={() =>
          onDone({
            ratings: result.words.map((w) => w.rating),
            xp: chatXp(chat, result),
            mistakes: chat.messages.flatMap((m) =>
              (m.correction?.errors ?? []).map((e) => ({
                category: e.category,
                yourText: e.text,
                correction: e.correction,
                explanation: e.explanation,
                lemma: chat.scenario,
              })),
            ),
          })
        }
      />
    );
  }

  const problem = chatProblem ? (
    <Banner tone="warning" testID="finisher-chat-problem">
      <AppText color="warningText">The chat could not start: {chatProblem}</AppText>
    </Banner>
  ) : null;

  if (checking) {
    return (
      <View style={{ flex: 1, justifyContent: 'center' }} testID="finisher-checking">
        <ActivityIndicator color={theme.primary} />
      </View>
    );
  }

  if (kind === null) {
    return problem ? (
      <View style={{ flex: 1, justifyContent: 'center', gap: spacing.lg }} testID="finisher">
        {problem}
        <Button testID="finisher-skip" size="large" label="Finish the session" onPress={onSkip} />
      </View>
    ) : null;
  }

  const begin = () => {
    if (kind === 'story' && story) {
      markExerciseUsed(db, story.id, now().getTime());
      setStage({ name: 'story' });
      return;
    }
    setStage({ name: 'starting' });
    startChat(services, { maxTurns: FINISHER_CHAT_TURNS })
      .then((chatId) => setStage({ name: 'chat', chatId }))
      .catch((e: unknown) => {
        setChatProblem(describeLlmError(e));
        setStage({ name: 'offer' });
      });
  };

  return (
    <View style={{ flex: 1, justifyContent: 'center', gap: spacing.lg }} testID="finisher">
      <FadeIn from="scale">
        <View style={{ alignItems: 'center', gap: spacing.sm }}>
          <Text style={{ fontSize: 64 }}>{kind === 'story' ? '📖' : '💬'}</Text>
          <AppText variant="overline">Zum Schluss</AppText>
          <AppText variant="title" style={{ textAlign: 'center' }} testID="finisher-title">
            {kind === 'story' ? 'A mini story' : 'A short chat'}
          </AppText>
          <AppText style={{ textAlign: 'center' }}>
            {kind === 'story' && story
              ? `“${story.payload.title}”: about ${plural(wordCount(story.payload.text), 'word')}, then ${plural(story.payload.questions.length, 'question')} on it.`
              : `${plural(FINISHER_CHAT_TURNS, 'message')} with a character who steers toward words you know.`}
          </AppText>
        </View>
      </FadeIn>
      {problem}
      {stage.name === 'starting' ? (
        <Row style={{ justifyContent: 'center' }} testID="finisher-starting">
          <ActivityIndicator color={theme.primary} />
          <AppText>Setting the scene…</AppText>
        </Row>
      ) : (
        <View style={{ gap: spacing.sm }}>
          <Button
            testID="finisher-start"
            size="large"
            label={kind === 'story' ? 'Read it' : 'Start the chat'}
            icon={kind === 'story' ? 'book' : 'chatbubbles'}
            onPress={begin}
          />
          <Button testID="finisher-skip" variant="ghost" label="Skip for today" onPress={onSkip} />
        </View>
      )}
    </View>
  );
}
