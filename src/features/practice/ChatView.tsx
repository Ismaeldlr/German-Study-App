import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import {
  userTurns,
  wordKey,
  XP_PER_CHAT_MESSAGE,
  type ChatMessage,
  type ChatResult,
} from '@/core/chat';
import { plural } from '@/core/format';
import { xpFor } from '@/core/progress';
import { getChat } from '@/data/repos/chats';
import type { ChatRow } from '@/data/schema';
import { endChat, sendChatMessage } from '@/jobs/chat';
import { describeLlmError } from '@/llm/errors';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { Banner, Row, Section } from '@/ui/layout';
import { FadeIn } from '@/ui/motion';
import { radius, spacing, useTheme } from '@/ui/theme';
import { GermanField } from '@/ui/umlaut';
import { IconBubble } from '@/ui/visuals';

import { useServices } from '../services';
import { useLiveQuery } from '../use-live-query';
import { useOnline } from '../use-online';
import { MISTAKE_LABELS, RATING_LABELS } from '../words/describe';

/**
 * A roleplay chat. Tap the character's message for its English. Each of
 * your messages comes back with a correction folded under it, so the
 * conversation keeps moving; tap it for the details. The chat ends after
 * its last message, or earlier when you end it.
 */
export function ChatView({
  chatId,
  onEnded,
}: {
  chatId: number;
  onEnded: (result: ChatResult) => void;
}) {
  const services = useServices();
  const theme = useTheme();
  const online = useOnline();
  const chat = useLiveQuery(() => getChat(services.db, chatId), ['chat']);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ending, setEnding] = useState(false);
  const scroll = useRef<ScrollView>(null);

  if (!chat) return null;
  const turns = userTurns(chat.messages);
  const over = turns >= chat.maxTurns;
  const used = new Set(
    chat.messages
      .flatMap((m) => (m.role === 'user' ? (m.used ?? []) : []))
      .map((u) => wordKey(u.word)),
  );

  const send = () => {
    const text = draft.trim();
    if (!text || pending !== null) return;
    setPending(text);
    setDraft('');
    setError(null);
    sendChatMessage(services, chatId, text)
      .catch((e: unknown) => {
        setError(describeLlmError(e));
        // Back in the field to try again, unless you started a new one meanwhile.
        setDraft((current) => current || text);
      })
      .finally(() => setPending(null));
  };

  const end = () => {
    setEnding(true);
    void endChat(services, chatId).then(onEnded, (e: unknown) => {
      setError(describeLlmError(e));
      setEnding(false);
    });
  };

  return (
    <View style={styles.layout} testID="chat-view">
      <ScrollView
        ref={scroll}
        style={{ flex: 1 }}
        contentContainerStyle={styles.thread}
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.scene, { backgroundColor: theme.surfaceAlt }]} testID="chat-scene">
          <AppText variant="heading">{chat.scenario}</AppText>
          <AppText variant="caption">With {chat.character}</AppText>
          <AppText>{chat.situation}</AppText>
          {chat.targets.length ? (
            <View style={styles.targets} testID="chat-targets">
              <AppText variant="caption">Try to use:</AppText>
              {chat.targets.map((t) => {
                const done = used.has(wordKey(t.word));
                return (
                  <View
                    key={t.cardId}
                    style={[
                      styles.target,
                      { backgroundColor: done ? theme.successBg : theme.surface },
                    ]}
                  >
                    <AppText
                      variant="caption"
                      color={done ? 'successText' : 'text'}
                      testID={`chat-target-${t.cardId}`}
                    >
                      {done ? '✓ ' : ''}
                      {t.word}
                    </AppText>
                  </View>
                );
              })}
            </View>
          ) : null}
        </View>
        {chat.messages.map((m, i) =>
          m.role === 'assistant' ? (
            <CharacterBubble key={i} message={m} />
          ) : (
            <LearnerBubble key={i} message={m} />
          ),
        )}
        {pending !== null ? (
          <>
            <LearnerBubble message={{ role: 'user', content: pending, at: 0 }} />
            <Row testID="chat-typing">
              <ActivityIndicator color={theme.primary} />
              <AppText variant="caption">{chat.character.split(',')[0]} is typing…</AppText>
            </Row>
          </>
        ) : null}
      </ScrollView>

      {error ? (
        <Banner tone="error" testID="chat-error">
          <AppText color="errorText">{error}</AppText>
        </Banner>
      ) : null}
      {!online && !over ? (
        <Banner tone="warning" testID="chat-offline">
          <AppText color="warningText">Offline. The chat goes on once you are back online.</AppText>
        </Banner>
      ) : null}

      {ending ? (
        <Row style={{ justifyContent: 'center' }} testID="chat-ending">
          <ActivityIndicator color={theme.primary} />
          <AppText>Looking back over your chat…</AppText>
        </Row>
      ) : over ? (
        <Button
          testID="chat-finish"
          size="large"
          label="See how it went"
          icon="sparkles"
          onPress={end}
        />
      ) : (
        <View style={{ gap: spacing.sm }}>
          <AppText variant="caption" style={{ textAlign: 'center' }} testID="chat-turns">
            Message {Math.min(turns + 1, chat.maxTurns)} of {chat.maxTurns}
          </AppText>
          <Row style={{ flexWrap: 'nowrap', alignItems: 'flex-end' }}>
            <View style={{ flex: 1 }}>
              <GermanField
                testID="chat-input"
                accessibilityLabel="Your message"
                placeholder="Auf Deutsch…"
                value={draft}
                onChangeText={setDraft}
                multiline
                // One line to start, growing with the message, so the chat keeps the room.
                style={{ minHeight: 52, maxHeight: 120 }}
                maxLength={400}
              />
            </View>
            <Button
              testID="chat-send"
              label="Send"
              icon="send"
              disabled={!draft.trim() || pending !== null || !online}
              onPress={send}
            />
          </Row>
          {turns > 0 ? (
            <Button
              testID="chat-end"
              variant="ghost"
              label="End chat"
              disabled={pending !== null}
              onPress={end}
            />
          ) : null}
        </View>
      )}
    </View>
  );
}

