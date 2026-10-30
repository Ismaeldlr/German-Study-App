import { fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Alert } from 'react-native';

import { createChapter } from '@/data/repos/chapters';
import { getCramPlan, startCram } from '@/data/repos/cram';
import { createItem } from '@/data/repos/items';
import { setSetting } from '@/data/repos/settings';
import { itemInput } from '@/data/testing/fixtures';

import { HomeScreen } from '../home/HomeScreen';
import type { Services } from '../services';
import { createTestServices, renderWithServices } from '../testing/render-with-services';
import { CramScreen } from './CramScreen';

/** Two chapters; the exam one has two words. Today is Monday 19 October 2026. */
async function deck(): Promise<Services & { exam: number }> {
  const services = await createTestServices();
  const t = services.now().getTime();
  const exam = createChapter(services.db, { number: 4, title: 'Arbeit', themes: [] });
  createChapter(services.db, { number: 5, title: 'Reisen', themes: [] });
  createItem(services.db, itemInput({ chapterId: exam }), t - 86_400_000);
  createItem(services.db, itemInput({ lemma: 'Küche', chapterId: exam }), t - 86_400_000);
  setSetting(services.db, 'study.currentChapterId', exam);
  return { ...services, exam };
}

describe('Cram screen', () => {
  it('asks for chapters first', async () => {
    await renderWithServices(<CramScreen />);
    expect(screen.getByText('Cram mode needs chapters')).toBeOnTheScreen();
  });

  it('plans an exam: the current chapter, a day, and how much a day it takes', async () => {
    const services = await deck();
    await renderWithServices(<CramScreen />, services);

    // The current chapter is picked, and the exam is a week out.
    expect(screen.getByTestId(`cram-chapter-${services.exam}`)).toBeSelected();
    expect(screen.getByTestId('cram-exam-day')).toHaveTextContent('Montag, 26. Oktober');
    await fireEvent.press(screen.getByTestId('cram-in-3'));
    expect(screen.getByTestId('cram-exam-day')).toHaveTextContent('Donnerstag, 22. Oktober');
    await fireEvent.press(screen.getByTestId('cram-later'));
    expect(screen.getByText('in 4 Tagen')).toBeOnTheScreen();
    // 2 words × 4 cards, each on 2 days, over 4 days.
    expect(screen.getByTestId('cram-preview')).toHaveTextContent(
      /8 cards to have ready · about 4 a day/,
    );

    await fireEvent.press(screen.getByTestId('cram-start'));
    expect(getCramPlan(services.db)).toMatchObject({
      chapterIds: [services.exam],
      examDay: '2026-10-23',
    });
    expect(screen.getByTestId('cram-hero')).toHaveTextContent(/in 4 Tagen.*4\. Arbeit/);
    expect(screen.getByTestId('cram-ready')).toHaveTextContent('0 of 8 cards reviewed on 2 days');
    // Only the recognition cards can be asked on the first day.
    expect(screen.getByTestId('cram-left')).toHaveTextContent('2 cram cards left today');
    await fireEvent.press(screen.getByTestId('cram-study'));
    expect(router.push).toHaveBeenCalledWith('/study');
  });

  it('cannot start without a chapter or plan an exam in the past', async () => {
    const services = await deck();
    await renderWithServices(<CramScreen />, services);
    await fireEvent.press(screen.getByTestId(`cram-chapter-${services.exam}`));
    expect(screen.getByText('Pick at least one chapter.')).toBeOnTheScreen();
    expect(screen.getByTestId('cram-start')).toBeDisabled();

    await fireEvent.press(screen.getByTestId('cram-in-3'));
    for (let i = 0; i < 5; i++) await fireEvent.press(screen.getByTestId('cram-earlier'));
    expect(screen.getByText('morgen')).toBeOnTheScreen();
  });

  it('ends cram mode after asking', async () => {
    const services = await deck();
    startCram(services.db, { chapterIds: [services.exam], examDay: '2026-10-22' }, 0);
    await renderWithServices(<CramScreen />, services);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.style === 'destructive')?.onPress?.();
    });
    await fireEvent.press(screen.getByTestId('cram-end'));
    expect(getCramPlan(services.db)).toBeNull();
    expect(screen.getByTestId('cram-form')).toBeOnTheScreen();
    alert.mockRestore();
  });

  it('wraps up once the exam is over', async () => {
    const services = await deck();
    startCram(services.db, { chapterIds: [services.exam], examDay: '2026-10-18' }, 0);
    await renderWithServices(<CramScreen />, services);
    expect(screen.getByText(/Your exam on Sonntag, 18. Oktober is over/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('cram-done'));
    expect(getCramPlan(services.db)).toBeNull();
  });
});

describe('Home: cram mode', () => {
  it('names the exam and today’s cram work', async () => {
    const services = await deck();
    startCram(services.db, { chapterIds: [services.exam], examDay: '2026-10-20' }, 0);
    await renderWithServices(<HomeScreen />, services);
    expect(screen.getByTestId('cram-banner')).toHaveTextContent(
      /Prüfung morgen: 2 cram cards today\./,
    );
    await fireEvent.press(screen.getByTestId('home-cram'));
    expect(router.push).toHaveBeenCalledWith('/cram');
  });
});
