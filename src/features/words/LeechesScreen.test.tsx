import { fireEvent, screen } from '@testing-library/react-native';
import { and, eq } from 'drizzle-orm';
import { router } from 'expo-router';

import { createItem } from '@/data/repos/items';
import { setMemoryHook } from '@/data/repos/leeches';
import { card, mistake, review } from '@/data/schema';
import { itemInput } from '@/data/testing/fixtures';

import { createTestServices, renderWithServices } from '../testing/render-with-services';
import { LeechesScreen } from './LeechesScreen';

const T = new Date(2026, 9, 19, 9).getTime();

describe('Leeches screen', () => {
  it('lists leeches with their memory hook, to rewrite, suspend or keep', async () => {
    const s = await createTestServices();
    const wohnung = createItem(s.db, itemInput(), T);
    const produce = s.db
      .select()
      .from(card)
      .where(and(eq(card.itemId, wohnung), eq(card.type, 'produce')))
      .get()!;
    s.db.update(card).set({ lapses: 6, leechAt: T }).where(eq(card.id, produce.id)).run();
    setMemoryHook(s.db, wohnung, 'A flat with one huge window: die Wohnung.', T);
    await renderWithServices(<LeechesScreen />, s);

    expect(screen.getByTestId(`leech-${produce.id}`)).toHaveTextContent(/die Wohnung/);
    expect(screen.getByTestId(`leech-hook-${produce.id}`)).toHaveTextContent(
      'Memory hook: A flat with one huge window: die Wohnung.',
    );
    await fireEvent.press(screen.getByTestId(`leech-edit-${produce.id}`));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/edit/[id]',
      params: { id: String(wohnung) },
    });

    await fireEvent.press(screen.getByRole('button', { name: 'Keep studying' }));
    expect(await screen.findByTestId('leeches-none')).toBeOnTheScreen();
    expect(s.db.select().from(card).where(eq(card.id, produce.id)).get()!.leechAt).toBeNull();
  });

  it('shows the word pairs you mix up', async () => {
    const s = await createTestServices();
    const a = createItem(s.db, itemInput({ lemma: 'Küche', plural: 'Küchen' }), T);
    const b = createItem(s.db, itemInput({ lemma: 'Kuchen', article: 'der', plural: 'Kuchen' }), T);
    const cardId = s.db.select().from(card).where(eq(card.itemId, a)).get()!.id;
    const [r] = s.db
      .insert(review)
      .values({ cardId, reviewedAt: T, rating: 1, mode: 'classic', correct: false, stateBefore: 2 })
      .returning()
      .all();
    for (const [itemId, confusedItemId] of [
      [a, b],
      [b, a],
    ]) {
      s.db
        .insert(mistake)
        .values({
          reviewId: r.id,
          itemId,
          confusedItemId,
          category: 'wrong_word',
          yourText: 'x',
          correction: 'y',
          createdAt: T,
        })
        .run();
    }
    await renderWithServices(<LeechesScreen />, s);
    expect(screen.getByTestId(`pair-${a}-${b}`)).toHaveTextContent(
      /die Küche ↔ der Kuchen.*2 mix-ups/,
    );
  });
});
