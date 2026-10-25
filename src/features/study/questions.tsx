import { useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { displayLemma } from '@/core/cards';
import { buildChoices, meaningText, type ChoiceSource } from '@/core/choices';
import {
  gradeGender,
  gradePlural,
  gradeProduce,
  gradeVerbForms,
  type CardGrade,
} from '@/core/grading';
import type { Article, Example } from '@/core/model';
import type { ItemRow } from '@/data/schema';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { Row } from '@/ui/layout';
import { FadeIn } from '@/ui/motion';
import { elevation, genderColors, radius, spacing, useTheme } from '@/ui/theme';
import { GermanField } from '@/ui/umlaut';
import { Lemma } from '@/ui/visuals';

/** What a question reports back; the screen turns it into an FSRS rating. */
export type QuestionResult =
  | { kind: 'graded'; grade: CardGrade; answer: string | null; usedHint?: boolean }
  | { kind: 'revealed'; expected: string };

export type OnResult = (result: QuestionResult) => void;

/**
 * Prompt in the top half, on a card, and answer controls in the bottom
 * half, so the whole session works one-handed.
 */
export function QuestionLayout({ prompt, children }: { prompt: ReactNode; children: ReactNode }) {
  return (
    <View style={styles.layout}>
      <View style={styles.prompt}>
        <PromptCard>{prompt}</PromptCard>
      </View>
      <View style={styles.controls}>{children}</View>
    </View>
  );
}

/** The flashcard itself: it pops in for every new question. */
export function PromptCard({ children, accent }: { children: ReactNode; accent?: string }) {
  const theme = useTheme();
  return (
    <FadeIn from="scale">
      <View
        style={[
          styles.card,
          { backgroundColor: theme.surface, borderColor: theme.border },
          elevation(theme, 2),
        ]}
      >
        {accent ? <View style={[styles.cardAccent, { backgroundColor: accent }]} /> : null}
        {children}
      </View>
    </FadeIn>
  );
}

/** A small coloured label at the top of a card: what kind of question this is. */
export function PromptLabel({ children, testID }: { children: string; testID?: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.label, { backgroundColor: theme.primarySoft }]}>
      <AppText variant="overline" style={{ color: theme.primary }} testID={testID}>
        {children}
      </AppText>
    </View>
  );
}

function Prompt({
  label,
  text,
  word,
  sub,
}: {
  label: string;
  text?: string;
  /** A deck word, shown with its article in colour. */
  word?: ItemRow;
  sub?: string | null;
}) {
  return (
    <View style={styles.promptBody}>
      <PromptLabel>{label}</PromptLabel>
      {word ? (
        <Lemma item={word} variant="title" style={styles.promptText} testID="study-prompt" />
      ) : (
        <AppText variant="title" style={styles.promptText} testID="study-prompt">
          {text}
        </AppText>
      )}
      {sub ? (
        <AppText variant="caption" style={{ textAlign: 'center' }}>
          {sub}
        </AppText>
      ) : null}
    </View>
  );
}

export function IntroCard({
  item,
  note,
  onContinue,
}: {
  item: ItemRow;
  /** A grammar point's rule and examples. */
  note?: { ruleSummary: string; examples: Example[] } | null;
  onContinue: () => void;
}) {
  const theme = useTheme();
  if (item.kind === 'grammar') {
    return (
      <View style={styles.layout}>
        <View style={styles.prompt}>
          <PromptCard accent={theme.primary}>
            <View style={styles.promptBody} testID="study-intro">
              <Text style={styles.introIcon}>🧩</Text>
              <PromptLabel>New grammar point</PromptLabel>
              <AppText variant="title" style={styles.promptText}>
                {item.lemma}
              </AppText>
              {item.meanings[0] ? (
                <AppText variant="caption" style={{ textAlign: 'center' }}>
                  {item.meanings[0]}
                </AppText>
              ) : null}
              {note?.ruleSummary ? (
                <AppText style={{ textAlign: 'center' }}>{note.ruleSummary}</AppText>
              ) : null}
              {(note?.examples ?? []).map((e, i) => (
                <ExampleBlock key={i} de={e.de} en={e.en} />
              ))}
            </View>
          </PromptCard>
        </View>
        <View style={styles.controls}>
          <Button testID="study-intro-continue" size="large" label="Try it" onPress={onContinue} />
        </View>
      </View>
    );
  }
  const gender = genderColors(theme, item.kind === 'noun' ? item.article : null);
  return (
    <View style={styles.layout}>
      <View style={styles.prompt}>
        <PromptCard accent={gender.fg}>
          <View style={styles.promptBody} testID="study-intro">
            <Text style={styles.introIcon}>✨</Text>
            <PromptLabel>New word</PromptLabel>
            <Lemma item={item} variant="display" style={styles.promptText} />
            {item.kind === 'noun' && item.plural && item.article ? (
              <AppText variant="caption">Plural: die {item.plural}</AppText>
            ) : null}
            {item.kind === 'verb' && item.verbParticiple ? (
              <AppText variant="caption">
                {item.verbPresent3} · {item.verbPreterite} ·{' '}
                {item.verbAuxiliary === 'sein' ? 'ist' : 'hat'} {item.verbParticiple}
              </AppText>
            ) : null}
            <AppText variant="heading" style={{ textAlign: 'center', color: gender.fg }}>
              {item.meanings.join('; ')}
            </AppText>
            {item.exampleDe ? <ExampleBlock de={item.exampleDe} en={item.exampleEn} /> : null}
          </View>
        </PromptCard>
      </View>
      <View style={styles.controls}>
        <Button testID="study-intro-continue" size="large" label="Got it" onPress={onContinue} />
      </View>
    </View>
  );
}

