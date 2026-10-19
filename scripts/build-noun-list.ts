/// <reference types="node" />
/**
 * Build the bundled noun list from Wiktionary data.
 *
 *   npx tsx scripts/build-noun-list.ts path/to/nouns.csv
 *
 * Source: nouns.csv from https://github.com/gambolputty/german-nouns, about
 * 100,000 German nouns compiled from de.wiktionary.org (CC BY-SA 4.0).
 *
 * Writes src/data/nouns/noun-list.json. See src/core/nouns.ts for the format.
 * Compounds whose gender and plural follow from their head noun are left
 * out, since the lookup derives them, so every source noun still resolves
 * to exactly its Wiktionary entries. The script verifies that before writing.
 */
import fs from 'fs';
import path from 'path';

import { encodeEntries, resolveNoun, sameEntries, type NounEntry } from '../src/core/nouns';

// Proper names, abbreviations, multi-word entries and adjectival nouns
// (der/die Angestellte) are not useful for checking a learner's article.
const EXCLUDED_POS = new Set([
  'Toponym',
  'Vorname',
  'Nachname',
  'Eigenname',
  'Abkürzung',
  'Buchstabe',
  'Symbol',
  'Straßenname',
  'Wortverbindung',
  'adjektivische Deklination',
]);

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c !== '\r') field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const sameList = (a: string[], b: string[]) =>
  a.length === b.length && [...a].sort().every((x, i) => x === [...b].sort()[i]);

/** Join entries that differ only in gender, like der/das Kaffee. */
function mergeGenders(entries: NounEntry[]): NounEntry[] {
  const merged: NounEntry[] = [];
  for (const e of entries) {
    const twin = merged.find((m) => m.g !== 'p' && e.g !== 'p' && sameList(m.plurals, e.plurals));
    if (twin) twin.g = [...new Set((twin.g + e.g).split(''))].sort().join('');
    else merged.push({ g: e.g, plurals: [...e.plurals] });
  }
  return merged;
}

function main() {
  const input = process.argv[2];
  if (!input) {
    console.error('usage: npx tsx scripts/build-noun-list.ts path/to/nouns.csv');
    process.exit(1);
  }
  const rows = parseCsv(fs.readFileSync(input, 'utf8'));
  const header = rows.shift() ?? [];
  const col = (name: string) => header.indexOf(name);
  const genusCols = ['genus', 'genus 1', 'genus 2', 'genus 3', 'genus 4'].map(col);
  const pluralCols = [
    'nominativ plural',
    'nominativ plural*',
    'nominativ plural 1',
    'nominativ plural 2',
    'nominativ plural 3',
    'nominativ plural 4',
  ].map(col);
  const singularCol = col('nominativ singular');

  const all = new Map<string, NounEntry[]>();
  for (const row of rows) {
    const lemma = (row[0] ?? '').trim();
    const pos = (row[1] ?? '').split(',');
    if (!lemma || !pos.includes('Substantiv') || pos.some((p) => EXCLUDED_POS.has(p))) continue;
    if (lemma.length < 2 || !/^[A-ZÄÖÜ][A-Za-zÄÖÜäöüß-]*$/.test(lemma)) continue;

    const genders = [...new Set(genusCols.map((i) => row[i]).filter((g) => /^[mfn]$/.test(g)))]
      .sort()
      .join('');
    const plurals = [
      ...new Set(
        pluralCols
          .map((i) => (row[i] ?? '').trim())
          .filter((p) => /^[A-Za-zÄÖÜäöüß-]+$/.test(p) && p !== '-'),
      ),
    ];
    let g = genders;
    if (!g) {
      // No gender: a plural-only noun like Eltern, or an entry we cannot use.
      if (!row[singularCol] && plurals.length) g = 'p';
      else continue;
    }
    const entries = all.get(lemma) ?? [];
    if (!entries.some((e) => e.g === g && sameList(e.plurals, plurals))) {
      entries.push({ g, plurals });
    }
    all.set(lemma, entries);
  }
  for (const [lemma, entries] of all) all.set(lemma, mergeGenders(entries));

  // Shorter words first, so every head a compound can resolve to is final.
  const lemmas = [...all.keys()].sort((a, b) => a.length - b.length || a.localeCompare(b));
  const table: Record<string, string> = {};
  let derived = 0;
  for (const lemma of lemmas) {
    const entries = all.get(lemma)!;
    const resolved = resolveNoun(table, lemma);
    if (resolved?.source === 'compound' && sameEntries(resolved.entries, entries)) {
      derived++;
      continue;
    }
    table[lemma] = encodeEntries(lemma, entries);
  }

  for (const [lemma, entries] of all) {
    const resolved = resolveNoun(table, lemma);
    if (!resolved || !sameEntries(resolved.entries, entries)) {
      throw new Error(`${lemma} does not round-trip`);
    }
  }

  const sorted = Object.fromEntries(
    Object.keys(table)
      .sort()
      .map((k) => [k, table[k]]),
  );
  const out = path.join(__dirname, '..', 'src', 'data', 'nouns', 'noun-list.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(sorted));
  console.log(
    `${all.size} nouns: ${Object.keys(table).length} stored, ${derived} derived from their head. ` +
      `${Math.round(fs.statSync(out).size / 1024)} KB written to ${path.relative(process.cwd(), out)}`,
  );
}

main();
