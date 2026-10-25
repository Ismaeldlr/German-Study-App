import { useState } from 'react';
import { Text, View } from 'react-native';

import {
  firstLetter,
  gradeGapFill,
  tokenize,
  type GapExercise,
  type GapHint,
} from '@/core/gap-fill';
import type { ItemKind } from '@/core/model';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { Row } from '@/ui/layout';
import { fonts, radius, spacing, useTheme } from '@/ui/theme';
import { GermanField } from '@/ui/umlaut';

import { PromptLabel, QuestionLayout, type OnResult } from './questions';

/**
 * A generated sentence with the target blanked out. Words you might not
 * know are underlined; tap one for its English. Learning cards show the
 * first letter for free; on review cards, asking for it rates the card Hard.
 */
export function GapFillQuestion({
  kind,
  exercise,
  hint,
  onResult,
  onBadSentence,
}: {
  kind: ItemKind;
  exercise: GapExercise;
  hint: GapHint;
  onResult: OnResult;
  onBadSentence: () => void;
}) {
  const theme = useTheme();
  const [text, setText] = useState('');
  const [letterShown, setLetterShown] = useState(hint === 'first_letter');
  const [usedHint, setUsedHint] = useState(false);
  const [gloss, setGloss] = useState<{ word: string; en: string } | null>(null);
  const tokens = tokenize(exercise.sentence, exercise.glosses);

  const submit = () => {
    if (!text.trim()) return;
    onResult({
      kind: 'graded',
      grade: gradeGapFill(exercise, text, kind),
      answer: text,
      usedHint,
    });
  };

  return (
    <QuestionLayout
      prompt={
        <View style={{ alignItems: 'center', gap: spacing.sm }} testID="gap-prompt">
          <PromptLabel>Fill the gap</PromptLabel>
          <AppText variant="heading" style={{ textAlign: 'center' }} testID="gap-sentence">
            {tokens.map((token, i) =>
              token.blank ? (
                <Text
                  key={i}
                  style={{
                    color: theme.primary,
                    fontFamily: fonts.black,
                    backgroundColor: theme.primarySoft,
                  }}
                  testID="gap-blank"
                >
                  {letterShown ? `${firstLetter(exercise.answer)}___` : '____'}
                </Text>
              ) : token.gloss ? (
                <Text
                  key={i}
                  accessibilityRole="button"
                  accessibilityHint="Shows the English"
                  onPress={() => setGloss({ word: token.text, en: token.gloss! })}
                  style={{
                    textDecorationLine: 'underline',
                    textDecorationStyle: 'dotted',
                    textDecorationColor: theme.primary,
                  }}
                >
                  {token.text}
                </Text>
              ) : (
                token.text
              ),
            )}
          </AppText>
          <AppText variant="caption" testID="gap-cue">
            ({exercise.cue})
          </AppText>
          {gloss ? (
            <View
              style={{ backgroundColor: theme.surfaceAlt, borderRadius: radius.sm, padding: 6 }}
            >
              <AppText variant="caption" testID="gap-gloss">
                {gloss.word.replace(/[.,!?;:"„“()]/g, '')}: {gloss.en}
              </AppText>
            </View>
          ) : null}
        </View>
      }
    >
      <GermanField
        testID="study-answer"
        accessibilityLabel="Your answer"
        placeholder="The missing word"
        value={text}
        onChangeText={setText}
        onSubmitEditing={submit}
        returnKeyType="done"
        autoFocus
      />
      <Row style={{ flexWrap: 'nowrap' }}>
        <Button
          testID="study-check"
          style={{ flex: 2 }}
          label="Check"
          disabled={!text.trim()}
          onPress={submit}
        />
        <Button
          testID="study-dont-know"
          style={{ flex: 1 }}
          variant="ghost"
          label="Don't know"
          onPress={() => onResult({ kind: 'revealed', expected: exercise.answer })}
        />
      </Row>
      <Row style={{ flexWrap: 'nowrap', justifyContent: 'space-between' }}>
        {letterShown ? (
          <View />
        ) : (
          <Button
            testID="gap-hint"
            variant="ghost"
            icon="bulb-outline"
            label="Hint"
            accessibilityHint="Shows the first letter. The card counts as Hard."
            onPress={() => {
              setLetterShown(true);
              setUsedHint(true);
            }}
          />
        )}
        <Button
          testID="gap-bad"
          variant="ghost"
          icon="flag-outline"
          label="Bad sentence"
          accessibilityHint="Removes this sentence and asks the card another way"
          onPress={onBadSentence}
        />
      </Row>
    </QuestionLayout>
  );
}
