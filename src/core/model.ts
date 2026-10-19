// Domain vocabulary shared by every layer. The database schema stores these values.

export const ITEM_KINDS = ['noun', 'verb', 'adjective', 'adverb', 'phrase', 'grammar'] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

export const ARTICLES = ['der', 'die', 'das'] as const;
export type Article = (typeof ARTICLES)[number];

export const CASES = ['akk', 'dat', 'gen', 'akk_dat'] as const;
export type GrammaticalCase = (typeof CASES)[number];

export const AUXILIARIES = ['haben', 'sein'] as const;
export type Auxiliary = (typeof AUXILIARIES)[number];

export const ITEM_SOURCES = ['user', 'llm'] as const;
export type ItemSource = (typeof ITEM_SOURCES)[number];

export const ITEM_STATUSES = ['active', 'suspended'] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

export const CARD_TYPES = [
  'recognize',
  'produce',
  'gender',
  'plural',
  'verb_forms',
  'apply_grammar',
] as const;
export type CardType = (typeof CARD_TYPES)[number];

export const EXERCISE_MODES = [
  'classic',
  'gap_fill',
  'translation',
  'grammar_drill',
  'story',
  'chat',
] as const;
export type ExerciseMode = (typeof EXERCISE_MODES)[number];

export const MISTAKE_CATEGORIES = [
  'article',
  'case_ending',
  'adjective_ending',
  'word_order',
  'verb_form',
  'spelling',
  'wrong_word',
  'capitalization',
] as const;
export type MistakeCategory = (typeof MISTAKE_CATEGORIES)[number];

export const SUGGESTION_STATUSES = ['pending', 'accepted', 'rejected'] as const;
export type SuggestionStatus = (typeof SUGGESTION_STATUSES)[number];

export type Example = { de: string; en: string };
export type ChatMessage = { role: 'user' | 'assistant'; content: string; correction?: string };
