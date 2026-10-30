import { act, fireEvent, screen, within } from '@testing-library/react-native';
import { router } from 'expo-router';

import { getTopic, lessonTopics, getLesson } from '@/curriculum';
import { currentLesson, startTopic, topicProgress } from '@/data/repos/curriculum';
import { listChapters } from '@/data/repos/chapters';
import { setSetting } from '@/data/repos/settings';
import { review } from '@/data/schema';
import { UmlautProvider } from '@/ui/umlaut';

import { AddGrammarScreen } from '../add/AddGrammarScreen';
import { ChaptersScreen } from '../chapters/ChaptersScreen';
import { HomeScreen } from '../home/HomeScreen';
import { StudyScreen } from '../study/StudyScreen';
import { useStudyStore } from '../study/store';
import { createTestServices, renderWithServices } from '../testing/render-with-services';
import { GrammarScreen } from './GrammarScreen';
import { LessonScreen } from './LessonScreen';
import { TopicScreen } from './TopicScreen';

const T = new Date(2026, 9, 19, 9).getTime();

beforeEach(() => {
  jest.mocked(router.push).mockClear();
  useStudyStore.getState().reset();
});

describe('Grammar tab', () => {
  it('walks the Momente path lesson by lesson', async () => {
    await renderWithServices(<GrammarScreen />);
    expect(screen.getByTestId('grammar-started')).toHaveTextContent(
      'Practise a topic to add it to your reviews.',
    );
    const book = screen.getByTestId('book-A2.1');
    expect(within(book).getByText('Du solltest mehr trainieren.')).toBeOnTheScreen();
    expect(
      within(book).getByText('Konjunktiv II: Ratschläge mit sollte und könnte'),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('lesson-A2.1-6'));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/lesson/[ref]',
      params: { ref: 'A2.1-6' },
    });
  });

  it('filters by level and finds topics by German or English words', async () => {
    await renderWithServices(<GrammarScreen />);
    await fireEvent.press(screen.getByTestId('grammar-level-B1'));
    expect(screen.queryByTestId('book-A1.1')).not.toBeOnTheScreen();
    expect(screen.getByTestId('book-B1.1')).toBeOnTheScreen();

    await fireEvent.changeText(screen.getByLabelText('Search grammar topics'), 'um zu');
    const results = screen.getByTestId('grammar-results');
    expect(within(results).getByText('Ziel: um … zu und damit')).toBeOnTheScreen();

    await fireEvent.press(screen.getByTestId('grammar-level-all'));
    await fireEvent.changeText(screen.getByLabelText('Search grammar topics'), 'der die das');
    expect(screen.getByText('der, die, das: das Genus')).toBeOnTheScreen();
  });

  it('practises a whole subject in one tap', async () => {
    const services = await renderWithServices(<GrammarScreen />);
    await fireEvent.press(screen.getByRole('radio', { name: 'By subject' }));
    const block = screen.getByTestId('block-konjunktiv');
    expect(
      within(block).getByText('Konjunktiv II: hätte, wäre + gern, lieber, am liebsten'),
    ).toBeOnTheScreen();

    await fireEvent.press(within(block).getByRole('button', { name: 'Practise all 6' }));
    const ids = [
      'konjunktiv-wuerde',
      'konjunktiv-ratschlaege',
      'konjunktiv-haette-waere',
      'konjunktiv-wenn',
      'als-ob',
      'konjunktiv-vergangenheit',
    ];
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/study',
      params: { topics: ids.join(',') },
    });
    expect([...topicProgress(services.db).keys()].sort()).toEqual([...ids].sort());
  });
});

describe('a topic page', () => {
  it('explains the rule and adds it to your reviews, or takes it out again', async () => {
    const services = await renderWithServices(<TopicScreen topicId="konjunktiv-haette-waere" />);
    expect(screen.getByTestId('topic-name')).toHaveTextContent(
      'Konjunktiv II: hätte, wäre + gern, lieber, am liebsten',
    );
    expect(screen.getByText(getTopic('konjunktiv-haette-waere')!.summary)).toBeOnTheScreen();
    expect(screen.getByText('Ich hätte gern mehr Urlaub.')).toBeOnTheScreen();
    expect(screen.getByText('A2.1 · Lektion 11')).toBeOnTheScreen();
    expect(screen.getByText('Not in your reviews yet.')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Add to my reviews' }));
    expect(topicProgress(services.db).get('konjunktiv-haette-waere')?.state).toBe('new');
    expect(
      screen.getByText('In your reviews: it comes up as a new grammar point.'),
    ).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Stop reviewing it' }));
    expect(topicProgress(services.db).get('konjunktiv-haette-waere')?.state).toBe('suspended');
    expect(screen.getByRole('button', { name: 'Back into my reviews' })).toBeOnTheScreen();
  });

  it('practises the topic now', async () => {
    const services = await renderWithServices(<TopicScreen topicId="weil" />);
    await fireEvent.press(screen.getByRole('button', { name: 'Practise now' }));
    expect(topicProgress(services.db).has('weil')).toBe(true);
    expect(router.push).toHaveBeenCalledWith({ pathname: '/study', params: { topics: 'weil' } });
  });

  it('says so for an unknown topic', async () => {
    await renderWithServices(<TopicScreen topicId="nope" />);
    expect(screen.getByText('This grammar topic does not exist.')).toBeOnTheScreen();
  });
});

describe('a lesson page', () => {
  it('lists the lesson’s grammar and remembers that class is on it', async () => {
    const services = await renderWithServices(<LessonScreen lessonRef="B1.1-4" />);
    expect(screen.getByTestId('lesson-title')).toHaveTextContent('Morgen, morgen …!');
    expect(screen.getByText('• Konnektoren damit, um … zu')).toBeOnTheScreen();
    expect(screen.getByText('Ziel: um … zu und damit')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'My class is on this lesson' }));
    expect(listChapters(services.db)).toHaveLength(24);
    expect(currentLesson(services.db)).toMatchObject({ book: 'B1.1', number: 4 });
    expect(screen.getByTestId('lesson-current')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Add to my reviews' }));
    expect(topicProgress(services.db).has('um-zu-damit')).toBe(true);
    expect(screen.queryByRole('button', { name: /Add/ })).not.toBeOnTheScreen();
  });

  it('points to the next lesson, across volumes', async () => {
    await renderWithServices(<LessonScreen lessonRef="A2.1-12" />);
    await fireEvent.press(screen.getByRole('button', { name: 'Next: Lektion 13 (A2.2)' }));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/lesson/[ref]',
      params: { ref: 'A2.2-13' },
    });
  });
});

