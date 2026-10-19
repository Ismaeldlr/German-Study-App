import type { ItemForms } from './cards';
import { gradeGender, gradePlural, gradeProduce, gradeVerbForms } from './grading';

const wohnung: ItemForms = {
  kind: 'noun',
  lemma: 'Wohnung',
  article: 'die',
  plural: 'Wohnungen',
  verbPresent3: null,
  verbPreterite: null,
  verbParticiple: null,
  verbAuxiliary: null,
};

const umziehen: ItemForms = {
  kind: 'verb',
  lemma: 'umziehen',
  article: null,
  plural: null,
  verbPresent3: 'zieht um',
  verbPreterite: 'zog um',
  verbParticiple: 'umgezogen',
  verbAuxiliary: 'sein',
};

describe('produce card', () => {
  it('accepts a noun with or without its article', () => {
    expect(gradeProduce(wohnung, 'Wohnung').outcome).toBe('correct');
    expect(gradeProduce(wohnung, 'die Wohnung').outcome).toBe('correct');
  });

  it('counts a wrong article as a slip and logs it', () => {
    const grade = gradeProduce(wohnung, 'der Wohnung');
    expect(grade.outcome).toBe('slip');
    expect(grade.mistakes).toEqual([expect.objectContaining({ category: 'article' })]);
  });

  it('counts a lowercase noun as a capitalization slip', () => {
    const grade = gradeProduce(wohnung, 'wohnung');
    expect(grade.outcome).toBe('slip');
    expect(grade.mistakes[0].category).toBe('capitalization');
  });

  it('logs near misses as spelling and others as wrong word', () => {
    expect(gradeProduce(wohnung, 'Wohnug').mistakes[0].category).toBe('spelling');
    expect(gradeProduce(wohnung, 'Haus').mistakes[0].category).toBe('wrong_word');
  });

  it('treats a missing sich as a slip', () => {
    const freuen = { ...umziehen, lemma: 'sich freuen', verbPresent3: null };
    expect(gradeProduce(freuen, 'sich freuen').outcome).toBe('correct');
    expect(gradeProduce(freuen, 'freuen').outcome).toBe('slip');
    expect(gradeProduce(freuen, 'feiern').outcome).toBe('wrong');
  });
});

describe('gender card', () => {
  it('grades the article', () => {
    expect(gradeGender(wohnung, 'die').outcome).toBe('correct');
    const wrong = gradeGender(wohnung, 'das');
    expect(wrong.outcome).toBe('wrong');
    expect(wrong.expected).toBe('die Wohnung');
    expect(wrong.mistakes[0].category).toBe('article');
  });
});

describe('plural card', () => {
  it('accepts the plural with or without die', () => {
    expect(gradePlural(wohnung, 'Wohnungen').outcome).toBe('correct');
    expect(gradePlural(wohnung, 'die Wohnungen').outcome).toBe('correct');
    expect(gradePlural(wohnung, 'der Wohnungen').outcome).toBe('slip');
    expect(gradePlural(wohnung, 'Wohnungs').outcome).toBe('wrong');
  });

  it('accepts ae for ä as a slip', () => {
    const haus = { ...wohnung, lemma: 'Haus', article: 'das' as const, plural: 'Häuser' };
    expect(gradePlural(haus, 'Haeuser').outcome).toBe('slip');
  });
});

describe('verb forms card', () => {
  it('accepts all three forms, with or without a pronoun', () => {
    const grade = gradeVerbForms(umziehen, {
      present3: 'er zieht um',
      preterite: 'zog um',
      perfect: 'ist umgezogen',
    });
    expect(grade.outcome).toBe('correct');
    expect(grade.mistakes).toEqual([]);
  });

  it('marks the wrong helper verb wrong', () => {
    const grade = gradeVerbForms(umziehen, {
      present3: 'zieht um',
      preterite: 'zog um',
      perfect: 'hat umgezogen',
    });
    expect(grade.outcome).toBe('wrong');
    expect(grade.fields.perfect.outcome).toBe('wrong');
    expect(grade.mistakes[0]).toMatchObject({ category: 'verb_form', correction: 'ist umgezogen' });
  });

  it('needs the helper verb at all', () => {
    expect(
      gradeVerbForms(umziehen, { present3: 'zieht um', preterite: 'zog um', perfect: 'umgezogen' })
        .outcome,
    ).toBe('wrong');
  });

  it('is a slip when one field has a small slip', () => {
    const fahren: ItemForms = {
      ...umziehen,
      lemma: 'fahren',
      verbPresent3: 'fährt',
      verbPreterite: 'fuhr',
      verbParticiple: 'gefahren',
    };
    const grade = gradeVerbForms(fahren, {
      present3: 'faehrt',
      preterite: 'fuhr',
      perfect: 'ist gefahren',
    });
    expect(grade.outcome).toBe('slip');
    expect(grade.fields.present3.outcome).toBe('slip');
  });
});