function CharacterBubble({ message }: { message: ChatMessage }) {
  const theme = useTheme();
  const [english, setEnglish] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={english ? 'Hides the English' : 'Shows the English'}
      onPress={() => setEnglish(!english)}
      style={[
        styles.bubble,
        styles.theirs,
        { backgroundColor: theme.surface, borderColor: theme.border },
      ]}
      testID="chat-reply"
    >
      <AppText>{message.content}</AppText>
      {english && message.translation ? (
        <AppText variant="caption" testID="chat-translation">
          {message.translation}
        </AppText>
      ) : null}
    </Pressable>
  );
}

function LearnerBubble({ message }: { message: ChatMessage }) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const correction = message.correction;
  const fine = correction?.verdict === 'correct' || correction?.errors.length === 0;
  return (
    <View style={styles.mineColumn}>
      <View
        style={[styles.bubble, styles.mine, { backgroundColor: theme.primary }]}
        testID="chat-mine"
      >
        <AppText style={{ color: theme.onPrimary }}>{message.content}</AppText>
      </View>
      {correction ? (
        fine ? (
          <AppText variant="caption" color="successText" testID="chat-correct">
            ✓ Richtig!
          </AppText>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: open }}
            accessibilityHint={open ? 'Hides the details' : 'Shows what to fix'}
            onPress={() => setOpen(!open)}
            style={[
              styles.correction,
              { backgroundColor: correction.verdict === 'minor' ? theme.warningBg : theme.errorBg },
            ]}
            testID="chat-correction"
          >
            <AppText
              variant="caption"
              color={correction.verdict === 'minor' ? 'warningText' : 'errorText'}
            >
              ✏️ {correction.corrected} {open ? '▴' : '▾'}
            </AppText>
            {open
              ? correction.errors.map((e, i) => (
                  <View key={i} style={{ gap: 2 }} testID="chat-error-detail">
                    <AppText variant="caption" style={{ fontWeight: '700' }}>
                      {MISTAKE_LABELS[e.category]}: {e.text} → {e.correction}
                    </AppText>
                    {e.explanation ? <AppText variant="caption">{e.explanation}</AppText> : null}
                  </View>
                ))
              : null}
          </Pressable>
        )
      ) : null}
    </View>
  );
}

