import { CardState } from './cards';
import { seededRandom } from './choices';
import { isAtRisk, newItemAllowance, practiceMode } from './planner';
import { createScheduler, newCardSchedule } from './scheduler';
import { buildGapBundles, type GapTarget, type SupportWord } from './selector';
import { createTopicPicker } from './topics';

const DAY = 86_400_000;
const now = new Date(2026, 9, 19, 9).getTime();

describe('adaptive new items', () => {
  const base = { base: 10, max: 15, minRecall: 0.8, recent: { answers: 0, recalled: 0 } };

  it('starts at the base and drops by one per ten overdue cards', () => {
    expect(newItemAllowance({ ...base, overdue: 0 })).toBe(10);
    expect(newItemAllowance({ ...base, overdue: 9 })).toBe(10);
    expect(newItemAllowance({ ...base, overdue: 35 })).toBe(7);
  });

  it('never goes below 0 or above the max', () => {
    expect(newItemAllowance({ ...base, overdue: 400 })).toBe(0);
    expect(newItemAllowance({ ...base, base: 20, overdue: 0 })).toBe(15);
  });

  it('drops to 0 while recall over the last days is under the floor', () => {
    expect(newItemAllowance({ ...base, overdue: 0, recent: { answers: 20, recalled: 15 } })).toBe(
      0,
    );
    expect(newItemAllowance({ ...base, overdue: 0, recent: { answers: 20, recalled: 16 } })).toBe(
      10,
    );
    // Too few answers to judge.
    expect(newItemAllowance({ ...base, overdue: 0, recent: { answers: 4, recalled: 1 } })).toBe(10);
  });
});

describe('at-risk cards', () => {
  const scheduler = createScheduler({ targetRecall: 0.9, fuzz: false });
  const review = (stability: number, lastReviewDaysAgo: number, dueInDays: number) => ({
    ...newCardSchedule(now),
    state: CardState.Review,
    stability,
    difficulty: 5,
    lastReview: now - lastReviewDaysAgo * DAY,
    due: now + dueInDays * DAY,
    reps: 3,
  });

  it('flags review cards whose recall falls below 85% within three days', () => {
    // Stability 2 days, reviewed 3 days ago, due tomorrow: well under 85% in three days.
    expect(isAtRisk(review(2, 3, 1), now, scheduler)).toBe(true);
    // Stability 60 days: still well above 85% in three days.
    expect(isAtRisk(review(60, 5, 50), now, scheduler)).toBe(false);
  });

  it('leaves due, new and learning cards out', () => {
    expect(isAtRisk(review(4, 3, -1), now, scheduler)).toBe(false);
    expect(isAtRisk(newCardSchedule(now), now, scheduler)).toBe(false);
    expect(isAtRisk({ ...review(1, 0, 0.01), state: CardState.Learning }, now, scheduler)).toBe(
      false,
    );
  });
});

describe('practice mode by maturity', () => {
  it('puts learning and young production cards in gap fill, mature ones in translation', () => {
    expect(practiceMode({ type: 'produce', state: CardState.New, stability: 0 })).toBe('gap_fill');
    expect(practiceMode({ type: 'produce', state: CardState.Learning, stability: 1 })).toBe(
      'gap_fill',
    );
    expect(practiceMode({ type: 'produce', state: CardState.Review, stability: 20 })).toBe(
      'gap_fill',
    );
    expect(practiceMode({ type: 'produce', state: CardState.Review, stability: 21 })).toBe(
      'translation',
    );
    expect(practiceMode({ type: 'gender', state: CardState.Learning, stability: 1 })).toBe(
      'classic',
    );
    expect(practiceMode({ type: 'apply_grammar', state: CardState.New, stability: 0 })).toBe(
      'grammar_drill',
    );
  });
});

describe('topics', () => {
  it('mixes chapter themes and interests, never the same topic twice in a row', () => {
    const next = createTopicPicker(
      { chapterThemes: ['Wohnen', 'Umzug', 'Nachbarn'], interests: ['Fußball', 'Kochen'] },
      seededRandom(7),
    );
    const topics = Array.from({ length: 400 }, next);
    for (let i = 1; i < topics.length; i++) expect(topics[i]).not.toBe(topics[i - 1]);
    const fromChapter = topics.filter((t) => ['Wohnen', 'Umzug', 'Nachbarn'].includes(t)).length;
    expect(fromChapter / topics.length).toBeGreaterThan(0.6);
    expect(fromChapter / topics.length).toBeLessThan(0.8);
  });

  it('falls back to whatever exists', () => {
    const onlyOne = createTopicPicker({ chapterThemes: ['Wohnen'], interests: [] });
    expect([onlyOne(), onlyOne()]).toEqual(['Wohnen', 'Wohnen']);
    expect(createTopicPicker({ chapterThemes: [], interests: [] })()).toBe('Alltag');
  });
});

describe('exercise bundles', () => {
  const target = (itemId: number): GapTarget => ({
    cardId: itemId * 10,
    itemId,
    word: `Wort${itemId}`,
    meanings: ['word'],
    forms: {
      kind: 'noun',
      lemma: `Wort${itemId}`,
      article: 'das',
      plural: null,
      verbPresent3: null,
      verbPreterite: null,
      verbParticiple: null,
      verbAuxiliary: null,
    },
  });
  const pool: SupportWord[] = [
    { itemId: 1, word: 'die Miete', atRisk: true },
    { itemId: 2, word: 'der Balkon', atRisk: false },
    { itemId: 3, word: 'wohnen', atRisk: false },
    { itemId: 4, word: 'hell', atRisk: false },
    { itemId: 5, word: 'der Nachbar', atRisk: true },
  ];

  it('gives each target up to three support words, at-risk words first, never itself', () => {
    const bundles = buildGapBundles([target(1), target(9)], pool, () => 'Wohnen', seededRandom(3));
    expect(bundles[0].support).toHaveLength(3);
    expect(bundles[0].support).not.toContain('die Miete');
    expect(bundles[0].support).toContain('der Nachbar');
    expect(bundles[1].support).toEqual(expect.arrayContaining(['die Miete', 'der Nachbar']));
    expect(bundles.map((b) => b.topic)).toEqual(['Wohnen', 'Wohnen']);
  });

  it('spreads support words over the batch', () => {
    const bundles = buildGapBundles(
      Array.from({ length: 10 }, (_, i) => target(100 + i)),
      pool,
      () => 'Wohnen',
      seededRandom(5),
    );
    const counts = new Map<string, number>();
    for (const b of bundles) for (const s of b.support) counts.set(s, (counts.get(s) ?? 0) + 1);
    // 30 slots over 5 words: at-risk words lead, but nothing is in every bundle.
    for (const count of counts.values()) expect(count).toBeLessThan(10);
    expect(counts.get('die Miete')).toBeGreaterThanOrEqual(counts.get('hell')!);
  });
});
