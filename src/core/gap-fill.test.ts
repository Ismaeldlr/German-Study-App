import { CardState } from './cards';
import {
  BLANK,
  fillGap,
  gapHint,
  gapProblem,
  gradeGapFill,
  isFresh,
  sentenceHash,
  tokenize,
  type GapExercise,
} from './gap-fill';
import { isFormOf, type InflectionSource } from './inflection';

const noun = (lemma: string, article: 'der' | 'die' | 'das', plural: string): InflectionSource => ({
  kind: 'noun',
  lemma,
  article,
  plural,
  verbPresent3: null,
  verbPreterite: null,
  verbParticiple: null,
  verbAuxiliary: null,
});

const verb = (
  lemma: string,
  present3: string,
  preterite: string,
  participle: string,
): InflectionSource => ({
  kind: 'verb',
  lemma,
  article: null,
  plural: null,
  verbPresent3: present3,
  verbPreterite: preterite,
  verbParticiple: participle,
  verbAuxiliary: 'haben',
});

const adjective = (lemma: string): InflectionSource => ({
  ...noun(lemma, 'der', ''),
  kind: 'adjective',
  article: null,
  plural: null,
});

describe('inflected forms', () => {
  it('accepts noun cases and plurals, umlauts included', () => {
    const garten = noun('Garten', 'der', 'Gärten');
    expect(isFormOf('Garten', garten)).toBe(true);
    expect(isFormOf('Gärten', garten)).toBe(true);
    expect(isFormOf('Gärten', garten)).toBe(true);
    expect(isFormOf('Wohnungen', noun('Wohnung', 'die', 'Wohnungen'))).toBe(true);
    expect(isFormOf('Nachbarn', noun('Nachbar', 'der', 'Nachbarn'))).toBe(true);
    expect(isFormOf('Balkon', garten)).toBe(false);
  });

  it('accepts conjugated, past and separated verb forms', () => {
    const umziehen = verb('umziehen', 'zieht um', 'zog um', 'umgezogen');
    for (const form of [
      'ziehen',
      'zieht',
      'ziehe',
      'zogen',
      'umgezogen',
      'umziehen',
      'umzuziehen',
    ]) {
      expect(isFormOf(form, umziehen)).toBe(true);
    }
    const fahren = verb('fahren', 'fährt', 'fuhr', 'gefahren');
    for (const form of ['fährst', 'fahre', 'fuhren', 'gefahren']) {
      expect(isFormOf(form, fahren)).toBe(true);
    }
    expect(isFormOf('wohnt', umziehen)).toBe(false);
    expect(isFormOf('freue', verb('sich freuen auf', 'freut sich auf', 'freute', 'gefreut'))).toBe(
      true,
    );
    expect(isFormOf('bin', verb('sein', 'ist', 'war', 'gewesen'))).toBe(true);
  });

  it('accepts adjective endings and comparatives', () => {
    expect(isFormOf('gemütlichen', adjective('gemütlich'))).toBe(true);
    expect(isFormOf('älter', adjective('alt'))).toBe(true);
    expect(isFormOf('dunkle', adjective('dunkel'))).toBe(true);
    expect(isFormOf('teure', adjective('teuer'))).toBe(true);
    expect(isFormOf('besser', adjective('gut'))).toBe(true);
    expect(isFormOf('schön', adjective('gemütlich'))).toBe(false);
  });
});

const exercise = (overrides: Partial<GapExercise> = {}): GapExercise => ({
  sentence: `Wir ${BLANK} im Mai in eine größere Wohnung um.`,
  answer: 'ziehen',
  accepted: [],
  cue: 'to move (house)',
  translation: 'We are moving into a bigger flat in May.',
  glosses: [{ de: 'größere', en: 'bigger' }],
  ...overrides,
});
const umziehen = verb('umziehen', 'zieht um', 'zog um', 'umgezogen');

describe('validating a generated sentence', () => {
  it('accepts a sentence whose blank holds the target', () => {
    expect(gapProblem(exercise(), umziehen)).toBeNull();
  });

  it('rejects sentences without exactly one blank', () => {
    expect(gapProblem(exercise({ sentence: 'Wir ziehen im Mai um.' }), umziehen)).toMatch(
      /exactly one/,
    );
    expect(gapProblem(exercise({ sentence: `${BLANK} und ${BLANK} heute.` }), umziehen)).toMatch(
      /exactly one/,
    );
  });

  it('rejects an answer that is a different word', () => {
    expect(gapProblem(exercise({ answer: 'fahren' }), umziehen)).toMatch(/not a form of umziehen/);
  });

  it('rejects a sentence that gives the answer away', () => {
    expect(
      gapProblem(exercise({ sentence: `Wir ${BLANK} um, weil wir ziehen müssen.` }), umziehen),
    ).toMatch(/also appears/);
  });
});

describe('grading a gap', () => {
  const wohnung = exercise({
    sentence: `Die ${BLANK} hat drei Zimmer.`,
    answer: 'Wohnung',
    accepted: [],
  });

  it('accepts the exact form and other accepted forms', () => {
    expect(gradeGapFill(wohnung, 'Wohnung', 'noun').outcome).toBe('correct');
    expect(
      gradeGapFill({ ...wohnung, accepted: ['Mietwohnung'] }, 'Mietwohnung', 'noun').outcome,
    ).toBe('correct');
  });

  it('treats a lowercase noun or a missing umlaut as a slip', () => {
    expect(gradeGapFill(wohnung, 'wohnung', 'noun')).toMatchObject({
      outcome: 'slip',
      slips: ['capitalization'],
    });
    const kueche = exercise({ sentence: `Die ${BLANK} ist klein.`, answer: 'Küche' });
    expect(gradeGapFill(kueche, 'Kueche', 'noun').outcome).toBe('slip');
  });

  it('names a wrong ending as a form mistake, not a wrong word', () => {
    const grade = gradeGapFill(exercise(), 'zieht', 'verb');
    expect(grade.outcome).toBe('wrong');
    expect(grade.mistakes[0]).toMatchObject({ category: 'verb_form', correction: 'ziehen' });
    expect(gradeGapFill(exercise(), 'laufen', 'verb').mistakes[0].category).toBe('wrong_word');
  });
});

describe('freshness and display', () => {
  it('hashes sentences regardless of case, spacing and punctuation', () => {
    expect(sentenceHash('Wir ziehen im Mai um.')).toBe(sentenceHash('wir  ziehen im mai um'));
    expect(sentenceHash('Wir ziehen im Mai um.')).not.toBe(sentenceHash('Wir ziehen im Juni um.'));
  });

  it("never repeats a sentence within the card's last five exercises", () => {
    const recent = ['a', 'b', 'c', 'd', 'e', 'f'];
    expect(isFresh('c', recent)).toBe(false);
    expect(isFresh('f', recent)).toBe(true);
    expect(isFresh('x', recent)).toBe(true);
  });

  it('gives learning cards the first letter and review cards none', () => {
    expect(gapHint({ state: CardState.Learning })).toBe('first_letter');
    expect(gapHint({ state: CardState.New })).toBe('first_letter');
    expect(gapHint({ state: CardState.Review })).toBe('none');
  });

  it('fills the blank and marks glossed words', () => {
    expect(fillGap(exercise())).toBe('Wir ziehen im Mai in eine größere Wohnung um.');
    const tokens = tokenize(exercise().sentence, exercise().glosses);
    expect(tokens.find((t) => t.blank)).toEqual({ text: BLANK, blank: true });
    expect(tokens.find((t) => t.gloss)).toEqual({ text: 'größere', gloss: 'bigger' });
  });
});
