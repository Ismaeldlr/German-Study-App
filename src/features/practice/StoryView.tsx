import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import type { DrillItem, ItemResult } from '@/core/drills';
import { plural } from '@/core/format';
import type { CardType } from '@/core/model';
import { xpFor } from '@/core/progress';
import { isRecalled } from '@/core/rating';
import { gradeStoryQuestion, storyParagraphs, wordCount, type StoryExercise } from '@/core/story';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { Section } from '@/ui/layout';
import { FadeIn } from '@/ui/motion';
import { fonts, radius, spacing, useTheme } from '@/ui/theme';
import { IconBubble } from '@/ui/visuals';

import { DrillQuestion } from '../study/production';
import { PromptLabel } from '../study/questions';
import { RATING_LABELS } from '../words/describe';

export interface StoryDone {
  /** Targets whose word you tapped. */
  tapped: Set<number>;
  /** One per question, in order. */
  answers: (ItemResult & { answer: string })[];
}

/**
 * A mini story. Read it and tap any underlined word for its English; a word
 * from your deck that you tap comes back sooner. Then the story goes out of
 * sight and a few gap questions ask for its words.
 */
export function StoryView({
  story,
  onDone,
  onBad,
}: {
  story: StoryExercise;
  onDone: (done: StoryDone) => void;
  onBad?: () => void;
}) {
  const theme = useTheme();
  const [phase, setPhase] = useState<'read' | 'questions'>('read');
  const [tapped, setTapped] = useState<Set<number>>(() => new Set());
  const [shown, setShown] = useState<{ word: string; en: string; deck: boolean } | null>(null);
  const paragraphs = storyParagraphs(story);

  if (phase === 'questions') {
    const items: DrillItem[] = story.questions.map((q) => ({
      sentence: q.sentence,
      hint: q.cue,
      answer: q.answer,
      accepted: q.accepted,
      translation: q.translation,
      explanation: '',
      category: 'wrong_word',
    }));
    return (
      <DrillQuestion
        label="Story questions"
        title={story.title}
        items={items}
        grade={(_, given, index) => {
          const question = story.questions[index];
          return gradeStoryQuestion(question, given, story.targets[question.target].kind);
        }}
        onDone={({ results, answers }) =>
          onDone({ tapped, answers: results.map((r, i) => ({ ...r, answer: answers[i] ?? '' })) })
        }
      />
    );
  }

  const look = (text: string, en: string, target?: number) => {
    setShown({ word: text.replace(/[.,!?;:"„“()]/g, ''), en, deck: target !== undefined });
    if (target !== undefined && !tapped.has(target)) setTapped(new Set(tapped).add(target));
  };

  return (
    <View style={styles.layout} testID="story-read">
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.page}>
        <View style={{ alignItems: 'flex-start', gap: spacing.sm }}>
          <PromptLabel>Mini story</PromptLabel>
          <AppText variant="title" testID="story-title">
            {story.title}
          </AppText>
          <AppText variant="caption">
            About {plural(wordCount(story.text), 'word')}. Tap an underlined word for its English.
          </AppText>
        </View>
        {paragraphs.map((tokens, p) => (
          <AppText key={p} style={styles.paragraph} testID="story-paragraph">
            {tokens.map((token, i) => {
              const en =
                token.target !== undefined ? story.targets[token.target].meaning : token.gloss;
              if (!en) return token.text;
              const looked = token.target !== undefined && tapped.has(token.target);
              return (
                <Text
                  key={i}
                  accessibilityRole="button"
                  accessibilityHint="Shows the English"
                  onPress={() => look(token.text, en, token.target)}
                  style={{
                    textDecorationLine: 'underline',
                    textDecorationStyle: 'dotted',
                    textDecorationColor: theme.primary,
                    backgroundColor: looked ? theme.warningBg : undefined,
                  }}
                >
                  {token.text}
                </Text>
              );
            })}
          </AppText>
        ))}
      </ScrollView>
      <View style={{ gap: spacing.sm }}>
        {shown ? (
          <View style={[styles.gloss, { backgroundColor: theme.surfaceAlt }]} testID="story-gloss">
            <AppText variant="label">
              {shown.word}: {shown.en}
            </AppText>
            {shown.deck ? (
              <AppText variant="caption">From your deck: it comes back a little sooner.</AppText>
            ) : null}
          </View>
        ) : null}
        <Button
          testID="story-done-reading"
          size="large"
          label="Done reading"
          onPress={() => setPhase('questions')}
        />
        {onBad ? (
          <Button
            testID="story-bad"
            variant="ghost"
            icon="flag-outline"
            label="Bad story"
            accessibilityHint="Throws this story out; a new one gets written later"
            onPress={onBad}
          />
        ) : null}
      </View>
    </View>
  );
}

/** What a read story came to: words looked up, questions right, and each card's rating. */
export function StoryResult({
  story,
  done,
  ratings,
  doneLabel,
  onDone,
}: {
  story: StoryExercise;
  done: StoryDone;
  ratings: { cardId: number; itemId: number; type: CardType; rating: number }[];
  doneLabel: string;
  onDone: () => void;
}) {
  const theme = useTheme();
  const right = done.answers.filter((a) => a.outcome !== 'wrong').length;
  const xp = ratings.reduce((sum, r) => sum + xpFor('story', r.rating), 0);
  const recalled = ratings.filter((r) => isRecalled(r.rating)).length;
  // A word can get two ratings: its meaning, if you looked it up, and its question.
  const label = (r: { itemId: number; type: CardType }) => {
    const word = story.targets.find((t) => t.itemId === r.itemId)?.word ?? '';
    return r.type === 'recognize' ? `${word} (looked up)` : word;
  };
  return (
    <ScrollView contentContainerStyle={styles.page} testID="story-result">
      <FadeIn from="scale">
        <View style={{ alignItems: 'center', gap: spacing.sm }}>
          <IconBubble
            icon={right === done.answers.length ? '📚' : '📖'}
            bg={theme.primarySoft}
            size={72}
          />
          <AppText variant="title" style={{ textAlign: 'center' }}>
            {right === done.answers.length ? 'Toll gelesen!' : 'Gut gelesen!'}
          </AppText>
          <AppText testID="story-score" style={{ textAlign: 'center' }}>
            {right} of {plural(done.answers.length, 'question')} right
            {done.tapped.size ? ` · ${plural(done.tapped.size, 'deck word')} looked up` : ''}
          </AppText>
          {xp ? (
            <View style={[styles.xp, { backgroundColor: theme.xpSoft }]}>
              <AppText variant="label" style={{ color: theme.xpText }} testID="story-xp">
                +{xp} XP
              </AppText>
            </View>
          ) : null}
        </View>
      </FadeIn>
      {ratings.length ? (
        <Section title="Your words" icon="🗂️">
          {ratings.map((r) => (
            <AppText key={r.cardId} variant="caption" testID="story-rating">
              {label(r)}: rated {RATING_LABELS[r.rating]}
            </AppText>
          ))}
          <AppText variant="caption">
            {recalled} of {plural(ratings.length, 'card')} remembered.
          </AppText>
        </Section>
      ) : null}
      <Button testID="story-finish" size="large" label={doneLabel} onPress={onDone} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  layout: { flex: 1, gap: spacing.md },
  page: { gap: spacing.lg, paddingBottom: spacing.lg },
  paragraph: { fontSize: 18, lineHeight: 28, fontFamily: fonts.regular },
  gloss: { borderRadius: radius.md, padding: spacing.md, gap: 2 },
  xp: { borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 6 },
});
