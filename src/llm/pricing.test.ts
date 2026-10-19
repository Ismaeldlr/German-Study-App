import { approxTokens, estimateCost, monthlyCost } from './pricing';

describe('pricing', () => {
  it('prices tokens per million', () => {
    expect(
      estimateCost({ inputTokens: 1_000_000, outputTokens: 500_000 }, { input: 0.15, output: 0.6 }),
    ).toBeCloseTo(0.45, 10);
  });

  it('costs nothing when the price is unknown', () => {
    expect(estimateCost({ inputTokens: 1000, outputTokens: 1000 }, undefined)).toBe(0);
  });

  it("matches the spec's monthly estimate: 0.9 x input price + 0.35 x output price", () => {
    const heavyMonth = { inputMillions: 0.9, outputMillions: 0.35 };
    expect(monthlyCost(heavyMonth, { input: 0.4, output: 1.6 })).toBeCloseTo(0.92, 10);
    // A cheap small model lands well under the $2 cap.
    expect(monthlyCost(heavyMonth, { input: 0.27, output: 1.1 })).toBeLessThan(2);
  });

  it('estimates about four characters per token', () => {
    expect(approxTokens('')).toBe(0);
    expect(approxTokens('abcd')).toBe(1);
    expect(approxTokens('abcde')).toBe(2);
  });
});
