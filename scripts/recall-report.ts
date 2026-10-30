/**
 * The numbers for the three-month write-up, from a backup file.
 *
 *   npm run report -- path/to/german-study-backup.json [--since 2026-08-01] > report.md
 *
 * Everything comes from the review log, so any export works, on any machine.
 * It prints Markdown: days studied, answers and time, real recall by month
 * and by exercise against the target, how well FSRS predicted your recall,
 * the deck's maturity and LLM spend.
 */
import { readFileSync } from 'fs';

import { calibration, type CalibrationBucket } from '../src/core/calibration';
import { CardState, itemState, type ItemState } from '../src/core/cards';
import type { ExerciseMode } from '../src/core/model';
import { streakFor } from '../src/core/progress';
import { isRecalled } from '../src/core/rating';
import { decodeSetting } from '../src/core/settings';
import { minutesByDay } from '../src/core/stats';
import { localDay } from '../src/core/time';

interface Review {
  cardId: number;
  reviewedAt: number;
  rating: number;
  mode: ExerciseMode;
  responseMs: number | null;
  stateBefore: number;
}
interface Card {
  id: number;
  itemId: number;
  state: number;
  stability: number;
  suspended: boolean | number;
}
interface Item {
  id: number;
  kind: string;
  status: string;
}

const MODE_LABELS: Record<ExerciseMode, string> = {
  classic: 'Classic cards',
  gap_fill: 'Gap fills',
  translation: 'Translations',
  grammar_drill: 'Grammar drills',
  contrast: 'Mix-up sets',
  story: 'Stories',
  chat: 'Chats',
};

