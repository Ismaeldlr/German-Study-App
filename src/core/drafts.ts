import type { NounCheck } from './nouns';
import type { Article, Auxiliary, GrammaticalCase, ItemKind } from './model';
import type { ListHints, ParsedLine } from './parse-list';

/**
 * A word on its way into the deck: what the LLM returned, corrected by the
 * textbook notation, with flags for anything worth a second look. Nothing
 * enters the deck until you confirm the preview.
 */

export interface DraftFields {
  kind: ItemKind;
  lemma: string;
  article: Article | null;
  plural: string | null;
  verbPresent3: string | null;
  verbPreterite: string | null;
  verbParticiple: string | null;
  verbAuxiliary: Auxiliary | null;
  separable: boolean;
  reflexive: boolean;
  governedCase: GrammaticalCase | null;
  meanings: string[];
  exampleDe: string | null;
  exampleEn: string | null;
}

export type FlagField =
  'line' | 'duplicate' | 'lemma' | 'kind' | 'article' | 'plural' | 'verb' | 'case' | 'meanings';

export interface DraftFlag {
  field: FlagField;
  tone: 'warning' | 'info';
  message: string;
}

export interface Draft {
  lineIndex: number;
  raw: string;
  status: 'ok' | 'unclear' | 'failed';
  /** Whether the row is ticked for import. Unclear and failed rows start unticked. */
  include: boolean;
  fields: DraftFields;
  flags: DraftFlag[];
  note: string | null;
  /** Deck item this row duplicates, if any. */
  duplicateOf?: { id: number; lemma: string };
}

/** The shape of one enrich_words record, kept structural so core stays free of the LLM layer. */
export interface EnrichedWord {
  status: 'ok' | 'unclear';
  kind: Exclude<ItemKind, 'grammar'>;
  lemma: string;
  article: Article | null;
  plural: string | null;
  verb: { present3: string; preterite: string; participle: string; auxiliary: Auxiliary } | null;
  separable: boolean;
  reflexive: boolean;
  case: GrammaticalCase | null;
  meanings: string[];
  example_de: string;
  example_en: string;
  low_confidence: string[];
  note?: string | null;
}

const FIELD_NAMES: Record<string, FlagField> = {
  lemma: 'lemma',
  kind: 'kind',
  article: 'article',
  plural: 'plural',
  verb: 'verb',
  case: 'case',
  meanings: 'meanings',
};

export function draftFromRecord(
  line: Pick<ParsedLine, 'index' | 'raw' | 'hints' | 'unclear' | 'reason'>,
  record: EnrichedWord,
): Draft {
  const fields: DraftFields = {
    kind: record.kind,
    lemma: record.lemma.trim(),
    article: record.kind === 'noun' ? record.article : null,
    plural: record.kind === 'noun' ? record.plural?.trim() || null : null,
    verbPresent3: record.verb?.present3.trim() || null,
    verbPreterite: record.verb?.preterite.trim() || null,
    verbParticiple: record.verb?.participle.trim() || null,
    verbAuxiliary: record.verb?.auxiliary ?? null,
    separable: record.separable,
    reflexive: record.reflexive,
    governedCase: record.case,
    meanings: uniqueMeanings(record.meanings),
    exampleDe: record.example_de.trim() || null,
    exampleEn: record.example_en.trim() || null,
  };
  const flags: DraftFlag[] = [];
  applyHints(fields, line.hints, flags);

  for (const name of record.low_confidence) {
    const field = FIELD_NAMES[name];
    if (field)
      flags.push({ field, tone: 'info', message: `The LLM was unsure about the ${name}.` });
  }

  const unclear = line.unclear || record.status === 'unclear';
  if (unclear) {
    flags.unshift({
      field: 'line',
      tone: 'warning',
      message: line.reason ?? 'This line does not look like a German word or phrase.',
    });
  }
  return {
    lineIndex: line.index,
    raw: line.raw,
    status: record.status === 'unclear' ? 'unclear' : 'ok',
    include: !unclear,
    fields,
    flags,
    note: record.note?.trim() || null,
  };
}

