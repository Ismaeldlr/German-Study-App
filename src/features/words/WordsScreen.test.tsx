import { fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { eq } from 'drizzle-orm';
import { Alert } from 'react-native';

import { createChapter } from '@/data/repos/chapters';
import { createItem, getItem } from '@/data/repos/items';
import { recordReview } from '@/data/repos/study';
import { card } from '@/data/schema';
import { itemInput, verbInput } from '@/data/testing/fixtures';

import { createTestServices, renderWithServices } from '../testing/render-with-services';
import { ItemDetailScreen } from './ItemDetailScreen';
import { WordsScreen } from './WordsScreen';

describe('Words screen', () => {
  it('lists, searches and filters the deck', async () => {
    const services = await createTestServices();
    const ch = createChapter(services.db, { number: 1, title: 'Wohnen', themes: [] });
    createItem(services.db, itemInput({ chapterId: ch }), 1);
    createItem(
      services.db,
      itemInput({ lemma: 'Küche', plural: 'Küchen', meanings: ['kitchen'] }),
      2,
    );
    const verb = createItem(services.db, verbInput({ chapterId: ch }), 3);
    await renderWithServices(<WordsScreen />, services);

    expect(screen.getByTestId('words-count')).toHaveTextContent('3 words');
    await fireEvent.changeText(screen.getByLabelText('Search'), 'kueche');
    expect(screen.getByTestId('words-count')).toHaveTextContent('1 word');
    expect(screen.getByText('die Küche')).toBeOnTheScreen();

    await fireEvent.changeText(screen.getByLabelText('Search'), '');
    await fireEvent.press(screen.getByRole('button', { name: '1. Wohnen' }));
    expect(screen.getByTestId('words-count')).toHaveTextContent('2 words');
    await fireEvent.press(screen.getByRole('button', { name: 'Verbs' }));
    expect(screen.getByTestId('words-count')).toHaveTextContent('1 word');

    await fireEvent.press(screen.getByText('umziehen'));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/item/[id]',
      params: { id: String(verb) },
    });
  });

  it('filters by learning state', async () => {
    const services = await createTestServices();
    const id = createItem(services.db, itemInput(), 1);
    createItem(services.db, itemInput({ lemma: 'Küche', plural: 'Küchen' }), 2);
    const recognize = services.db
      .select()
      .from(card)
      .where(eq(card.itemId, id))
      .orderBy(card.id)
      .get()!;
    recordReview(
      services.db,
      {
        cardId: recognize.id,
        rating: 1,
        mode: 'classic',
        responseMs: 1,
        answer: null,
        correct: false,
      },
      5,
    );
    await renderWithServices(<WordsScreen />, services);
    await fireEvent.press(screen.getByRole('button', { name: 'Learning' }));
    expect(screen.getByTestId('words-count')).toHaveTextContent('1 word');
    expect(screen.getByText('die Wohnung')).toBeOnTheScreen();
  });

  it('shows an empty state', async () => {
    await renderWithServices(<WordsScreen />);
    expect(screen.getByText('Your deck is empty. Add a word or paste a list.')).toBeOnTheScreen();
  });
});

describe('Item detail screen', () => {
  it('shows forms, cards, history and mistakes, and suspends a card', async () => {
    const services = await createTestServices();
    const ch = createChapter(services.db, { number: 2, title: 'Arbeit', themes: [] });
    const id = createItem(services.db, itemInput({ chapterId: ch }), services.now().getTime());
    const gender = services.db
      .select()
      .from(card)
      .where(eq(card.itemId, id))
      .all()
      .find((c) => c.type === 'gender')!;
    recordReview(
      services.db,
      {
        cardId: gender.id,
        rating: 1,
        mode: 'classic',
        responseMs: 900,
        answer: 'der',
        correct: false,
        mistakes: [
          {
            category: 'article',
            yourText: 'der Wohnung',
            correction: 'die Wohnung',
            explanation: 'Wohnung takes die.',
          },
        ],
      },
      services.now().getTime(),
    );
    await renderWithServices(<ItemDetailScreen itemId={id} />, services);

    expect(screen.getByTestId('item-title')).toHaveTextContent('die Wohnung');
    expect(screen.getByText('die Wohnung · Pl. die Wohnungen')).toBeOnTheScreen();
    expect(screen.getByText(/2\. Arbeit/)).toBeOnTheScreen();
    expect(screen.getByText('Gender: Again')).toBeOnTheScreen();
    expect(screen.getByText('der Wohnung → die Wohnung')).toBeOnTheScreen();

    await fireEvent(screen.getByLabelText('Plural'), 'valueChange', false);
    expect(
      services.db
        .select()
        .from(card)
        .all()
        .find((c) => c.type === 'plural')?.suspended,
    ).toBe(true);

    await fireEvent.press(screen.getByRole('button', { name: 'Edit' }));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/edit/[id]',
      params: { id: String(id) },
    });
  });

  it('suspends and deletes the item', async () => {
    const services = await createTestServices();
    const id = createItem(services.db, itemInput(), 1);
    await renderWithServices(<ItemDetailScreen itemId={id} />, services);
    await fireEvent.press(screen.getByRole('button', { name: 'Suspend' }));
    expect(getItem(services.db, id)?.status).toBe('suspended');
    expect(screen.getByRole('button', { name: 'Unsuspend' })).toBeOnTheScreen();

    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.style === 'destructive')?.onPress?.();
    });
    await fireEvent.press(screen.getByRole('button', { name: 'Delete' }));
    expect(getItem(services.db, id)).toBeUndefined();
    expect(router.back).toHaveBeenCalled();
    alert.mockRestore();
  });
});
