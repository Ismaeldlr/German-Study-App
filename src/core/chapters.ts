/**
 * Reading a chapter list typed or copied from the textbook's contents page,
 * one chapter per line:
 *
 *   1 Zu Hause: Wohnen, Umzug, Nachbarn
 *   Kapitel 2 – Essen und Trinken (Restaurant, Einkaufen)
 *   3. Arbeit - Beruf, Bewerbung
 *
 * A number, a title, and optionally the themes after a colon, a dash or in
 * brackets. Themes are split on commas and semicolons.
 */

export interface ChapterLine {
  number: number;
  title: string;
  themes: string[];
}

export interface ParsedChapters {
  chapters: ChapterLine[];
  /** Lines with text that did not read as a chapter. */
  skipped: string[];
}

const LINE = /^(?:kapitel|lektion|chapter|lesson|einheit|unit)?\s*(\d{1,3})\s*[.):]?\s+(.+)$/i;
const BRACKETS = /^(.*?)\s*\(([^()]*)\)\s*$/;
const SEPARATOR = /\s*(?::|\s[–—-]\s)\s*/;

function splitThemes(text: string): string[] {
  return [
    ...new Set(
      text
        .split(/[,;]/)
        .map((t) => t.trim())
        .filter(Boolean),
    ),
  ];
}

export function parseChapterList(text: string): ParsedChapters {
  const byNumber = new Map<number, ChapterLine>();
  const skipped: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+/g, ' ').trim();
    if (!line) continue;
    const match = LINE.exec(line);
    if (!match) {
      skipped.push(line);
      continue;
    }
    let rest = match[2].trim();
    let themes: string[] = [];
    const bracketed = BRACKETS.exec(rest);
    if (bracketed) {
      rest = bracketed[1];
      themes = splitThemes(bracketed[2]);
    } else {
      const parts = rest.split(SEPARATOR);
      if (parts.length > 1) {
        rest = parts[0];
        themes = splitThemes(parts.slice(1).join(', '));
      }
    }
    const title = rest.replace(/^[–—-]\s*/, '').trim();
    if (!title) {
      skipped.push(line);
      continue;
    }
    // A chapter listed twice keeps its last line.
    byNumber.set(Number(match[1]), { number: Number(match[1]), title, themes });
  }
  return {
    chapters: [...byNumber.values()].sort((a, b) => a.number - b.number),
    skipped,
  };
}
