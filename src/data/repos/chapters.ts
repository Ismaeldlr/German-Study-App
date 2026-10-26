import { asc, eq } from 'drizzle-orm';

import type { ChapterLine } from '@/core/chapters';

import { notifyChange } from '../changes';
import type { DbOrTx } from '../db';
import { chapter, type ChapterRow } from '../schema';

export interface ChapterInput {
  book?: string;
  number: number;
  title: string;
  themes: string[];
}

export function listChapters(db: DbOrTx): ChapterRow[] {
  return db.select().from(chapter).orderBy(asc(chapter.book), asc(chapter.number)).all();
}

export function getChapter(db: DbOrTx, id: number): ChapterRow | undefined {
  return db.select().from(chapter).where(eq(chapter.id, id)).get();
}

export function createChapter(db: DbOrTx, input: ChapterInput): number {
  const [row] = db
    .insert(chapter)
    .values({
      book: input.book?.trim() || 'Momente A2',
      number: input.number,
      title: input.title.trim(),
      themes: cleanThemes(input.themes),
    })
    .returning({ id: chapter.id })
    .all();
  notifyChange('chapter');
  return row.id;
}

export function updateChapter(db: DbOrTx, id: number, input: ChapterInput): void {
  db.update(chapter)
    .set({
      book: input.book?.trim() || 'Momente A2',
      number: input.number,
      title: input.title.trim(),
      themes: cleanThemes(input.themes),
    })
    .where(eq(chapter.id, id))
    .run();
  notifyChange('chapter');
}

/** Items in the chapter keep existing; they just lose the tag. */
export function deleteChapter(db: DbOrTx, id: number): void {
  db.delete(chapter).where(eq(chapter.id, id)).run();
  notifyChange('chapter', 'item');
}

/**
 * Save a pasted chapter list in one go: new numbers become chapters, and
 * numbers the book already has get the new title. Their themes are only
 * replaced when the line names some.
 */
export function saveChapterList(
  db: DbOrTx,
  lines: readonly ChapterLine[],
  book = 'Momente A2',
): { created: number; updated: number } {
  const name = book.trim() || 'Momente A2';
  const existing = new Map(
    listChapters(db)
      .filter((c) => c.book === name)
      .map((c) => [c.number, c]),
  );
  const counts = db.transaction((tx) => {
    let created = 0;
    let updated = 0;
    for (const line of lines) {
      const old = existing.get(line.number);
      if (old) {
        tx.update(chapter)
          .set({
            title: line.title.trim(),
            themes: line.themes.length ? cleanThemes(line.themes) : old.themes,
          })
          .where(eq(chapter.id, old.id))
          .run();
        updated++;
      } else {
        tx.insert(chapter)
          .values({
            book: name,
            number: line.number,
            title: line.title.trim(),
            themes: cleanThemes(line.themes),
          })
          .run();
        created++;
      }
    }
    return { created, updated };
  });
  notifyChange('chapter');
  return counts;
}

export function chapterLabel(row: Pick<ChapterRow, 'number' | 'title'>): string {
  return `${row.number}. ${row.title}`;
}

/** "Wohnen, Umzug ,  Nachbarn" -> ["Wohnen", "Umzug", "Nachbarn"]. */
export function parseThemes(text: string): string[] {
  return cleanThemes(text.split(/[,;\n]/));
}

function cleanThemes(themes: string[]): string[] {
  return [...new Set(themes.map((t) => t.trim()).filter(Boolean))];
}
