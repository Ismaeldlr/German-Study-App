import { fireEvent, screen } from '@testing-library/react-native';
import { eq } from 'drizzle-orm';
import { router } from 'expo-router';
import { Alert } from 'react-native';

import { createChapter, listChapters } from '@/data/repos/chapters';
import { createItem } from '@/data/repos/items';
import { getSetting, setSetting } from '@/data/repos/settings';
import { card, item } from '@/data/schema';
import { itemInput } from '@/data/testing/fixtures';
import { UmlautProvider } from '@/ui/umlaut';

import type { Services } from '../services';
import { createTestServices, renderWithServices } from '../testing/render-with-services';
import { ChapterScreen } from './ChapterScreen';
import { ChaptersScreen } from './ChaptersScreen';

const withBar = (ui: React.ReactElement) => <UmlautProvider>{ui}</UmlautProvider>;

/** A chapter with one mature word and one new one. */
async function chapterWithWords(): Promise<Services & { chapter: number }> {
  const services = await createTestServices();
  const t = services.now().getTime();
  const chapter = createChapter(services.db, {
    number: 2,
    title: 'Essen',
    themes: ['Restaurant'],
  });
  const brot = createItem(
    services.db,
    itemInput({ lemma: 'Brot', article: 'das', meanings: ['bread'], chapterId: chapter }),
    t,
  );
  createItem(services.db, itemInput({ lemma: 'Suppe', meanings: ['soup'], chapterId: chapter }), t);
  services.db
    .update(card)
    .set({ state: 2, stability: 40, difficulty: 5, due: t + 30 * 86_400_000, reps: 5 })
    .where(eq(card.itemId, brot))
    .run();
  return { ...services, chapter };
}

describe('Chapters screen', () => {
  it('saves a pasted contents page in one go', async () => {
    const services = await createTestServices();
    await renderWithServices(withBar(<ChaptersScreen />), services);

    await fireEvent.press(screen.getByRole('button', { name: 'Paste the whole list instead' }));
    await fireEvent.changeText(
      screen.getByLabelText('Chapters'),
      'Inhalt\n1 Zu Hause: Wohnen, Umzug\n2 Essen und Trinken (Restaurant)',
    );
    expect(screen.getByTestId('chapter-paste-preview')).toHaveTextContent(
      '1. Zu Hause · 2. Essen und Trinken',
    );
    expect(screen.getByTestId('chapter-paste-skipped')).toHaveTextContent(/This line has.*Inhalt/);
    await fireEvent.press(screen.getByRole('button', { name: 'Save 2 chapters' }));

    expect(listChapters(services.db).map((c) => [c.number, c.title, c.themes])).toEqual([
      [1, 'Zu Hause', ['Wohnen', 'Umzug']],
      [2, 'Essen und Trinken', ['Restaurant']],
    ]);
    expect(screen.getByText('1. Zu Hause')).toBeOnTheScreen();
  });

  it('shows how much of each chapter is learned', async () => {
    const services = await chapterWithWords();
    await renderWithServices(withBar(<ChaptersScreen />), services);
    expect(screen.getByTestId(`chapter-row-${services.chapter}`)).toHaveTextContent(
      /Restaurant · 50% mature · 1 of 2 items/,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Cram for an exam' }));
    expect(router.push).toHaveBeenCalledWith('/cram');
  });
});

describe('Chapter screen', () => {
  it('shows coverage and the chapter’s words, filtered by state', async () => {
    const services = await chapterWithWords();
    await renderWithServices(withBar(<ChapterScreen chapterId={services.chapter} />), services);

    expect(screen.getByTestId('chapter-coverage-text')).toHaveTextContent(
      '50% mature · 1 of 2 items',
    );
    expect(screen.getByText('bread')).toBeOnTheScreen();
    expect(screen.getByText('soup')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Mature 1' }));
    expect(screen.queryByText('soup')).not.toBeOnTheScreen();
    expect(screen.getByText('bread')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Set as current' }));
    expect(getSetting(services.db, 'study.currentChapterId')).toBe(services.chapter);
    expect(screen.getByTestId('chapter-is-current')).toBeOnTheScreen();
  });

  it('renames a chapter', async () => {
    const services = await chapterWithWords();
    setSetting(services.db, 'study.currentChapterId', services.chapter);
    await renderWithServices(withBar(<ChapterScreen chapterId={services.chapter} />), services);
    await fireEvent.press(screen.getByRole('button', { name: 'Edit' }));
    await fireEvent.changeText(screen.getByLabelText('Title'), 'Essen und Trinken');
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(listChapters(services.db)[0].title).toBe('Essen und Trinken');
    expect(screen.getByTestId('chapter-summary')).toHaveTextContent(/2\. Essen und Trinken/);
  });

  it('deletes a chapter after asking, and its words stay', async () => {
    const services = await chapterWithWords();
    setSetting(services.db, 'study.currentChapterId', services.chapter);
    await renderWithServices(withBar(<ChapterScreen chapterId={services.chapter} />), services);
    await fireEvent.press(screen.getByRole('button', { name: 'Edit' }));
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.style === 'destructive')?.onPress?.();
    });
    await fireEvent.press(screen.getByRole('button', { name: 'Delete chapter' }));
    expect(listChapters(services.db)).toEqual([]);
    expect(getSetting(services.db, 'study.currentChapterId')).toBeNull();
    expect(services.db.select().from(item).all()).toHaveLength(2);
    expect(router.back).toHaveBeenCalled();
    alert.mockRestore();
  });
});