/** XP a chat earned: every message you wrote, plus the target words you remembered. */
export function chatXp(chat: Pick<ChatRow, 'messages'>, result: ChatResult): number {
  return (
    userTurns(chat.messages) * XP_PER_CHAT_MESSAGE +
    result.words.reduce((sum, w) => sum + xpFor('chat', w.rating), 0)
  );
}

/** The end of a chat: the teacher's look back, your words and your mistakes. */
export function ChatSummary({
  chat,
  result,
  doneLabel,
  onDone,
}: {
  chat: ChatRow;
  result: ChatResult;
  doneLabel: string;
  onDone: () => void;
}) {
  const theme = useTheme();
  const mistakes = chat.messages.flatMap((m) => m.correction?.errors ?? []);
  const unused = chat.targets.filter((t) => !result.words.some((w) => w.cardId === t.cardId));
  return (
    <ScrollView contentContainerStyle={styles.summary} testID="chat-summary">
      <FadeIn from="scale">
        <View style={{ alignItems: 'center', gap: spacing.sm }}>
          <IconBubble icon="💬" bg={theme.primarySoft} size={72} />
          <AppText variant="title" style={{ textAlign: 'center' }}>
            Gut gesprochen!
          </AppText>
          <AppText style={{ textAlign: 'center' }} testID="chat-summary-count">
            {plural(userTurns(chat.messages), 'message')} in “{chat.scenario}”
          </AppText>
          <View style={[styles.xp, { backgroundColor: theme.xpSoft }]}>
            <AppText variant="label" style={{ color: theme.xpText }} testID="chat-xp">
              +{chatXp(chat, result)} XP
            </AppText>
          </View>
        </View>
      </FadeIn>
      {result.feedback ? (
        <Section title="Feedback" icon="🧑‍🏫">
          <AppText testID="chat-feedback">{result.feedback}</AppText>
          {result.wellUsed.length ? (
            <AppText variant="caption" testID="chat-well-used">
              Well used: {result.wellUsed.join(' · ')}
            </AppText>
          ) : null}
        </Section>
      ) : null}
      {chat.targets.length ? (
        <Section title="Your words" icon="🗂️">
          {result.words.map((w) => (
            <AppText key={w.cardId} variant="caption" testID="chat-word-rating">
              {w.word}: rated {RATING_LABELS[w.rating]}
            </AppText>
          ))}
          {unused.length ? (
            <AppText variant="caption">
              Not used, so not rated: {unused.map((t) => t.word).join(', ')}
            </AppText>
          ) : null}
        </Section>
      ) : null}
      {mistakes.length ? (
        <Section title="Worth a second look" icon="✏️">
          {mistakes.map((e, i) => (
            <View key={i} style={{ gap: 2 }} testID="chat-summary-mistake">
              <AppText variant="label">
                {MISTAKE_LABELS[e.category]}: {e.text} → {e.correction}
              </AppText>
              {e.explanation ? <AppText variant="caption">{e.explanation}</AppText> : null}
            </View>
          ))}
        </Section>
      ) : null}
      <Button testID="chat-done" size="large" label={doneLabel} onPress={onDone} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  layout: { flex: 1, gap: spacing.sm },
  thread: { gap: spacing.md, paddingBottom: spacing.md },
  scene: { borderRadius: radius.lg, padding: spacing.md, gap: spacing.xs },
  targets: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  target: { borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  bubble: {
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 4,
  },
  theirs: { alignSelf: 'flex-start', maxWidth: '85%', borderWidth: StyleSheet.hairlineWidth },
  mine: { alignSelf: 'flex-end', maxWidth: '85%' },
  mineColumn: { alignItems: 'flex-end', gap: 4 },
  correction: { borderRadius: radius.md, padding: spacing.sm, gap: 4, maxWidth: '85%' },
  summary: { gap: spacing.lg, paddingBottom: spacing.lg },
  xp: { borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 6 },
});