/** An example sentence in a soft quote block. */
export function ExampleBlock({ de, en }: { de: string; en?: string | null }) {
  const theme = useTheme();
  return (
    <View style={[styles.example, { backgroundColor: theme.surfaceAlt }]}>
      <AppText style={{ textAlign: 'center', fontStyle: 'italic' }}>{de}</AppText>
      {en ? (
        <AppText variant="caption" style={{ textAlign: 'center' }}>
          {en}
        </AppText>
      ) : null}
    </View>
  );
}

export function RecognizeQuestion({
  item,
  pool,
  onResult,
}: {
  item: ItemRow;
  pool: ChoiceSource[];
  onResult: OnResult;
}) {
  const [choices] = useState(() => buildChoices(item, pool));
  const [revealed, setRevealed] = useState(false);
  const expected = meaningText(item.meanings);
  const prompt = <Prompt label="What does this mean?" word={item} />;

  if (!choices) {
    // Too few words in the deck for multiple choice yet.
    return (
      <QuestionLayout prompt={prompt}>
        {revealed ? (
          <>
            <AppText variant="heading" style={{ textAlign: 'center' }}>
              {expected}
            </AppText>
            <Row style={{ flexWrap: 'nowrap' }}>
              <Button
                testID="study-knew"
                style={{ flex: 1 }}
                label="I knew it"
                onPress={() =>
                  onResult({
                    kind: 'graded',
                    grade: { outcome: 'correct', slips: [], expected, mistakes: [] },
                    answer: null,
                  })
                }
              />
              <Button
                testID="study-didnt"
                style={{ flex: 1 }}
                variant="secondary"
                label="I didn't"
                onPress={() => onResult({ kind: 'revealed', expected })}
              />
            </Row>
          </>
        ) : (
          <Button
            testID="study-show"
            size="large"
            label="Show meaning"
            onPress={() => setRevealed(true)}
          />
        )}
      </QuestionLayout>
    );
  }

  return (
    <QuestionLayout prompt={prompt}>
      {choices.options.map((option, index) => (
        <Button
          key={option.itemId}
          testID={`study-choice-${index}`}
          variant="secondary"
          label={option.text}
          onPress={() =>
            onResult({
              kind: 'graded',
              answer: option.text,
              grade:
                index === choices.correctIndex
                  ? { outcome: 'correct', slips: [], expected, mistakes: [] }
                  : {
                      outcome: 'wrong',
                      slips: [],
                      expected,
                      mistakes: [
                        {
                          category: 'wrong_word',
                          yourText: option.text,
                          correction: expected,
                          explanation: `${displayLemma(item)} means ${expected}.`,
                          // The meaning you picked belongs to this word.
                          confusedItemId: option.itemId,
                        },
                      ],
                    },
            })
          }
        />
      ))}
      <Button
        testID="study-dont-know"
        variant="ghost"
        label="I don't know"
        onPress={() => onResult({ kind: 'revealed', expected })}
      />
    </QuestionLayout>
  );
}

function TypedAnswer({
  placeholder,
  onSubmit,
  onReveal,
}: {
  placeholder: string;
  onSubmit: (text: string) => void;
  onReveal: () => void;
}) {
  const [text, setText] = useState('');
  return (
    <>
      <GermanField
        testID="study-answer"
        accessibilityLabel="Your answer"
        placeholder={placeholder}
        value={text}
        onChangeText={setText}
        onSubmitEditing={() => text.trim() && onSubmit(text)}
        returnKeyType="done"
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
    </>
  );
}

export function ProduceQuestion({ item, onResult }: { item: ItemRow; onResult: OnResult }) {
  return (
    <QuestionLayout
      prompt={
        <Prompt
          label={`Say it in German (${item.kind})`}
          text={item.meanings.join('; ')}
          sub={item.kind === 'noun' ? 'The article is optional here.' : null}
        />
      }
    >
      <TypedAnswer
        placeholder={item.kind === 'noun' ? 'die …' : 'German'}
        onSubmit={(text) =>
          onResult({ kind: 'graded', grade: gradeProduce(item, text), answer: text })
        }
        onReveal={() => onResult({ kind: 'revealed', expected: displayLemma(item) })}
      />
    </QuestionLayout>
  );
}

