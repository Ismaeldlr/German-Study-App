import { createTestDb } from '../testing/test-db';
import { createBudgetGuard } from './budget';
import { setSetting } from './settings';
import { createUsageRecorder, monthToDate, recentUsage, recordUsage } from './usage';

const price = { input: 0.5, output: 2 };

function entry(at: Date, inputTokens = 1000, outputTokens = 500, model = 'gpt-test') {
  return { provider: 'openai', model, inputTokens, outputTokens, at };
}

describe('llm_usage repository', () => {
  it('adds calls on the same day, provider and model into one row', async () => {
    const db = await createTestDb();
    const day = new Date(2026, 9, 19, 10);
    recordUsage(db, entry(day), price);
    recordUsage(db, entry(new Date(2026, 9, 19, 22), 200, 100), price);
    const rows = recentUsage(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      day: '2026-10-19',
      provider: 'openai',
      model: 'gpt-test',
      calls: 2,
      tokensIn: 1200,
      tokensOut: 600,
    });
    // 1200 * 0.5 / 1M + 600 * 2 / 1M
    expect(rows[0].estimatedCost).toBeCloseTo(0.0018, 10);
  });

  it('keeps separate rows per day and per model', async () => {
    const db = await createTestDb();
    recordUsage(db, entry(new Date(2026, 9, 19)), price);
    recordUsage(db, entry(new Date(2026, 9, 20)), price);
    recordUsage(db, entry(new Date(2026, 9, 20), 1, 1, 'other-model'), price);
    expect(recentUsage(db)).toHaveLength(3);
  });

  it('totals the current month only', async () => {
    const db = await createTestDb();
    recordUsage(db, entry(new Date(2026, 8, 30)), price);
    recordUsage(db, entry(new Date(2026, 9, 1)), price);
    recordUsage(db, entry(new Date(2026, 9, 31)), price);
    const totals = monthToDate(db, new Date(2026, 9, 15));
    expect(totals.calls).toBe(2);
    expect(totals.tokensIn).toBe(2000);
    expect(totals.cost).toBeCloseTo(0.003, 10);
  });

  it('returns zeros for an empty month', async () => {
    const db = await createTestDb();
    expect(monthToDate(db, new Date())).toEqual({ calls: 0, tokensIn: 0, tokensOut: 0, cost: 0 });
  });

  it('prices calls from settings, and logs tokens even without a price', async () => {
    const db = await createTestDb();
    const recorder = createUsageRecorder(db);
    recorder.record(entry(new Date(2026, 9, 19)));
    setSetting(db, 'llm.prices', { 'gpt-test': price });
    recorder.record(entry(new Date(2026, 9, 19)));
    const [row] = recentUsage(db);
    expect(row.calls).toBe(2);
    expect(row.tokensIn).toBe(2000);
    expect(row.estimatedCost).toBeCloseTo(0.0015, 10);
  });
});

describe('budget guard', () => {
  it('allows calls under the cap and blocks one that would pass it', async () => {
    const db = await createTestDb();
    const now = () => new Date(2026, 9, 19);
    setSetting(db, 'llm.monthlyCap', 0.01);
    const guard = createBudgetGuard(db, now);
    expect(guard.check(0.001)).toEqual({ allowed: true });

    recordUsage(db, entry(now(), 10_000, 2_000), price); // $0.009
    expect(guard.check(0.0005)).toEqual({ allowed: true });
    const blocked = guard.check(0.002);
    expect(blocked.allowed).toBe(false);
    if (!blocked.allowed) {
      expect(blocked.spent).toBeCloseTo(0.009, 10);
      expect(blocked.cap).toBe(0.01);
    }
  });

  it('starts fresh in a new month', async () => {
    const db = await createTestDb();
    setSetting(db, 'llm.monthlyCap', 0.01);
    recordUsage(db, entry(new Date(2026, 8, 30), 100_000, 100_000), price);
    expect(createBudgetGuard(db, () => new Date(2026, 9, 1)).check(0.001).allowed).toBe(true);
  });

  it('blocks everything when the cap is zero', async () => {
    const db = await createTestDb();
    setSetting(db, 'llm.monthlyCap', 0);
    expect(createBudgetGuard(db).check(0.000001).allowed).toBe(false);
    // Even a call whose price is unknown, and so estimates at $0.
    expect(createBudgetGuard(db).check(0).allowed).toBe(false);
  });
});