/** The textbook notation is what class taught, so it wins over the LLM. */
function applyHints(fields: DraftFields, hints: ListHints, flags: DraftFlag[]) {
  if (hints.lemma && hints.article && fields.kind !== 'noun') {
    flags.push({
      field: 'kind',
      tone: 'warning',
      message: 'The list writes this with an article, so it is a noun.',
    });
    fields.kind = 'noun';
  }
  if (hints.pluralOnly) {
    fields.article = null;
    fields.plural = hints.lemma ?? fields.lemma;
  } else if (hints.article && fields.article !== hints.article) {
    flags.push({
      field: 'article',
      tone: 'warning',
      message: `The list says ${hints.article}; the LLM said ${fields.article ?? 'none'}.`,
    });
    fields.article = hints.article;
  }
  if (hints.plural !== undefined && !hints.pluralOnly && fields.plural !== hints.plural) {
    flags.push({
      field: 'plural',
      tone: 'warning',
      message: `The list says ${hints.plural ?? 'no plural'}; the LLM said ${fields.plural ?? 'no plural'}.`,
    });
    fields.plural = hints.plural;
  }
  if (hints.perfect && fields.kind === 'verb') {
    const { auxiliary, participle } = hints.perfect;
    if (fields.verbAuxiliary !== auxiliary || fields.verbParticiple !== participle) {
      flags.push({
        field: 'verb',
        tone: 'warning',
        message: `The list says ${auxiliary === 'sein' ? 'ist' : 'hat'} ${participle}.`,
      });
      fields.verbAuxiliary = auxiliary;
      fields.verbParticiple = participle;
    }
  }
  if (hints.translation) {
    const fromList = hints.translation.split(/[,;]/);
    fields.meanings = uniqueMeanings([...fromList, ...fields.meanings]).slice(0, 4);
  }
}

/** A line the LLM could not handle. You can still fill it in by hand. */
export function failedDraft(
  line: Pick<ParsedLine, 'index' | 'raw' | 'german' | 'hints'>,
  reason: string,
): Draft {
  return {
    lineIndex: line.index,
    raw: line.raw,
    status: 'failed',
    include: false,
    fields: {
      kind: line.hints.article ? 'noun' : 'phrase',
      lemma: line.hints.lemma ?? line.german,
      article: line.hints.article ?? null,
      plural: line.hints.plural ?? null,
      verbPresent3: null,
      verbPreterite: null,
      verbParticiple: line.hints.perfect?.participle ?? null,
      verbAuxiliary: line.hints.perfect?.auxiliary ?? null,
      separable: false,
      reflexive: false,
      governedCase: null,
      meanings: line.hints.translation ? [line.hints.translation] : [],
      exampleDe: null,
      exampleEn: null,
    },
    flags: [{ field: 'line', tone: 'warning', message: reason }],
    note: null,
  };
}

/** Add the noun-list result to a draft's flags. */
export function withNounCheck(draft: Draft, check: NounCheck): Draft {
  if (!check.known || check.issues.length === 0) return draft;
  return {
    ...draft,
    flags: [
      ...draft.flags.filter(
        (f) => !check.issues.some((i) => i.field === f.field && f.tone === 'info'),
      ),
      ...check.issues.map((issue) => ({
        field: issue.field,
        tone: 'warning' as const,
        message: issue.message,
      })),
    ],
  };
}

export function withDuplicate(
  draft: Draft,
  duplicate: { id: number; lemma: string } | undefined,
  near: string[],
): Draft {
  const flags = [...draft.flags];
  if (duplicate) {
    flags.unshift({
      field: 'duplicate',
      tone: 'warning',
      message: `Already in your deck as ${duplicate.lemma}.`,
    });
  } else if (near.length) {
    flags.push({
      field: 'duplicate',
      tone: 'info',
      message: `Did you mean ${near.join(' or ')}? It is already in your deck.`,
    });
  }
  return { ...draft, flags, duplicateOf: duplicate, include: draft.include && !duplicate };
}

/** Problems that block saving. */
export function validateFields(fields: DraftFields): string[] {
  const errors: string[] = [];
  if (!fields.lemma.trim()) errors.push('Enter the German word.');
  if (fields.meanings.filter((m) => m.trim()).length === 0)
    errors.push('Enter at least one English meaning.');
  if (fields.kind === 'noun' && !fields.article && !fields.plural) {
    errors.push('A noun needs an article, or a plural if it only exists in the plural.');
  }
  const forms = [
    fields.verbPresent3,
    fields.verbPreterite,
    fields.verbParticiple,
    fields.verbAuxiliary,
  ];
  if (fields.kind === 'verb' && forms.some(Boolean) && !forms.every(Boolean)) {
    errors.push('Fill in all verb forms, or leave them all empty.');
  }
  return errors;
}

export function emptyFields(lemma = ''): DraftFields {
  return {
    kind: 'noun',
    lemma,
    article: null,
    plural: null,
    verbPresent3: null,
    verbPreterite: null,
    verbParticiple: null,
    verbAuxiliary: null,
    separable: false,
    reflexive: false,
    governedCase: null,
    meanings: [],
    exampleDe: null,
    exampleEn: null,
  };
}

/** Trimmed, without blanks or case-insensitive repeats, in order. */
export function uniqueMeanings(meanings: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const meaning of meanings.map((m) => m.trim())) {
    if (!meaning || seen.has(meaning.toLowerCase())) continue;
    seen.add(meaning.toLowerCase());
    result.push(meaning);
  }
  return result;
}
