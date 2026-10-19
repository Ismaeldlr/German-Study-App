import type { CardType, GrammaticalCase } from '@/core/model';
import { DAY_MS } from '@/core/time';

export const CARD_TYPE_LABELS: Record<CardType, string> = {
  recognize: 'Meaning (DE → EN)',
  produce: 'Produce (EN → DE)',
  gender: 'Gender',
  plural: 'Plural',
  verb_forms: 'Verb forms',
  apply_grammar: 'Apply grammar',
};

export const CASE_LABELS: Record<GrammaticalCase, string> = {
  akk: 'Akkusativ',
  dat: 'Dativ',
  gen: 'Genitiv',
  akk_dat: 'Akkusativ or Dativ',
};

export const RATING_LABELS: Record<number, string> = {
  1: 'Again',
  2: 'Hard',
  3: 'Good',
  4: 'Easy',
};

const STATE_LABELS = ['New', 'Learning', 'Review', 'Relearning'];
export const stateLabel = (state: number) => STATE_LABELS[state] ?? 'Unknown';

/** "due now", "due in 3 days", "due in 5 min". */
export function describeDue(due: number, now: number): string {
  const diff = due - now;
  if (diff <= 0) return 'due now';
  const minutes = Math.round(diff / 60_000);
  if (minutes < 60) return `due in ${minutes} min`;
  const hours = Math.round(diff / 3_600_000);
  if (hours < 24) return `due in ${hours} h`;
  const days = Math.round(diff / DAY_MS);
  return days === 1 ? 'due tomorrow' : `due in ${days} days`;
}

export function shortDate(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
