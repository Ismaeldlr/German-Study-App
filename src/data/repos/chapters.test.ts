import { createTestDb } from '../testing/test-db';
import { createChapter, listChapters, saveChapterList } from './chapters';

describe('saving a pasted chapter list', () => {
  it('adds new chapters and updates the ones the book has', async () => {
    const db = await createTestDb();
    createChapter(db, { number: 1, title: 'Zuhause', themes: ['Wohnen'] });
    createChapter(db, { book: 'Menschen A1', number: 2, title: 'Andere', themes: [] });

    const counts = saveChapterList(db, [
      { number: 1, title: 'Zu Hause', themes: [] },
      { number: 2, title: 'Essen', themes: ['Restaurant', ' Restaurant '] },
    ]);

    expect(counts).toEqual({ created: 1, updated: 1 });
    expect(listChapters(db).map((c) => [c.book, c.number, c.title, c.themes])).toEqual([
      ['Menschen A1', 2, 'Andere', []],
      // No themes on the line: the ones it had stay.
      ['Momente A2', 1, 'Zu Hause', ['Wohnen']],
      ['Momente A2', 2, 'Essen', ['Restaurant']],
    ]);
  });
});
