import type { ModelPrice } from '@/core/settings';

/** USD cost of a call given per-million-token prices. Unknown prices cost 0. */
export function estimateCost(
  tokens: { inputTokens: number; outputTokens: number },
  price: ModelPrice | undefined,
): number {
  if (!price) return 0;
  return (tokens.inputTokens * price.input + tokens.outputTokens * price.output) / 1_000_000;
}

/** Rough token count for text we are about to send: about four characters per token. */
export function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Monthly cost for a usage pattern, as in the spec's estimate: input and
 * output tokens per month in millions times the prices.
 */
export function monthlyCost(
  monthly: { inputMillions: number; outputMillions: number },
  price: ModelPrice,
): number {
  return monthly.inputMillions * price.input + monthly.outputMillions * price.output;
}