describe('practising chosen topics', () => {
  it('introduces the topic, drills it from the bank and offers another round', async () => {
    const clock = { t: T };
    const services = await createTestServices({ now: () => new Date(clock.t) });
    startTopic(services.db, 'weil', T);
    await renderWithServices(
      <UmlautProvider>
        <StudyScreen topics={['weil']} />
      </UmlautProvider>,
      services,
    );

    expect(await screen.findByText('New grammar point')).toBeOnTheScreen();
    expect(screen.getByText('Nebensatz mit weil')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Try it' }));

    const presentation = useStudyStore.getState().presentation;
    if (presentation.mode !== 'grammar_drill') throw new Error('expected a grammar drill');
    const items = presentation.drill.items;
    expect(items).toHaveLength(8);
    expect(screen.getByTestId('drill-progress')).toHaveTextContent('Grammar drill · 1 of 8');
    for (const drillItem of items) {
      await fireEvent.changeText(screen.getByLabelText('Your answer'), drillItem.answer);
      await fireEvent.press(screen.getByRole('button', { name: 'Check' }));
      await fireEvent.press(screen.getByRole('button', { name: /Next|Finish/ }));
    }
    expect(await screen.findByTestId('feedback-expected')).toHaveTextContent('8 of 8 right');
    expect(services.db.select().from(review).all()).toEqual([
      expect.objectContaining({ mode: 'grammar_drill', correct: true }),
    ]);

    // A new point comes back once from its learning step, with a fresh draw.
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByTestId('drill-progress')).toHaveTextContent('Grammar drill · 1 of 8');
    const second = useStudyStore.getState().presentation;
    if (second.mode !== 'grammar_drill') throw new Error('expected a grammar drill');
    expect(second.drill.items.map((i) => i.sentence)).not.toEqual(items.map((i) => i.sentence));

    // Stop (the header button) ends it with the summary.
    await act(() => useStudyStore.getState().finish());
    expect(await screen.findByTestId('study-summary')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Practise again' }));
    expect(await screen.findByTestId('drill-progress')).toHaveTextContent('Grammar drill · 1 of 8');
  });

  it('says what to do when none of the topics are started', async () => {
    await renderWithServices(<StudyScreen topics={['dass']} />);
    expect(await screen.findByText('Nothing to practise here yet.')).toBeOnTheScreen();
  });
});

describe('the grammar path elsewhere in the app', () => {
  it('shows the lesson class is on at home, ready to practise', async () => {
    const services = await createTestServices({ now: () => new Date(T) });
    await renderWithServices(<HomeScreen />, services);
    expect(screen.getByRole('button', { name: 'Open the grammar path' })).toBeOnTheScreen();

    const lesson = getLesson('A2.1/7')!;
    await renderWithServices(<LessonScreen lessonRef="A2.1-7" />, services);
    await fireEvent.press(screen.getByRole('button', { name: 'My class is on this lesson' }));
    await renderWithServices(<HomeScreen />, services);
    const card = screen.getByTestId('home-grammar');
    expect(within(card).getByText(lesson.title)).toBeOnTheScreen();
    await fireEvent.press(within(card).getByRole('button', { name: 'Practise' }));
    expect(router.push).toHaveBeenLastCalledWith({
      pathname: '/study',
      params: {
        topics: lessonTopics(lesson)
          .map((t) => t.id)
          .join(','),
      },
    });
  });

  it('fills the chapter list with Momente lessons in one tap', async () => {
    const services = await renderWithServices(<ChaptersScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Use the Momente lesson list' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Momente A2' }));
    const chapters = listChapters(services.db);
    expect(chapters).toHaveLength(24);
    expect(chapters[0]).toMatchObject({
      book: 'Momente A2',
      number: 1,
      title: 'Mein Vater Vittorio war der Erste hier!',
    });
    expect(screen.getByText('1. Mein Vater Vittorio war der Erste hier!')).toBeOnTheScreen();
  });

  it('offers built-in topics before writing a grammar point with the LLM', async () => {
    const services = await createTestServices();
    setSetting(services.db, 'study.currentChapterId', null);
    await renderWithServices(
      <UmlautProvider>
        <AddGrammarScreen />
      </UmlautProvider>,
      services,
    );
    await fireEvent.changeText(screen.getByLabelText('Grammar point'), 'Konjunktiv 2');
    const builtIn = screen.getByTestId('grammar-built-in');
    expect(within(builtIn).getAllByText(/^Konjunktiv II/)).toHaveLength(3);
  });
});
