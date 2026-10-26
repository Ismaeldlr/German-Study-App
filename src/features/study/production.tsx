import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { gradeDrillItem, type DrillItem, type ItemResult } from '@/core/drills';
import { splitGap } from '@/core/gap-fill';
import type { TranslationExercise, TranslationGrade } from '@/core/translation';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { Row } from '@/ui/layout';
import { fonts, radius, spacing, useTheme } from '@/ui/theme';
import { GermanField } from '@/ui/umlaut';

import { MISTAKE_LABELS, VERDICT_LABELS } from '../words/describe';
import { FeedbackPanel, PromptLabel, QuestionLayout } from './questions';

/** Wait this long for the LLM's grade before offering to grade it later. */
export const GRADE_LATER_MS = 4000;

export interface DrillDone {
  results: ItemResult[];
  answers: string[];
}

/**
 * A grammar drill, contrast set or a story's questions: short gap items one
 * at a time, each checked as you go with a one-line explanation. The set is
 * rated as a whole when you finish.
 */
export function DrillQuestion({
  label,
  title,
  items,
  onDone,
  onBad,
  grade = gradeDrillItem,
}: {
  label: string;
  title: string;
  items: DrillItem[];
  onDone: (done: DrillDone) => void;
  /** Throws the exercise out; without it there is no button for that. */
  onBad?: () => void;
  /** How an answer is checked, when not like a drill item. */
  grade?: (item: DrillItem, given: string, index: number) => ItemResult;
}) {
  const theme = useTheme();
  const [index, setIndex] = useState(0);
  const [text, setText] = useState('');
  const [results, setResults] = useState<ItemResult[]>([]);
  const [answers, setAnswers] = useState<string[]>([]);
  const item = items[index];
  const result = results[index] ?? null;
  const last = index + 1 >= items.length;
  const { before, after } = splitGap(item.sentence);

  const check = (given: string) => {
    setResults([...results, grade(item, given, index)]);
    setAnswers([...answers, given]);
  };
  const explanation = result?.mistake?.explanation || item.explanation;
  const advance = () => {
    if (last) {
      onDone({ results, answers });
      return;
    }
    setIndex(index + 1);
    setText('');
  };
  const tone = !result
    ? null
    : result.outcome === 'correct'
      ? 'good'
      : result.outcome === 'slip'
        ? 'okay'
        : 'bad';
  const color = tone === 'good' ? 'successText' : tone === 'okay' ? 'warningText' : 'errorText';

  return (
    <QuestionLayout
      prompt={
        <View style={{ alignItems: 'center', gap: spacing.sm }} testID="drill-prompt">
          <PromptLabel testID="drill-progress">{`${label} · ${index + 1} of ${items.length}`}</PromptLabel>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {items.map((_, i) => {
              const r = results[i];
              const color = r
                ? r.outcome === 'correct'
                  ? theme.success
                  : r.outcome === 'slip'
                    ? theme.warning
                    : theme.danger
                : i === index
                  ? theme.primary
                  : theme.track;
              return (
                <View
                  key={i}
                  style={{
                    width: i === index ? 22 : 10,
                    height: 10,
                    borderRadius: radius.pill,
                    backgroundColor: color,
                  }}
                />
              );
            })}
          </View>
          <AppText variant="label" style={{ textAlign: 'center' }}>
            {title}
          </AppText>
          <AppText variant="heading" style={{ textAlign: 'center' }} testID="drill-sentence">
            {before}
            <Text
              style={{
                color: theme.primary,
                fontFamily: fonts.black,
                backgroundColor: theme.primarySoft,
              }}
            >
              {result ? result.expected : '____'}
            </Text>
            {after}
          </AppText>
          {item.hint ? (
            <AppText variant="caption" testID="drill-hint">
              ({item.hint})
            </AppText>
          ) : null}
          {result && tone ? (
            <FeedbackPanel tone={tone} testID="drill-result">
              <AppText variant="label" color={color}>
                {result.outcome === 'correct'
                  ? 'Right!'
                  : result.outcome === 'slip'
                    ? `Almost: ${result.expected}`
                    : `Not quite: ${result.expected}`}
              </AppText>
              {result.outcome !== 'correct' && answers[index] ? (
                <AppText variant="caption" color={color}>
                  You wrote: {answers[index]}
                </AppText>
              ) : null}
              {explanation ? (
                <AppText variant="caption" color={color}>
                  {explanation}
                </AppText>
              ) : null}
              {item.translation ? (
                <AppText variant="caption" color={color}>
                  {item.translation}
                </AppText>
              ) : null}
            </FeedbackPanel>
          ) : null}
        </View>
      }
    >
      {result ? (
        <Button
          testID="drill-next"
          size="large"
          label={last ? 'Finish' : 'Next'}
          onPress={advance}
        />
      ) : (
        <>
          <GermanField
            key={index}
            testID="study-answer"
            accessibilityLabel="Your answer"
            placeholder="The missing word"
            value={text}
            onChangeText={setText}
            onSubmitEditing={() => text.trim() && check(text)}
            returnKeyType="done"
            autoFocus
          />
          <Row style={{ flexWrap: 'nowrap' }}>
            <Button
              testID="study-check"
              style={{ flex: 2 }}
              label="Check"
              disabled={!text.trim()}
              onPress={() => check(text)}
            />
            <Button
              testID="study-dont-know"
              style={{ flex: 1 }}
              variant="ghost"
              label="Don't know"
              onPress={() => check('')}
            />
          </Row>
          {index === 0 && onBad ? (
            <Button
              testID="drill-bad"
              variant="ghost"
              icon="flag-outline"
              label="Bad exercise"
              accessibilityHint="Removes this exercise; a new one gets written next time"
              onPress={onBad}
            />
          ) : null}
        </>
      )}
    </QuestionLayout>
  );
}

