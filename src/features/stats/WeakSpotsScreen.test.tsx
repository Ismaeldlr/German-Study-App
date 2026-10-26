import { fireEvent, screen } from '@testing-library/react-native';
import { and, eq } from 'drizzle-orm';
import { router } from 'expo-router';

import { CardState } from '@/core/cards';
import type { MistakeCategory } from '@/core/model';
import { Rating } from '@/core/rating';
import { createGrammarItem } from '@/data/repos/grammar';
import { createItem } from '@/data/repos/items';
import { recordReview } from '@/data/repos/study';
import { card } from '@/data/schema';
import { itemInput } from '@/data/testing/fixtures';

import type { Services } from '../services';
import { createTestServices, renderWithServices } from '../testing/render-with-services';
import { WeakSpotsScreen } from './WeakSpotsScreen';

const T = new Date(2026, 9, 19, 9).getTime();

function mistakeOn(
  s: Services,
  itemId: number,
  type: 'gender' | 'plural' | 'produce' | 'recognize',
  category: MistakeCategory,
  yourText: string,
  correction: string,
) {
  const target = s.db
    .select()
    .from(card)
    .where(and(eq(card.itemId, itemId), eq(card.type, type)))
    .get()!;
  recordReview(
    s.db,
    {
      cardId: target.id,
      rating: Rating.Again,
      mode: 'classic',
      responseMs: 2000,
      answer: yourText,
      correct: false,
      mistakes: [
        { category, yourText, correction, explanation: `${correction}, not ${yourText}.` },
      ],
    },
    T - 1000,
  );
}

describe('Weak spots screen', () => {
  it('says so before there are any mistakes', async () => {
    await renderWithServices(<WeakSpotsScreen />);
    expect(screen.getByText('No mistakes yet')).toBeOnTheScreen();
  });

  it('ranks categories, shows your mistakes, and the grammar point that practises each', async () => {
    const s = await createTestServices({ now: () => new Date(T) });
    const wohnung = createItem(s.db, itemInput(), T - 1000);
    mistakeOn(s, wohnung, 'gender', 'article', 'der Wohnung', 'die Wohnung');
    mistakeOn(s, wohnung, 'plural', 'article', 'der Wohnungen', 'die Wohnungen');
    mistakeOn(s, wohnung, 'produce', 'case_ending', 'den Wohnung', 'der Wohnung');
    // A wrong meaning pick is not a weak spot.
    mistakeOn(s, wohnung, 'recognize', 'wrong_word', 'kitchen', 'flat');
    const rule = createGrammarItem(
      s.db,
      {
        name: 'Artikel und Genus',
        label: 'articles',
        summary: 'Learn every noun with its article.',
        examples: [{ de: 'die Wohnung', en: 'the flat' }],
        categories: ['article'],
      },
      null,
      T - 1000,
    );
    s.db
      .update(card)
      .set({ state: CardState.Review, stability: 5, due: T + 86_400_000 * 5 })
      .where(eq(card.itemId, rule))
      .run();
    await renderWithServices(<WeakSpotsScreen />, s);

    expect(screen.getByTestId('weak-spots-screen')).toBeOnTheScreen();
    expect(screen.getByTestId('weak-spot-score-article')).toHaveTextContent(
      /Score 2\.0 · 2 mistakes/,
    );
    expect(screen.getByText('der Wohnung → die Wohnung')).toBeOnTheScreen();
    expect(screen.queryByTestId('weak-spot-wrong_word')).not.toBeOnTheScreen();
    // The top spot's grammar point is pulled into the next session.
    expect(screen.getByTestId(`weak-spot-grammar-${rule}`)).toHaveTextContent(
      /Drilled in your next session/,
    );

    // Any weak spot can be drilled right away, on the cards you missed.
    expect(screen.getByTestId('drill-article')).toHaveTextContent(/Drill now · 2 cards/);
    await fireEvent.press(screen.getByTestId('drill-case_ending'));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/study',
      params: { focus: 'case_ending' },
    });

    // No grammar point covers case endings yet: offer to add one.
    await fireEvent.press(screen.getByTestId('weak-spot-add-case_ending'));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/add-grammar',
      params: { name: 'Akkusativ und Dativ' },
    });
  });
});
