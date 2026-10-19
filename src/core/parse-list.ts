import type { Article, Auxiliary } from './model';

/**
 * Parse a vocabulary list pasted from class. It understands textbook
 * notation (die Wohnung, -en / umziehen, zog um, ist umgezogen), lines with
 * translations, bullets and numbering. What it reads from the notation is
 * a hint: the LLM fills in the rest, and the textbook wins on conflicts.
 */

export interface ListHints {
  article?: Article;
  lemma?: string;
  /** Expanded plural. null means the list says there is no plural. */
  plural?: string | null;
  pluralOnly?: boolean;
  perfect?: { auxiliary: Auxiliary; participle: string };
  translation?: string;
}

export interface ParsedLine {
  index: number;
  raw: string;
  /** The German part, cleaned of bullets and the translation. */
  german: string;
  hints: ListHints;
  unclear: boolean;
  reason?: string;
  /** Headings are shown for review but never sent to the LLM. */
  heading?: boolean;
}

const BULLET_RE = /^\s*(?:[-•*·▪◦–—>]+|\(?\d{1,3}[.)])\s+/;
const HEADING_RE =
  /^(kapitel|lektion|seite|wortschatz|einheit|modul|chapter|page|unit|lesson|vocabulary)\b/i;
const TRANSLATION_SEPARATORS = ['\t', ' – ', ' — ', ' - ', ' = ', ' : '];
const NOUN_RE = /^(der|die|das)\s+([^,(]+?)\s*(?:\(([^)]*)\))?\s*(?:,\s*(.+))?$/i;
const PLURAL_ONLY_RE = /^(nur\s+)?(pl\.?|plural)$/i;
const NO_PLURAL_RE =
  /^(nur\s+sg\.?|sg\.?|singular|kein\s+pl\.?|o\.\s*pl\.?|ohne\s+pl\.?|nur\s+singular)$/i;

export function parseVocabularyList(text: string): ParsedLine[] {
  const lines: ParsedLine[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const raw = rawLine.trim();
    if (!raw || !/\p{L}/u.test(raw)) continue;
    lines.push(parseLine(raw, lines.length));
  }
  return lines;
}

export function parseLine(raw: string, index = 0): ParsedLine {
  const cleaned = raw.replace(BULLET_RE, '').replace(/\s+/g, ' ').trim();
  if (HEADING_RE.test(cleaned) && cleaned.split(' ').length <= 5) {
    return {
      index,
      raw,
      german: cleaned,
      hints: {},
      unclear: true,
      reason: 'Looks like a heading',
      heading: true,
    };
  }

  const { german, translation } = splitTranslation(cleaned);
  const hints: ListHints = {};
  if (translation) hints.translation = translation;

  const noun = NOUN_RE.exec(german);
  if (noun) {
    hints.article = noun[1].toLowerCase() as Article;
    hints.lemma = noun[2].trim();
    const notation = (noun[3] ?? noun[4] ?? '').trim();
    if (notation) {
      if (PLURAL_ONLY_RE.test(notation)) {
        hints.pluralOnly = true;
        hints.plural = hints.lemma;
      } else if (NO_PLURAL_RE.test(notation)) {
        hints.plural = null;
      } else {
        const plural = expandPlural(hints.lemma, notation);
        if (plural === undefined) {
          return {
            index,
            raw,
            german,
            hints,
            unclear: true,
            reason: `Could not read the plural "${notation}"`,
          };
        }
        hints.plural = plural;
      }
    }
    return { index, raw, german, hints, unclear: false };
  }

  for (const part of german.split(',').map((p) => p.trim())) {
    const perfect = /^(hat|ist)\s+([a-zäöüß]+)$/i.exec(part);
    if (perfect) {
      hints.perfect = {
        auxiliary: perfect[1].toLowerCase() === 'ist' ? 'sein' : 'haben',
        participle: perfect[2],
      };
    }
  }

  if (german.split(' ').length > 12) {
    return { index, raw, german, hints, unclear: true, reason: 'Too long for one entry' };
  }
  return { index, raw, german, hints, unclear: false };
}

function splitTranslation(text: string): { german: string; translation?: string } {
  for (const separator of TRANSLATION_SEPARATORS) {
    const at = text.indexOf(separator);
    if (at > 0) {
      const german = text.slice(0, at).trim();
      const translation = text.slice(at + separator.length).trim();
      if (german && translation) return { german, translation };
    }
  }
  return { german: text };
}

/**
 * Expand textbook plural notation: "-en" adds a suffix, "¨-e" also
 * umlauts the stem, "-" means unchanged. A full plural word is taken as is.
 * Returns undefined for notation it cannot read.
 */
export function expandPlural(lemma: string, notation: string): string | undefined {
  const n = notation.trim().replace(/^die\s+/i, '');
  if (/^[A-ZÄÖÜ][a-zäöüß-]+$/.test(n)) return n;
  if (/^[-–]$/.test(n)) return lemma;
  const notationMatch = /^(?:[¨"]?[-–][¨"]?|[¨"])([a-zäöüß]*)$/.exec(n.replace(/\s/g, ''));
  if (!notationMatch) return undefined;
  const suffix = notationMatch[1];
  const umlaut = /[¨"]/.test(n);
  const stem = umlaut ? umlautStem(lemma) : lemma;
  return stem === undefined ? undefined : stem + suffix;
}

const UMLAUT: Record<string, string> = { a: 'ä', o: 'ö', u: 'ü', A: 'Ä', O: 'Ö', U: 'Ü' };

/** Umlaut the last a, o, u or au of the stem: Haus -> Häus, Mutter -> Mütter. */
export function umlautStem(lemma: string): string | undefined {
  for (let i = lemma.length - 1; i >= 0; i--) {
    const c = lemma[i];
    if (!(c in UMLAUT)) continue;
    if ((c === 'u' || c === 'U') && i > 0 && /[aA]/.test(lemma[i - 1])) {
      return lemma.slice(0, i - 1) + UMLAUT[lemma[i - 1]] + lemma.slice(i);
    }
    return lemma.slice(0, i) + UMLAUT[c] + lemma.slice(i + 1);
  }
  return undefined;
}

/** Split lines into batches for the LLM, about 25 lines each. */
export function batches<T>(items: readonly T[], size = 25): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
}