function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--'));
  const sinceArg = args.indexOf('--since');
  const since = sinceArg >= 0 ? args[sinceArg + 1] : null;
  if (!file) {
    console.error('Usage: npm run report -- <backup.json> [--since YYYY-MM-DD]');
    process.exit(1);
  }
  const backup = JSON.parse(readFileSync(file, 'utf8')) as {
    exportedAt: string;
    tables: Record<string, Record<string, unknown>[]>;
  };
  const table = <T>(name: string) => (backup.tables[name] ?? []) as unknown as T[];
  const sinceMs = since ? new Date(`${since}T00:00:00`).getTime() : -Infinity;
  const reviews = table<Review>('review')
    .filter((r) => r.reviewedAt >= sinceMs)
    .sort((a, b) => a.reviewedAt - b.reviewedAt);
  if (reviews.length === 0) {
    console.error('No reviews in this backup for that period.');
    process.exit(1);
  }
  const settings = new Map(
    table<{ key: string; value: string }>('settings').map((s) => [s.key, s.value]),
  );
  const target = decodeSetting('study.targetRecall', settings.get('study.targetRecall'));
  const chatTimes = table<{ messages: { role: string; at: number }[] }>('chat')
    .flatMap((c) => c.messages.filter((m) => m.role === 'user').map((m) => m.at))
    .filter((at) => at >= sinceMs);

  const first = localDay(new Date(reviews[0].reviewedAt));
  const last = localDay(new Date(reviews[reviews.length - 1].reviewedAt));
  const activeDays = new Set([
    ...reviews.map((r) => localDay(new Date(r.reviewedAt))),
    ...chatTimes.map((at) => localDay(new Date(at))),
  ]);
  const span =
    Math.round((Date.parse(`${last}T12:00:00`) - Date.parse(`${first}T12:00:00`)) / 86_400_000) + 1;
  const streak = streakFor(activeDays, last);
  const minutes = [
    ...minutesByDay([
      ...reviews.map((r) => ({ at: r.reviewedAt, ms: r.responseMs })),
      ...chatTimes.map((at) => ({ at, ms: null })),
    ]).values(),
  ].reduce((a, b) => a + b, 0);

  // Real recall: answers on cards that were in review.
  const real = reviews.filter((r) => r.stateBefore === CardState.Review);
  const share = (rs: readonly Review[]) =>
    rs.length ? rs.filter((r) => isRecalled(r.rating)).length / rs.length : null;
  const byMonth = group(real, (r) => localDay(new Date(r.reviewedAt)).slice(0, 7));
  const byMode = group(real, (r) => r.mode);

  // Deck as of the export.
  const cards = table<Card>('card');
  const cardsByItem = group(cards, (c) => c.itemId);
  const states: ItemState[] = table<Item>('item')
    .filter((i) => i.kind !== 'grammar')
    .map((i) =>
      i.status === 'suspended'
        ? 'suspended'
        : itemState(
            (cardsByItem.get(i.id) ?? []).map((c) => ({
              state: c.state,
              stability: c.stability,
              suspended: Boolean(c.suspended),
            })),
          ),
    );
  const count = (s: ItemState) => states.filter((x) => x === s).length;

  const usage = table<{ day: string; estimatedCost: number }>('llm_usage').filter(
    (u) => !since || u.day >= since,
  );
  const spend = usage.reduce((sum, u) => sum + u.estimatedCost, 0);
  const months = new Set(usage.map((u) => u.day.slice(0, 7))).size || 1;

  const buckets = calibration(reviews).filter((b) => b.answers);
  const gap = calibrationGap(buckets);

  const out: string[] = [];
  out.push('# Recall report', '');
  out.push(`${first} to ${last}, from a backup exported ${backup.exportedAt.slice(0, 10)}.`, '');
  out.push('## At a glance', '', '| | |', '| --- | --- |');
  out.push(`| Days studied | ${activeDays.size} of ${span} (${pct(activeDays.size / span)}) |`);
  out.push(`| Longest streak | ${streak.best} days, freezes included |`);
  out.push(
    `| Answers | ${fmt(reviews.length)} (${Math.round(reviews.length / activeDays.size)} per study day) |`,
  );
  out.push(
    `| Time studied | ${hours(minutes)} (${Math.round(minutes / activeDays.size)} min per study day) |`,
  );
  out.push(`| Words in the deck | ${fmt(states.length)}, ${fmt(count('mature'))} of them mature |`);
  out.push(`| LLM spend | $${spend.toFixed(2)} ($${(spend / months).toFixed(2)} a month) |`, '');

  out.push('## Real recall', '');
  out.push(
    `Answers on cards that came back for review, against a target of ${pct(target)}. Learning steps of new words are left out.`,
    '',
  );
  out.push(`Overall: **${pct(share(real))}** over ${fmt(real.length)} answers.`, '');
  out.push('| Month | Answers | Recall |', '| --- | ---: | ---: |');
  for (const [month, rs] of [...byMonth].sort()) {
    out.push(`| ${month} | ${fmt(rs.length)} | ${pct(share(rs))} |`);
  }
  out.push('', '| Exercise | Answers | Recall |', '| --- | ---: | ---: |');
  for (const [mode, rs] of [...byMode].sort((a, b) => b[1].length - a[1].length)) {
    out.push(`| ${MODE_LABELS[mode] ?? mode} | ${fmt(rs.length)} | ${pct(share(rs))} |`);
  }

  out.push('', '## Is FSRS right about me?', '');
  out.push(
    'Every card is replayed through FSRS. Before each review it predicted a chance of remembering; grouped by that prediction, this is how often I actually did.',
    '',
  );
  out.push('| Predicted | Answers | Mean prediction | Actual |', '| --- | ---: | ---: | ---: |');
  for (const b of buckets) {
    out.push(
      `| ${pct(b.from)}–${pct(Math.min(1, b.to))} | ${fmt(b.answers)} | ${pct(b.predicted)} | ${pct(b.actual)} |`,
    );
  }
  out.push('');
  if (gap === null) out.push('Not enough reviews yet to judge.');
  else if (Math.abs(gap) < 0.03) {
    out.push(
      `Actual recall is within ${points(gap)} of the predictions: the default parameters fit.`,
    );
  } else {
    out.push(
      `Actual recall is ${points(gap)} ${gap < 0 ? 'below' : 'above'} the predictions. ${
        gap < 0
          ? 'FSRS is too optimistic for me; fitting its parameters to this review log would bring reviews sooner.'
          : 'FSRS is too cautious for me; fitting its parameters would space reviews further apart.'
      }`,
    );
  }
  out.push('');
  process.stdout.write(out.join('\n'));
}

function group<T, K>(rows: readonly T[], key: (row: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const row of rows) map.set(key(row), [...(map.get(key(row)) ?? []), row]);
  return map;
}

/** Answer-weighted mean of actual minus predicted recall. */
function calibrationGap(buckets: readonly CalibrationBucket[]): number | null {
  const answers = buckets.reduce((sum, b) => sum + b.answers, 0);
  if (answers < 30) return null;
  return buckets.reduce((sum, b) => sum + (b.actual - b.predicted) * b.answers, 0) / answers;
}

const pct = (x: number | null) => (x === null ? '—' : `${Math.round(x * 100)}%`);
const points = (x: number) => {
  const n = Math.abs(Math.round(x * 100));
  return `${n} ${n === 1 ? 'point' : 'points'}`;
};
const fmt = (n: number) => n.toLocaleString('en-US');
const hours = (minutes: number) =>
  `${Math.floor(minutes / 60)} h ${String(Math.round(minutes % 60)).padStart(2, '0')} min`;

main();
