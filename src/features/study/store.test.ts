import type { QueueEntry } from '@/core/queue';

import { useStudyStore, type Feedback } from './store';

const entry = (cardId: number): QueueEntry => ({
  cardId,
  itemId: cardId,
  type: 'recognize',
  kind: 'review',
  mode: 'classic',
});

const feedback = (outcome: Feedback['outcome'], xp: number): Feedback => ({
  outcome,
  expected: 'x',
  given: null,
  rating: outcome === 'wrong' ? 1 : 3,
  slips: [],
  mistakes: [],
  xp,
});

describe('study store: XP and combo', () => {
  it('adds up XP, counts answers in a row and keeps the best run', () => {
    const store = useStudyStore.getState();
    store.begin(1, [entry(1), entry(2), entry(3), entry(4)], 0);
    const answer = (outcome: Feedback['outcome'], xp: number) => {
      const state = useStudyStore.getState();
      const cardId = state.entry!.cardId;
      state.answered(
        feedback(outcome, xp),
        [{ cardId, itemId: cardId, type: 'recognize', rating: xp > 2 ? 3 : 1, nextDue: 1e12 }],
        'x',
        0,
      );
      useStudyStore.getState().next(0);
    };
    answer('correct', 10);
    answer('slip', 10);
    answer('wrong', 2);
    answer('correct', 12);

    expect(useStudyStore.getState()).toMatchObject({ xp: 34, combo: 1, bestCombo: 2 });
    useStudyStore.getState().reset();
    expect(useStudyStore.getState()).toMatchObject({ xp: 0, combo: 0, bestCombo: 0 });
  });
});

describe('study store: the finisher', () => {
  const answerAll = () => {
    const state = useStudyStore.getState();
    const cardId = state.entry!.cardId;
    state.answered(
      feedback('correct', 10),
      [{ cardId, itemId: cardId, type: 'recognize', rating: 3, nextDue: 1e12 }],
      'x',
      0,
    );
    useStudyStore.getState().next(0);
  };

  it('comes once the cards are done, and its ratings, XP and mistakes join the session', () => {
    useStudyStore.getState().begin(1, [entry(1)], 0, { finisher: ['story', 'chat'] });
    answerAll();
    expect(useStudyStore.getState().phase).toBe('finisher');

    useStudyStore.getState().finisherDone({
      ratings: [3, 1],
      xp: 14,
      mistakes: [
        {
          category: 'spelling',
          yourText: 'Mite',
          correction: 'Miete',
          explanation: '',
          lemma: 'x',
        },
      ],
    });
    const state = useStudyStore.getState();
    expect(state.phase).toBe('done');
    expect(state.session).toMatchObject({ answered: 3, recalled: 2 });
    expect(state.xp).toBe(24);
    expect(state.mistakes).toHaveLength(1);
  });

  it('never comes on other days, or after Stop', () => {
    useStudyStore.getState().begin(1, [entry(1)], 0);
    answerAll();
    expect(useStudyStore.getState().phase).toBe('done');

    useStudyStore.getState().begin(2, [entry(1), entry(2)], 0, { finisher: ['story'] });
    useStudyStore.getState().finish();
    expect(useStudyStore.getState()).toMatchObject({ phase: 'done', finisher: [] });
  });
});
