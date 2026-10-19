/**
 * Comparing typed German against what was expected. Extra spaces never
 * matter. ae/oe/ue/ss for an umlaut, a missing umlaut, or a lowercase noun
 * is a small slip (rated Hard), not a wrong answer.
 */

export type Verdict = 'correct' | 'slip' | 'wrong';
export type SlipKind = 'umlaut' | 'capitalization';

export interface AnswerCheck {
  verdict: Verdict;
  slips: SlipKind[];
  /** The accepted form the answer was matched against, or the first one. */
  expected: string;
}

export function normalizeAnswer(text: string): string {
  return text
    .normalize('NFC')
    .replace(/[’‘`´]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^["']+/, '')
    .replace(/["'.!?]+$/, '')
    .trim();
}

const FOLD: Record<string, string> = {
  ä: 'ae',
  ö: 'oe',
  ü: 'ue',
  Ä: 'Ae',
  Ö: 'Oe',
  Ü: 'Ue',
  ß: 'ss',
};
const STRIP: Record<string, string> = {
  ä: 'a',
  ö: 'o',
  ü: 'u',
  Ä: 'A',
  Ö: 'O',
  Ü: 'U',
  ß: 'ss',
};

/** ä -> ae, ß -> ss. */
export function foldUmlauts(text: string): string {
  return text.replace(/[äöüÄÖÜß]/g, (c) => FOLD[c]);
}

/** ä -> a, ß -> ss. */
export function stripUmlauts(text: string): string {
  return text.replace(/[äöüÄÖÜß]/g, (c) => STRIP[c]);
}

/**
 * Check a German answer against the accepted forms. A capital first letter
 * on a word that starts lowercase is fine; a lowercase noun is a slip.
 */
export function checkGerman(given: string, accepted: readonly string[]): AnswerCheck {
  const answer = normalizeAnswer(given);
  const forms = accepted.map(normalizeAnswer).filter(Boolean);
  const first = forms[0] ?? '';
  if (!answer || forms.length === 0) return { verdict: 'wrong', slips: [], expected: first };

  for (const form of forms) {
    if (answer === form || answer === capitalizeFirst(form)) {
      return { verdict: 'correct', slips: [], expected: form };
    }
  }

  for (const form of forms) {
    const caseOnly = answer.toLowerCase() === form.toLowerCase();
    if (caseOnly) return { verdict: 'slip', slips: ['capitalization'], expected: form };

    const umlautSlip =
      foldUmlauts(answer).toLowerCase() === foldUmlauts(form).toLowerCase() ||
      stripUmlauts(answer).toLowerCase() === stripUmlauts(form).toLowerCase();
    if (umlautSlip) {
      const slips: SlipKind[] = ['umlaut'];
      const sameCase =
        foldUmlauts(answer) === foldUmlauts(form) ||
        stripUmlauts(answer) === stripUmlauts(form) ||
        foldUmlauts(answer) === foldUmlauts(capitalizeFirst(form)) ||
        stripUmlauts(answer) === stripUmlauts(capitalizeFirst(form));
      if (!sameCase) slips.push('capitalization');
      return { verdict: 'slip', slips, expected: form };
    }
  }

  return { verdict: 'wrong', slips: [], expected: closest(answer, forms) };
}

function capitalizeFirst(text: string): string {
  return text ? text[0].toUpperCase() + text.slice(1) : text;
}

function closest(answer: string, forms: string[]): string {
  let best = forms[0];
  let bestDistance = Infinity;
  for (const form of forms) {
    const d = editDistance(answer.toLowerCase(), form.toLowerCase());
    if (d < bestDistance) {
      best = form;
      bestDistance = d;
    }
  }
  return best;
}

/** Damerau-Levenshtein distance (optimal string alignment). */
export function editDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d: number[][] = Array.from({ length: rows }, (_, i) =>
    Array.from({ length: cols }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[rows - 1][cols - 1];
}