export function GenderQuestion({ item, onResult }: { item: ItemRow; onResult: OnResult }) {
  const theme = useTheme();
  const articles: Article[] = ['der', 'die', 'das'];
  return (
    <QuestionLayout
      prompt={
        <Prompt label="Which article?" text={`… ${item.lemma}`} sub={meaningText(item.meanings)} />
      }
    >
      <Row style={{ flexWrap: 'nowrap' }}>
        {articles.map((article) => (
          <Button
            key={article}
            testID={`study-article-${article}`}
            style={{ flex: 1 }}
            size="large"
            tint={{ face: genderColors(theme, article).fg, text: theme.onPrimary }}
            label={article}
            onPress={() =>
              onResult({ kind: 'graded', grade: gradeGender(item, article), answer: article })
            }
          />
        ))}
      </Row>
    </QuestionLayout>
  );
}

export function PluralQuestion({ item, onResult }: { item: ItemRow; onResult: OnResult }) {
  return (
    <QuestionLayout
      prompt={<Prompt label="What is the plural?" word={item} sub={meaningText(item.meanings)} />}
    >
      <TypedAnswer
        placeholder="die …"
        onSubmit={(text) =>
          onResult({ kind: 'graded', grade: gradePlural(item, text), answer: text })
        }
        onReveal={() => onResult({ kind: 'revealed', expected: `die ${item.plural}` })}
      />
    </QuestionLayout>
  );
}

export function VerbFormsQuestion({ item, onResult }: { item: ItemRow; onResult: OnResult }) {
  const [present3, setPresent3] = useState('');
  const [preterite, setPreterite] = useState('');
  const [perfect, setPerfect] = useState('');
  const ready = present3.trim() && preterite.trim() && perfect.trim();
  const submit = () => {
    if (!ready) return;
    const grade = gradeVerbForms(item, { present3, preterite, perfect });
    onResult({ kind: 'graded', grade, answer: `${present3} | ${preterite} | ${perfect}` });
  };
  const expected = `${item.verbPresent3}, ${item.verbPreterite}, ${item.verbAuxiliary === 'sein' ? 'ist' : 'hat'} ${item.verbParticiple}`;
  return (
    <QuestionLayout
      prompt={
        <Prompt label="Verb forms (er/sie/es)" text={item.lemma} sub={meaningText(item.meanings)} />
      }
    >
      <GermanField
        testID="study-present3"
        label="Präsens"
        placeholder="er …"
        value={present3}
        onChangeText={setPresent3}
        autoFocus
      />
      <GermanField
        testID="study-preterite"
        label="Präteritum"
        placeholder="er …"
        value={preterite}
        onChangeText={setPreterite}
      />
      <GermanField
        testID="study-perfect"
        label="Perfekt"
        placeholder="er hat/ist …"
        value={perfect}
        onChangeText={setPerfect}
        onSubmitEditing={submit}
        returnKeyType="done"
      />
      <Row style={{ flexWrap: 'nowrap' }}>
        <Button
          testID="study-check"
          style={{ flex: 2 }}
          label="Check"
          disabled={!ready}
          onPress={submit}
        />
        <Button
          testID="study-dont-know"
          style={{ flex: 1 }}
          variant="ghost"
          label="Don't know"
          onPress={() => onResult({ kind: 'revealed', expected })}
        />
      </Row>
    </QuestionLayout>
  );
}

const styles = StyleSheet.create({
  layout: { flex: 1, gap: spacing.lg },
  prompt: { flex: 1, justifyContent: 'center', minHeight: 160 },
  controls: { gap: spacing.sm, paddingBottom: spacing.sm },
  card: {
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    overflow: 'hidden',
  },
  cardAccent: { position: 'absolute', top: 0, left: 0, right: 0, height: 6 },
  promptBody: { alignItems: 'center', gap: spacing.sm },
  promptText: { textAlign: 'center' },
  label: {
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  introIcon: { fontSize: 34 },
  example: {
    alignSelf: 'stretch',
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 2,
    marginTop: spacing.xs,
  },
  panel: { borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm, borderWidth: 2 },
});

export function FeedbackPanel({
  tone,
  children,
  testID,
}: {
  tone: 'good' | 'okay' | 'bad';
  children: ReactNode;
  testID?: string;
}) {
  const theme = useTheme();
  const bg = tone === 'good' ? theme.successBg : tone === 'okay' ? theme.warningBg : theme.errorBg;
  const edge = tone === 'good' ? theme.success : tone === 'okay' ? theme.warning : theme.danger;
  return (
    <View testID={testID} style={[styles.panel, { backgroundColor: bg, borderColor: edge }]}>
      {children}
    </View>
  );
}
