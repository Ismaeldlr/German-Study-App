/** Parse a user-typed decimal. Accepts a comma, as German keyboards type it. */
export function parseDecimal(text: string): number | null {
  const cleaned = text.trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$|^\.\d+$|^\d+\.$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

/** Dollar amounts small enough to need more precision than cents. */
export function formatUsd(amount: number): string {
  if (amount === 0) return '$0.00';
  if (amount < 0.0001) return '<$0.0001';
  if (amount < 0.01) return `$${amount.toFixed(4)}`;
  return `$${amount.toFixed(2)}`;
}

export function formatCount(n: number): string {
  return n.toLocaleString('en-US');
}

/** "1 call", "3 calls". */
export function plural(n: number, singular: string, pluralForm = `${singular}s`): string {
  return `${formatCount(n)} ${n === 1 ? singular : pluralForm}`;
}
