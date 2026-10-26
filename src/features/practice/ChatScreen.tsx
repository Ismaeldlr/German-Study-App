import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { CHAT_TURNS, type ChatResult } from '@/core/chat';
import { getChat, openChat } from '@/data/repos/chats';
import { chatTargets } from '@/data/repos/practice';
import { chatTopics, startChat } from '@/jobs/chat';
import { describeLlmError } from '@/llm/errors';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { Chip } from '@/ui/controls';
import { Banner, Row, Screen, Section } from '@/ui/layout';
import { spacing, useTheme } from '@/ui/theme';
import { UmlautBar } from '@/ui/umlaut';

import { useServices } from '../services';
import { useLiveQuery } from '../use-live-query';
import { useOnline } from '../use-online';
import { ChatSummary, ChatView } from './ChatView';

/**
 * A roleplay chat outside the Study session: pick a topic, or let the app
 * pick one, and talk for up to ten messages. An unfinished chat from today
 * can be picked up again.
 */
export function ChatScreen() {
  const services = useServices();
  const { db, now } = services;
  const theme = useTheme();
  const online = useOnline();
  const topics = useLiveQuery(() => chatTopics(db), ['settings', 'chapter']);
  const open = useLiveQuery(() => openChat(db, now()) ?? null, ['chat']);
  const targets = useLiveQuery(() => chatTargets(db, now()), ['card', 'item', 'review']);
  const [topic, setTopic] = useState<string | null>(null);
  const [chatId, setChatId] = useState<number | null>(null);
  const [result, setResult] = useState<ChatResult | null>(null);
  const [starting, setStarting] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const header = <Stack.Screen options={{ title: 'Chat' }} />;

  const finished = chatId !== null && result ? getChat(db, chatId) : undefined;
  if (finished && result) {
    return (
      <Screen scroll={false}>
        {header}
        <ChatSummary
          chat={finished}
          result={result}
          doneLabel="Done"
          onDone={() => router.back()}
        />
      </Screen>
    );
  }

  if (chatId !== null) {
    return (
      <Screen scroll={false} footer={<UmlautBar />}>
        {header}
        <ChatView chatId={chatId} onEnded={setResult} />
      </Screen>
    );
  }

  const start = () => {
    setStarting(true);
    setProblem(null);
    startChat(services, { topic, maxTurns: CHAT_TURNS })
      .then(setChatId)
      .catch((e: unknown) => setProblem(describeLlmError(e)))
      .finally(() => setStarting(false));
  };

  return (
    <Screen testID="chat-screen">
      {header}
      <View style={{ alignItems: 'center', gap: spacing.sm }}>
        <Text style={{ fontSize: 56 }}>💬</Text>
        <AppText variant="title" style={{ textAlign: 'center' }}>
          Plaudern wir!
        </AppText>
        <AppText style={{ textAlign: 'center' }}>
          A short roleplay of up to {CHAT_TURNS} messages. Every message you write gets checked, and
          the character steers toward words you are learning.
        </AppText>
      </View>

      {!online ? (
        <Banner tone="warning" testID="chat-offline">
          <AppText color="warningText">
            Chats need a connection. Stories and cards work offline.
          </AppText>
        </Banner>
      ) : null}

      {open ? (
        <Section title="Pick up where you left off" icon="⏸️" testID="chat-open">
          <AppText>{open.scenario}</AppText>
          <Button
            testID="chat-resume"
            label="Continue the chat"
            variant="secondary"
            onPress={() => setChatId(open.id)}
          />
        </Section>
      ) : null}

      <Section title="Topic" icon="🧭">
        <Row>
          <Chip
            testID="chat-topic-any"
            label="Surprise me"
            selected={topic === null}
            onPress={() => setTopic(null)}
          />
          {topics.map((t) => (
            <Chip key={t} label={t} selected={topic === t} onPress={() => setTopic(t)} />
          ))}
        </Row>
        {targets.length ? (
          <AppText variant="caption" testID="chat-planned-targets">
            The chat steers toward: {targets.map((t) => t.word).join(', ')}
          </AppText>
        ) : (
          <AppText variant="caption">
            No words are due for practice in a chat yet, so this one is free conversation.
          </AppText>
        )}
        {starting ? (
          <Row style={{ justifyContent: 'center' }} testID="chat-starting">
            <ActivityIndicator color={theme.primary} />
            <AppText>Setting the scene…</AppText>
          </Row>
        ) : (
          <Button
            testID="chat-start"
            size="large"
            label="Start chatting"
            icon="chatbubbles"
            disabled={!online}
            onPress={start}
          />
        )}
      </Section>

      {problem ? (
        <Banner tone="error" testID="chat-problem">
          <AppText color="errorText">{problem}</AppText>
        </Banner>
      ) : null}
    </Screen>
  );
}
