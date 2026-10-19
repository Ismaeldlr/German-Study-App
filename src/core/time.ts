const DAY_MS = 24 * 60 * 60 * 1000;

export { DAY_MS };

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Local calendar day as YYYY-MM-DD. */
export function localDay(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Local calendar month as YYYY-MM. */
export function localMonth(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

/** Milliseconds at local midnight that starts the given date's day. */
export function startOfLocalDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** Milliseconds at the local midnight that ends the given date's day. */
export function endOfLocalDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime();
}
