import type { Article } from './model';

/**
 * The offline noun list: gender and plural for German nouns, built from
 * Wiktionary by scripts/build-noun-list.ts.
 *
 * Table format: lemma -> entries joined by "|". Each entry is
 * "<genders>:<plurals>" where genders is a subset of "mfn", or "p" for
 * plural-only nouns, and plurals are joined by ",". A plural that starts
 * with the lemma is stored as "+" plus the rest, so "+" alone means the
 * plural equals the singular. An empty plural list means no plural.
 *
 * Compounds whose gender and plural follow from their head are not stored;
 * `resolveNoun` derives them from the longest stored suffix.
 */

export type NounGender = 'm' | 'f' | 'n' | 'p';
export interface NounEntry {
  /** Sorted genders, e.g. "m", "mn", or "p" for plural-only. */
  g: string;
  plurals: string[];
}
export type NounTable = Readonly<Record<string, string>>;

export interface NounLookup {
  source: 'exact' | 'compound';
  /** For compounds, the stored head noun the result was derived from. */
  head?: string;
  entries: NounEntry[];
}

const MIN_HEAD_LENGTH = 3;

export function encodeEntries(lemma: string, entries: NounEntry[]): string {
  return entries
    .map(
      (e) =>
        `${e.g}:${e.plurals.map((p) => (p.startsWith(lemma) ? `+${p.slice(lemma.length)}` : p)).join(',')}`,
    )
    .join('|');
}

export function decodeEntries(lemma: string, encoded: string): NounEntry[] {
  return encoded.split('|').map((part) => {
    const colon = part.indexOf(':');
    const plurals = part.slice(colon + 1);
    return {
      g: part.slice(0, colon),
      plurals: plurals
        ? plurals.split(',').map((p) => (p.startsWith('+') ? lemma + p.slice(1) : p))
        : [],
    };
  });
}

export function resolveNoun(table: NounTable, lemma: string): NounLookup | null {
  const exact = table[lemma];
  if (exact !== undefined) return { source: 'exact', entries: decodeEntries(lemma, exact) };

  for (let i = 1; i <= lemma.length - MIN_HEAD_LENGTH; i++) {
    const rest = lemma.slice(i);
    const head = rest[0].toUpperCase() + rest.slice(1);
    const encoded = table[head];
    if (encoded === undefined) continue;
    const prefix = lemma.slice(0, i);
    // "E-Mail" keeps the head's capital; "Wohnungssuche" lowercases it.
    const keepCase = rest[0] === rest[0].toUpperCase();
    return {
      source: 'compound',
      head,
      entries: decodeEntries(head, encoded).map((e) => ({
        g: e.g,
        plurals: e.plurals.map((p) => prefix + (keepCase ? p : p[0].toLowerCase() + p.slice(1))),
      })),
    };
  }
  return null;
}

export function sameEntries(a: NounEntry[], b: NounEntry[]): boolean {
  const key = (es: NounEntry[]) =>
    es
      .map((e) => `${e.g}:${[...e.plurals].sort().join(',')}`)
      .sort()
      .join('|');
  return key(a) === key(b);
}

const GENDER_OF: Record<Article, NounGender> = { der: 'm', die: 'f', das: 'n' };
const ARTICLE_OF: Record<'m' | 'f' | 'n', Article> = { m: 'der', f: 'die', n: 'das' };

export interface NounIssue {
  field: 'article' | 'plural';
  message: string;
}

export interface NounCheck {
  known: boolean;
  source?: 'exact' | 'compound';
  issues: NounIssue[];
  /** What the list suggests when it disagrees. */
  suggestion?: { article: Article | null; plural: string | null };
}

/**
 * Cross-check a noun's article and plural against the list. A noun with
 * several meanings (der/das Band) passes if any of its entries matches.
 */
export function checkNoun(
  lookup: NounLookup | null,
  noun: { article: Article | null; plural: string | null },
): NounCheck {
  if (!lookup) return { known: false, issues: [] };
  const issues: NounIssue[] = [];
  const wanted: NounGender = noun.article ? GENDER_OF[noun.article] : 'p';
  const sameGender = lookup.entries.filter((e) => e.g.includes(wanted));
  const listed = describeArticles(lookup.entries);

  if (sameGender.length === 0) {
    issues.push({
      field: 'article',
      message: noun.article
        ? `Wiktionary lists this noun as ${listed}, not ${noun.article}.`
        : `Wiktionary lists this noun as ${listed}, so it has a singular.`,
    });
    const first = lookup.entries[0];
    return {
      known: true,
      source: lookup.source,
      issues,
      suggestion: {
        article: first.g === 'p' ? null : ARTICLE_OF[first.g[0] as 'm' | 'f' | 'n'],
        plural: first.plurals[0] ?? null,
      },
    };
  }

  const plurals = [...new Set(sameGender.flatMap((e) => e.plurals))];
  const plural = noun.plural?.trim() || null;
  if (plural && plurals.length === 0) {
    issues.push({ field: 'plural', message: 'Wiktionary lists no plural for this noun.' });
  } else if (plural && !plurals.includes(plural)) {
    issues.push({
      field: 'plural',
      message: `Wiktionary gives the plural as ${plurals.join(' or ')}.`,
    });
  } else if (!plural && plurals.length > 0 && wanted !== 'p') {
    issues.push({
      field: 'plural',
      message: `Plural missing. Wiktionary gives ${plurals.join(' or ')}.`,
    });
  }

  return {
    known: true,
    source: lookup.source,
    issues,
    suggestion: issues.length ? { article: noun.article, plural: plurals[0] ?? null } : undefined,
  };
}

function describeArticles(entries: NounEntry[]): string {
  const genders = new Set(entries.flatMap((e) => e.g.split('')));
  const parts: string[] = (['m', 'f', 'n'] as const)
    .filter((g) => genders.has(g))
    .map((g) => ARTICLE_OF[g]);
  if (genders.has('p')) parts.push('plural only');
  return parts.join(' or ');
}