/** An English sentence to write in German. The LLM grades it; any correct German counts. */
export function TranslationQuestion({
  exercise,
  onSubmit,
  onReveal,
  onBad,
}: {
  exercise: TranslationExercise;
  onSubmit: (answer: string) => void;
  onReveal: () => void;
  onBad: () => void;
}) {
  const [text, setText] = useState('');
  return (
    <QuestionLayout
      prompt={
        <View style={{ alignItems: 'center', gap: spacing.sm }} testID="translation-prompt">
          <PromptLabel>Write it in German</PromptLabel>
          <AppText variant="heading" style={{ textAlign: 'center' }} testID="translation-english">
            {exercise.english}
          </AppText>
          <AppText variant="caption" style={{ textAlign: 'center' }} testID="translation-cues">
            Practise: {exercise.cues.join(' · ')}
          </AppText>
          {exercise.grammar ? (
            <AppText variant="caption" style={{ textAlign: 'center' }}>
              Grammar: {exercise.grammar}
            </AppText>
          ) : null}
        </View>
      }
    >
      <GermanField
        testID="study-answer"
        accessibilityLabel="Your answer"
        placeholder="Your German sentence"
        value={text}
        onChangeText={setText}
        multiline
        style={{ minHeight: 72 }}
        autoFocus
      />
      <Row style={{ flexWrap: 'nowrap' }}>
        <Button
          testID="study-check"
          style={{ flex: 2 }}
          label="Check"
          disabled={!text.trim()}
          onPress={() => onSubmit(text)}
        />
        <Button
          testID="study-dont-know"
          style={{ flex: 1 }}
          variant="ghost"
          label="Don't know"
          onPress={onReveal}
        />
      </Row>
      <Button
        testID="translation-bad"
        variant="ghost"
        icon="flag-outline"
        label="Bad sentence"
        accessibilityHint="Removes this sentence and asks the card another way"
        onPress={onBad}
      />
    </QuestionLayout>
  );
}

/** While the LLM grades a translation. After a few seconds you can move on and see it later. */
export function GradingView({ answer, onLater }: { answer: string; onLater: () => void }) {
  const theme = useTheme();
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), GRADE_LATER_MS);
    return () => clearTimeout(timer);
  }, []);
  return (
    <View style={{ flex: 1, justifyContent: 'center', gap: spacing.lg }} testID="study-grading">
      <Row style={{ justifyContent: 'center' }}>
        <ActivityIndicator color={theme.primary} size="large" />
        <AppText variant="heading">Checking your German…</AppText>
      </Row>
      <View
        style={{ backgroundColor: theme.surface, borderRadius: radius.lg, padding: spacing.lg }}
      >
        <AppText style={{ textAlign: 'center', fontStyle: 'italic' }}>{answer}</AppText>
      </View>
      {slow ? (
        <Button
          testID="study-grade-later"
          size="large"
          variant="secondary"
          label="Grade later"
          accessibilityHint="Moves on; the grade shows up on Home when it is ready"
          onPress={onLater}
        />
      ) : null}
    </View>
  );
}

/** What the LLM said about a translation: corrections, a natural version, each word's verdict. */
export function TranslationResult({
  grade,
  given,
  color,
}: {
  grade: TranslationGrade;
  given: string | null;
  color: 'successText' | 'warningText' | 'errorText' | 'text';
}) {
  const same = (a: string, b: string | null) =>
    b !== null && a.replace(/\s+/g, ' ').trim() === b.replace(/\s+/g, ' ').trim();
  return (
    <View style={{ gap: spacing.xs }} testID="translation-result">
      {grade.natural && !same(grade.natural, grade.corrected) ? (
        <AppText color={color} testID="translation-natural">
          More natural: {grade.natural}
        </AppText>
      ) : null}
      {given && !same(grade.corrected, given) ? (
        <AppText color={color} variant="caption">
          You wrote: {given}
        </AppText>
      ) : null}
      {grade.targets.map((t) => (
        <AppText key={t.cardId} color={color} variant="caption" testID={`verdict-${t.cardId}`}>
          {t.word}: {VERDICT_LABELS[t.verdict]}
        </AppText>
      ))}
      {grade.errors.map((e, i) => (
        <View key={i} style={{ gap: 2 }} testID="translation-error">
          <AppText color={color} variant="label">
            {MISTAKE_LABELS[e.category]}: {e.text} → {e.correction}
          </AppText>
          {e.explanation ? (
            <AppText color={color} variant="caption">
              {e.explanation}
            </AppText>
          ) : null}
        </View>
      ))}
      {grade.explanation ? (
        <AppText color={color} variant="caption">
          {grade.explanation}
        </AppText>
      ) : null}
    </View>
  );
}
