import { asc, eq } from 'drizzle-orm';

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
