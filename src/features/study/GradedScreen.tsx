import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { plural } from '@/core/format';
import { markGradesSeen, recentGrades, unseenGrades, waitingGrades } from '@/data/repos/grading';
import { gradeWaiting } from '@/jobs/grading';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { Banner, Screen, Section } from '@/ui/layout';

import { useServices } from '../services';
import { TranslationResult } from './production';
import { useLiveQuery } from '../use-live-query';
import { useOnline } from '../use-online';
import { shortDate } from '../words/describe';

/** Translations graded after you moved on, and the ones still waiting for the LLM. */
export function GradedScreen() {
  const services = useServices();
  const { db, now } = services;
  const online = useOnline();
  const waiting = useLiveQuery(() => waitingGrades(db), ['pending_grade']);
  const graded = useLiveQuery(() => recentGrades(db), ['pending_grade']);
  const [fresh] = useState(() => new Set(unseenGrades(db).map((r) => r.id)));
  const [grading, setGrading] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  // Opening the list counts as seeing them.
  useEffect(() => {
    markGradesSeen(db, [...fresh], now().getTime());
  }, [db, fresh, now]);

  const gradeNow = async () => {
    setGrading(true);
    setProblem(null);
    const report = await gradeWaiting(services);
    setProblem(report.stoppedBy);
    setGrading(false);
  };

  return (
    <Screen testID="graded-screen">
      {waiting.length ? (
        <Section title="Waiting" testID="graded-waiting">
          <AppText>
            {plural(waiting.length, 'answer')} {waiting.length === 1 ? 'waits' : 'wait'} for the
            LLM. Their cards update once graded.
          </AppText>
          {waiting.map((row) => (
            <AppText key={row.id} variant="caption" style={{ fontStyle: 'italic' }}>
              {row.answer}
            </AppText>
          ))}
          <Button
            testID="graded-now"
            label="Grade now"
            variant="secondary"
            loading={grading}
            disabled={!online}
            onPress={() => void gradeNow()}
          />
          {problem ? (
            <Banner tone="warning" testID="graded-problem">
              <AppText color="warningText">{problem}</AppText>
            </Banner>
          ) : null}
        </Section>
      ) : null}

      {graded.length === 0 && waiting.length === 0 ? (
        <AppText testID="graded-none">No graded translations yet.</AppText>
      ) : null}

      {graded.map((row) =>
        row.result ? (
          <Section key={row.id} testID={`graded-${row.id}`}>
            <View style={{ gap: 2 }}>
              <AppText variant="caption">
                {fresh.has(row.id) ? 'New · ' : ''}
                {shortDate(row.answeredAt)}
              </AppText>
              <AppText variant="label">{row.exercise.english}</AppText>
            </View>
            <AppText variant="heading" testID={`graded-corrected-${row.id}`}>
              {row.result.corrected || row.exercise.reference}
            </AppText>
            <TranslationResult grade={row.result} given={row.answer} color="text" />
          </Section>
        ) : null,
      )}
    </Screen>
  );
}
