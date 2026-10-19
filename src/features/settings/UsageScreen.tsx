import { View } from 'react-native';

import { formatCount, formatUsd, plural } from '@/core/format';
import { exerciseStats } from '@/data/repos/exercises';
import { getAllSettings } from '@/data/repos/settings';
import { monthToDate, recentUsage } from '@/data/repos/usage';
import { runPrefetch, usePrefetchStore, type PrefetchReport } from '@/jobs/prefetch';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { Banner, Screen, Section } from '@/ui/layout';
import { radius, useTheme } from '@/ui/theme';

import { useServices } from '../services';
import { useLiveQuery } from '../use-live-query';
import { useOnline } from '../use-online';

const MODE_LABELS: Record<string, string> = {
  gap_fill: 'Gap sentences',
  translation: 'Translations',
  grammar_drill: 'Grammar drills',
  story: 'Stories',
  chat: 'Chats',
  classic: 'Classic',
};

/**
 * Where the LLM money goes: this month against the cap, spend per day and
 * model, and the generated-content cache, with how often each prompt
 * version produced a sentence you threw out.
 */
export function UsageScreen() {
  const services = useServices();
  const { db, now } = services;
  const theme = useTheme();
  const online = useOnline();
  const cap = useLiveQuery(() => getAllSettings(db)['llm.monthlyCap'], ['settings']);
  const month = useLiveQuery(() => monthToDate(db, now()), ['llm_usage']);
  const days = useLiveQuery(() => recentUsage(db, 30), ['llm_usage']);
  const stats = useLiveQuery(() => exerciseStats(db), ['exercise']);
  const prefetch = usePrefetchStore();
  const share = cap > 0 ? Math.min(1, month.cost / cap) : 1;
  const over = month.cost >= cap;

  return (
    <Screen testID="usage-screen">
      <Section title="This month">
        <AppText variant="heading" testID="usage-spent">
          {formatUsd(month.cost)} of {formatUsd(cap)}
        </AppText>
        <View
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: 100, now: Math.round(share * 100) }}
          style={{ height: 8, borderRadius: radius.sm, backgroundColor: theme.surfaceAlt }}
        >
          <View
            style={{
              width: `${share * 100}%`,
              height: 8,
              borderRadius: radius.sm,
              backgroundColor: over ? theme.danger : theme.primary,
            }}
          />
        </View>
        <AppText variant="caption">
          {plural(month.calls, 'call')} · {formatCount(month.tokensIn)} in /{' '}
          {formatCount(month.tokensOut)} out tokens
        </AppText>
        {over ? (
          <Banner tone="warning" testID="usage-over-cap">
            <AppText color="warningText">
              The cap is reached. LLM calls are blocked until next month; reviews, cached sentences
              and classic cards still work.
            </AppText>
          </Banner>
        ) : null}
      </Section>

      <Section title="Generated content" testID="usage-cache">
        {stats.length === 0 ? (
          <AppText variant="caption">Nothing generated yet.</AppText>
        ) : (
          stats.map((s) => (
            <View key={`${s.mode}-${s.promptVersion}`} style={{ gap: 2 }}>
              <AppText variant="label">
                {MODE_LABELS[s.mode] ?? s.mode} · {s.promptVersion}
              </AppText>
              <AppText variant="caption" testID={`usage-cache-${s.promptVersion}`}>
                {s.ready} ready · {s.used} used · {s.discarded} marked bad
                {s.used + s.discarded > 0
                  ? ` (${Math.round((s.discarded / (s.used + s.discarded)) * 100)}%)`
                  : ''}
              </AppText>
            </View>
          ))
        )}
        <AppText variant="caption" testID="usage-prefetch">
          {prefetch.running
            ? 'Writing new sentences…'
            : prefetch.last
              ? describeTopUp(prefetch.last)
              : 'The cache tops up when the app opens online and after each session.'}
        </AppText>
        <Button
          testID="usage-top-up"
          label="Top up now"
          variant="secondary"
          loading={prefetch.running}
          disabled={!online}
          onPress={() => void runPrefetch(services)}
        />
      </Section>

      <Section title="By day">
        {days.length === 0 ? (
          <AppText variant="caption">No LLM calls yet.</AppText>
        ) : (
          days.map((row) => (
            <AppText key={row.id} variant="caption" testID={`usage-day-${row.id}`}>
              {row.day} · {row.model} · {plural(row.calls, 'call')} · {formatCount(row.tokensIn)} in
              / {formatCount(row.tokensOut)} out · {formatUsd(row.estimatedCost)}
            </AppText>
          ))
        )}
      </Section>
    </Screen>
  );
}

function describeTopUp(report: PrefetchReport): string {
  const parts: string[] = [];
  if (report.generated) parts.push(plural(report.generated, 'new sentence'));
  if (report.rejected) parts.push(`${report.rejected} rejected`);
  if (report.suggestions) parts.push(plural(report.suggestions, 'suggestion'));
  if (report.stoppedBy) {
    return parts.length
      ? `Last top-up: ${parts.join(', ')}, then stopped: ${report.stoppedBy}`
      : `Last top-up stopped: ${report.stoppedBy}`;
  }
  return `Last top-up: ${parts.length ? parts.join(', ') : 'nothing needed, the cache was full'}.`;
}
