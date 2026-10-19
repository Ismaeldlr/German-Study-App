import {
  checkNoun,
  resolveNoun,
  type NounCheck,
  type NounLookup,
  type NounTable,
} from '@/core/nouns';
import type { Article } from '@/core/model';

let table: NounTable | null = null;

/** The bundled Wiktionary noun list, loaded on first use to keep cold start fast. */
export function getNounTable(): NounTable {
  table ??= require('./noun-list.json') as NounTable;
  return table;
}

export function lookupNoun(lemma: string): NounLookup | null {
  return resolveNoun(getNounTable(), lemma.trim());
}

export function checkNounAgainstList(noun: {
  lemma: string;
  article: Article | null;
  plural: string | null;
}): NounCheck {
  return checkNoun(lookupNoun(noun.lemma), noun);
}
