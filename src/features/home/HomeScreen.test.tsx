import { act, fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { eq } from 'drizzle-orm';

import { createChapter, listChapters } from '@/data/repos/chapters';
import { createItem } from '@/data/repos/items';
import { recordReview } from '@/data/repos/study';
import { card } from '@/data/schema';
import { getSetting, setSetting } from '@/data/repos/settings';
import { recordUsage } from '@/data/repos/usage';
import { itemInput } from '@/data/testing/fixtures';
import { UmlautProvider } from '@/ui/umlaut';

import { ChaptersScreen } from '../chapters/ChaptersScreen';
import { createTestServices, renderWithServices } from '../testing/render-with-services';
import { HomeScreen } from './HomeScreen';

describe('Home screen', () => {
  it('starts an empty deck with add and paste', async () => {
    await renderWithServices(<HomeScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Paste a list' }));
    expect(router.push).toHaveBeenCalledWith('/paste');
  });

  it("shows today's plan and the Study button", async () => {
    const services = await createTestServices();
    for (const lemma of ['Haus', 'Maus', 'Laus']) createItem(services.db, itemInput({ lemma }), 1);
    setSetting(services.db, 'study.newItemsBase', 2);
    const ch = createChapter(services.db, { number: 4, title: 'Feste', themes: [] });
    setSetting(services.db, 'study.currentChapterId', ch);
    await renderWithServices(<HomeScreen />, services);

    expect(screen.getByTestId('home-due')).toHaveTextContent('0 reviews due');
    expect(screen.getByTestId('home-new')).toHaveTextContent('2 new words');
    expect(screen.getByText('Class is on 4. Feste')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Study' }));
    expect(router.push).toHaveBeenCalledWith('/study');
  });

  it('nudges a backup after a week and shows the budget banner', async () => {
    const services = await createTestServices();
    createItem(services.db, itemInput(), 1);
    setSetting(services.db, 'llm.monthlyCap', 0.000001);
    recordUsage(
      services.db,
      { provider: 'openai', model: 'm', inputTokens: 1000, outputTokens: 1000, at: services.now() },
      { input: 1, output: 1 },
    );
    await renderWithServices(<HomeScreen />, services);
    expect(screen.getByTestId('export-nudge')).toBeOnTheScreen();
    expect(screen.getByTestId('budget-banner')).toBeOnTheScreen();

    await act(() => setSetting(services.db, 'data.lastExportAt', services.now().getTime()));
    expect(screen.queryByTestId('export-nudge')).not.toBeOnTheScreen();
  });
});

describe('Home screen: production and weak spots', () => {
  it('shows your top weak spots and the cards that keep slipping', async () => {
    const services = await createTestServices();
    const id = createItem(services.db, itemInput(), 1);
    const [first, second] = services.db.select().from(card).where(eq(card.itemId, id)).all();
    for (const c of [first, second]) {
      recordReview(
        services.db,
        {
          cardId: c.id,
          rating: 1,
          mode: 'gap_fill',
          responseMs: 1000,
          answer: 'den',
          correct: false,
          mistakes: [
            { category: 'case_ending', yourText: 'den', correction: 'dem', explanation: 'dative' },
          ],
        },
        services.now().getTime(),
      );
    }
    services.db.update(card).set({ leechAt: 1 }).where(eq(card.id, first.id)).run();
    await renderWithServices(<HomeScreen />, services);

    expect(screen.getByTestId('home-weak-spots')).toHaveTextContent(/Case endings.*2 mistakes/);
    await fireEvent.press(screen.getByRole('button', { name: 'See all' }));
    expect(router.push).toHaveBeenCalledWith('/weak-spots');
    expect(screen.getByTestId('leeches-banner')).toHaveTextContent(/1 card keeps slipping/);
    await fireEvent.press(screen.getByRole('button', { name: 'Look at them' }));
    expect(router.push).toHaveBeenCalledWith('/leeches');
  });
});

describe('Chapters screen', () => {
  it('adds a chapter and makes it current', async () => {
    const services = await createTestServices();
    await renderWithServices(
      <UmlautProvider>
        <ChaptersScreen />
      </UmlautProvider>,
      services,
    );
    await fireEvent.changeText(screen.getByLabelText('Title'), 'Zu Hause');
    await fireEvent.changeText(screen.getByLabelText('Themes'), 'Wohnen, Umzug');
    await fireEvent.press(screen.getByRole('button', { name: 'Save as current' }));

    const [chapter] = listChapters(services.db);
    expect(chapter).toMatchObject({
      number: 1,
      title: 'Zu Hause',
      themes: ['Wohnen', 'Umzug'],
      book: 'Momente A2',
    });
    expect(getSetting(services.db, 'study.currentChapterId')).toBe(chapter.id);
    expect(screen.getByText('1. Zu Hause  · current')).toBeOnTheScreen();
  });

  it('refuses a duplicate chapter number and opens a chapter', async () => {
    const services = await createTestServices();
    const id = createChapter(services.db, { number: 1, title: 'Eins', themes: [] });
    setSetting(services.db, 'study.currentChapterId', id);
    await renderWithServices(
      <UmlautProvider>
        <ChaptersScreen />
      </UmlautProvider>,
      services,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Add a chapter' }));
    await fireEvent.changeText(screen.getByLabelText('Number'), '1');
    await fireEvent.changeText(screen.getByLabelText('Title'), 'Noch eins');
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('Momente A2 already has a chapter 1.')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    await fireEvent.press(screen.getByText('1. Eins  · current'));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/chapter/[id]',
      params: { id: String(id) },
    });
  });
});
