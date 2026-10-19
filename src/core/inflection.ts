import { normalizeAnswer, stripUmlauts } from './answers';
import type { ItemForms } from './cards';

/**
 * Whether a word in a generated sentence is some inflected form of a deck
 * item. It is a stem check, not a morphology engine: generous enough for
 * "zogen" from "umziehen" or "Gärten" from "Garten", strict enough to reject
 * a sentence that swapped the target for a different word.
 */

export interface InflectionSource extends ItemForms {
  separable?: boolean;
}

/** Forms no stem rule reaches. Keys are lemmas. */
const IRREGULAR: Record<string, string[]> = {
  sein: ['bin', 'bist', 'ist', 'sind', 'seid', 'war', 'gewesen', 'sei', 'wäre'],
  werden: ['wirst', 'wird', 'wurde', 'geworden', 'würde'],
  haben: ['hast', 'hat', 'hatte', 'gehabt', 'hätte'],
  wissen: ['weiß', 'wusste', 'gewusst'],
  mögen: ['mag', 'mochte', 'möchte', 'gemocht'],
  können: ['kann', 'konnte', 'gekonnt', 'könnte'],
  müssen: ['muss', 'musste', 'gemusst'],
  dürfen: ['darf', 'durfte', 'gedurft'],
  wollen: ['will', 'wollte', 'gewollt'],
  gut: ['besser', 'best'],
  viel: ['mehr', 'meist'],
  gern: ['lieber', 'liebst'],
  hoch: ['hoh', 'höher', 'höchst'],
  nah: ['näher', 'nächst'],
};

const MIN_STEM = 3;

const key = (text: string) => stripUmlauts(normalizeAnswer(text).toLowerCase());
const words = (text: string) =>
  key(text)
    .split(/[\s,;.!?"„“()]+/)
    .filter(Boolean);

export function isFormOf(answer: string, item: InflectionSource): boolean {
  const given = words(answer);
  if (given.length === 0) return false;
  const whole = given.join(' ');
  const stems = stemsFor(item);
  const exact = exactFormsFor(item);
  if (exact.has(whole)) return true;
  return given.some(
    (word) =>
      exact.has(word) || stems.some((stem) => word.startsWith(stem) && stem.length >= MIN_STEM),
  );
}

/** The item's core word: no article, no "sich", no trailing preposition. */
export function coreWord(item: InflectionSource): string {
  let lemma = normalizeAnswer(item.lemma)
    .replace(/^(der|die|das)\s+/i, '')
    .replace(/^sich\s+/i, '');
  if (item.kind === 'verb') lemma = lemma.split(/\s+/)[0];
  return lemma;
}

function exactFormsFor(item: InflectionSource): Set<string> {
  const forms = [item.lemma, coreWord(item), item.plural, item.verbParticiple]
    .filter((f): f is string => Boolean(f))
    .map(key);
  for (const form of IRREGULAR[coreWord(item)] ?? []) forms.push(key(form));
  for (const form of [item.verbPresent3, item.verbPreterite]) {
    if (form) forms.push(key(form.split(/\s+/)[0]));
  }
  return new Set(forms);
}

function stemsFor(item: InflectionSource): string[] {
  const core = key(coreWord(item));
  const stems = new Set<string>();
  const add = (stem: string | null | undefined) => {
    if (stem && stem.length >= MIN_STEM) stems.add(stem);
  };

  switch (item.kind) {
    case 'verb': {
      const particle = separableParticle(item);
      const base = particle && core.startsWith(particle) ? core.slice(particle.length) : core;
      add(verbStem(core));
      add(verbStem(base));
      // "umzuziehen"
      if (particle) add(`${particle}zu${verbStem(base) ?? ''}`);
      if (item.verbPresent3) add(key(item.verbPresent3.split(/\s+/)[0]).replace(/t$/, ''));
      if (item.verbPreterite) add(key(item.verbPreterite.split(/\s+/)[0]).replace(/te$/, ''));
      if (item.verbParticiple) add(key(item.verbParticiple));
      break;
    }
    case 'noun':
      add(core);
      add(core.replace(/e$/, ''));
      if (item.plural) add(key(item.plural));
      break;
    case 'adjective':
    case 'adverb':
      add(core);
      add(core.replace(/e$/, ''));
      // dunkel -> dunkle, teuer -> teure
      add(core.replace(/e([lr])$/, '$1'));
      break;
    default: {
      // Phrases: the first word that carries meaning.
      const first = core.split(/\s+/).find((w) => w.length >= MIN_STEM);
      add(first);
    }
  }
  return [...stems];
}

/** "zieht um" -> "um". */
export function separableParticle(item: InflectionSource): string | null {
  const parts = item.verbPresent3?.trim().split(/\s+/) ?? [];
  if (parts.length < 2) return null;
  return key(parts[parts.length - 1]);
}

function verbStem(infinitive: string): string | null {
  if (/[^e]en$/.test(infinitive) || /een$/.test(infinitive)) return infinitive.slice(0, -2);
  if (/[lr]n$/.test(infinitive)) return infinitive.slice(0, -1);
  return infinitive || null;
}
