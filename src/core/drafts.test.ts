import {
  draftFromRecord,
  failedDraft,
  uniqueMeanings,
  validateFields,
  withDuplicate,
  withNounCheck,
  type EnrichedWord,
} from './drafts';
import { parseLine } from './parse-list';

const record = (overrides: Partial<EnrichedWord> = {}): EnrichedWord => ({
  status: 'ok',
  kind: 'noun',
  lemma: 'Garten',
  article: 'die',
  plural: 'Gärten',
  verb: null,
  separable: false,
  reflexive: false,
  case: null,
  meanings: ['garden'],
  example_de: 'Der Garten ist groß.',
  example_en: 'The garden is big.',
  low_confidence: [],
  ...overrides,
});

describe('drafts from LLM records', () => {
  it('lets the textbook notation win over the LLM and flags the conflict', () => {
    const draft = draftFromRecord(parseLine('der Garten, ¨'), record({ plural: 'Garten' }));
    expect(draft.fields).toMatchObject({ article: 'der', plural: 'Gärten' });
    expect(draft.flags.map((f) => f.field)).toEqual(['article', 'plural']);
    expect(draft.include).toBe(true);
  });

  it('takes the perfect from a verb line', () => {
    const draft = draftFromRecord(
      parseLine('fahren, fuhr, ist gefahren'),
      record({
        kind: 'verb',
        lemma: 'fahren',
        article: null,
        plural: null,
        verb: { present3: 'fährt', preterite: 'fuhr', participle: 'gefahren', auxiliary: 'haben' },
      }),
    );
    expect(draft.fields.verbAuxiliary).toBe('sein');
    expect(draft.flags[0]).toMatchObject({ field: 'verb', message: 'The list says ist gefahren.' });
  });

  it('puts the translation from the line first and removes repeats', () => {
    const draft = draftFromRecord(
      parseLine('gemütlich - cosy'),
      record({ kind: 'adjective', article: null, meanings: ['Cosy', 'comfortable'] }),
    );
    expect(draft.fields.meanings).toEqual(['cosy', 'comfortable']);
  });

  it('marks unclear lines and low-confidence fields', () => {
    const unclear = draftFromRecord(parseLine('Seite 12'), record({ status: 'unclear' }));
    expect(unclear).toMatchObject({ status: 'unclear', include: false });
    expect(unclear.flags[0].field).toBe('line');
    const unsure = draftFromRecord(
      parseLine('Garten'),
      record({ low_confidence: ['plural', 'nonsense'] }),
    );
    expect(unsure.flags).toEqual([
      { field: 'plural', tone: 'info', message: 'The LLM was unsure about the plural.' },
    ]);
  });

  it('turns a failed line into an editable row from its notation', () => {
    const draft = failedDraft(parseLine('die Miete, -n – rent'), 'timeout');
    expect(draft).toMatchObject({ status: 'failed', include: false });
    expect(draft.fields).toMatchObject({
      kind: 'noun',
      lemma: 'Miete',
      article: 'die',
      plural: 'Mieten',
      meanings: ['rent'],
    });
  });

  it('adds duplicate and noun-list flags', () => {
    const draft = draftFromRecord(parseLine('Garten'), record());
    const dup = withDuplicate(draft, { id: 3, lemma: 'der Garten' }, []);
    expect(dup).toMatchObject({ include: false, duplicateOf: { id: 3, lemma: 'der Garten' } });
    expect(withDuplicate(draft, undefined, ['der Garten']).flags[0].tone).toBe('info');
    const checked = withNounCheck(draft, {
      known: true,
      issues: [{ field: 'article', message: 'Wiktionary lists this noun as der, not die.' }],
    });
    expect(checked.flags).toContainEqual({
      field: 'article',
      tone: 'warning',
      message: 'Wiktionary lists this noun as der, not die.',
    });
    expect(withNounCheck(draft, { known: false, issues: [] })).toBe(draft);
  });
});

describe('validation and helpers', () => {
  it('requires the basics before saving', () => {
    const fields = draftFromRecord(parseLine('Garten'), record()).fields;
    expect(validateFields(fields)).toEqual([]);
    expect(validateFields({ ...fields, lemma: ' ', meanings: [] })).toHaveLength(2);
    expect(validateFields({ ...fields, article: null, plural: null })[0]).toMatch(/article/);
    expect(
      validateFields({
        ...fields,
        kind: 'verb',
        verbPresent3: 'x',
        verbPreterite: null,
        verbParticiple: null,
        verbAuxiliary: null,
      })[0],
    ).toMatch(/all verb forms/);
  });

  it('dedupes meanings ignoring case and blanks', () => {
    expect(uniqueMeanings([' flat ', 'Flat', '', 'apartment'])).toEqual(['flat', 'apartment']);
  });
});
