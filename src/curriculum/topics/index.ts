import type { TopicSource } from '../types';
import { ADJECTIVE_TOPICS } from './adjectives';
import { ARTICLE_TOPICS } from './articles';
import { CASE_TOPICS } from './cases';
import { CLAUSE_TOPICS } from './clauses';
import { KONJUNKTIV_TOPICS } from './konjunktiv';
import { MODAL_TOPICS } from './modals';
import { NUMBER_TOPICS } from './numbers';
import { PASSIVE_TOPICS } from './passive';
import { PREPOSITION_TOPICS } from './prepositions';
import { PRESENT_TOPICS } from './present';
import { PRONOUN_TOPICS } from './pronouns';
import { SENTENCE_TOPICS } from './sentence';
import { TENSE_TOPICS } from './tenses';
import { WORD_FORMATION_TOPICS } from './word-formation';

/** Every built-in topic, block by block, roughly in the order Momente teaches them. */
export const TOPIC_SOURCES: TopicSource[] = [
  ...ARTICLE_TOPICS,
  ...CASE_TOPICS,
  ...PRONOUN_TOPICS,
  ...PRESENT_TOPICS,
  ...MODAL_TOPICS,
  ...TENSE_TOPICS,
  ...KONJUNKTIV_TOPICS,
  ...PASSIVE_TOPICS,
  ...SENTENCE_TOPICS,
  ...CLAUSE_TOPICS,
  ...PREPOSITION_TOPICS,
  ...ADJECTIVE_TOPICS,
  ...NUMBER_TOPICS,
  ...WORD_FORMATION_TOPICS,
];
