import { fireEvent, screen } from '@testing-library/react-native';
import { eq } from 'drizzle-orm';
import { router } from 'expo-router';

import { DAY_MS } from '@/core/time';
import { createChapter } from '@/data/repos/chapters';
import { createItem } from '@/data/repos/items';
import { recordReview } from '@/data/repos/study';
import { recordUsage } from '@/data/repos/usage';
import { card } from '@/data/schema';
import { itemInput } from '@/data/testing/fixtures';

import { createTestServices, renderWithServices } from '../testing/render-with-services';
import { ProgressScreen } from '../progress/ProgressScreen';
import { StatsScreen } from './StatsScreen';

describe('Stats screen', () => {
  it('reads well before there is anything to show', async () => {
    await renderWithServices(<StatsScreen />);
    expect(screen.getByTestId('stats-recall-week')).toHaveTextContent('—');
    expect(screen.getByText(/Enter your textbook’s chapters/)).toBeOnTheScreen();
    expect(screen.getByText(/No mistakes to sort yet/)).toBeOnTheScreen();
    expect(screen.getByTestId('stats-minutes-total')).toHaveTextContent(
      '0 min in the last 7 days · 0 min today',
    );
  });

  it('shows recall by mode, the forecast, chapters, weak spots, time and spend', async () => {
    const services = await createTestServices();
    const { db } = services;
    const t = services.now().getTime();
    const chapter = createChapter(db, { number: 3, title: 'Zu Hause', themes: [] });
    const id = createItem(db, itemInput({ chapterId: chapter }), t - 30 * DAY_MS);
    const cards = db.select().from(card).where(eq(card.itemId, id)).orderBy(card.id).all();
    db.update(card)
      .set({
        state: 2,
        stability: 30,
        difficulty: 5,
        due: t + 2 * DAY_MS,
        lastReview: t - 20 * DAY_MS,
        reps: 4,
      })
      .where(eq(card.itemId, id))
      .run();
    const answer = (i: number, rating: 1 | 3, mode: 'classic' | 'gap_fill', at: number) =>
      recordReview(
        db,
        {
          cardId: cards[i].id,
          rating,
          mode,
          responseMs: 4000,
          answer: 'der',
          correct: rating > 1,
          mistakes:
            rating === 1
              ? [{ category: 'article', yourText: 'der', correction: 'die', explanation: 'die' }]
              : [],
        },
        at,
      );
    answer(0, 3, 'classic', t - 2 * DAY_MS);
    answer(1, 3, 'classic', t - 2 * DAY_MS + 60_000);
    answer(2, 1, 'gap_fill', t - 2 * DAY_MS + 120_000);
    recordUsage(
      db,
      { provider: 'openai', model: 'm', inputTokens: 1e6, outputTokens: 0, at: services.now() },
      { input: 0.25, output: 0 },
    );
    await renderWithServices(<StatsScreen />, services);

    expect(screen.getByTestId('stats-recall-week')).toHaveTextContent('67%');
    expect(screen.getByTestId('stats-recall-classic')).toHaveTextContent(/Classic cards.*100%/);
    expect(screen.getByTestId('stats-recall-gap_fill')).toHaveTextContent(/Gap fills.*0%/);
    // The missed gender card is back in relearning; the plural card is due in two days.
    expect(screen.getByLabelText('Today: 1 review')).toBeOnTheScreen();
    expect(screen.getByLabelText('2026-10-21: 1 review')).toBeOnTheScreen();
    expect(screen.getByTestId(`stats-chapter-${chapter}`)).toHaveTextContent(
      /3\. Zu Hause.*0% mature · 0 of 1 item/,
    );
    expect(screen.getByTestId('stats-minutes-total')).toHaveTextContent(
      '2 min in the last 7 days · 0 min today',
    );
    expect(screen.getByTestId('stats-spend')).toHaveTextContent(/\$0\.25 of \$2\.00 this month/);

    await fireEvent.press(screen.getByTestId('drill-article'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/study', params: { focus: 'article' } });
  });

  it('opens from the Progress tab', async () => {
    await renderWithServices(<ProgressScreen />);
    await fireEvent.press(screen.getByTestId('progress-stats'));
    expect(router.push).toHaveBeenCalledWith('/stats');
  });
});
