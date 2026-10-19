/// <reference types="node" />
import { createItem } from '@/data/repos/items';
import { setSetting } from '@/data/repos/settings';
import { recentUsage } from '@/data/repos/usage';
import { itemInput } from '@/data/testing/fixtures';
import { createTestDb } from '@/data/testing/test-db';
import { createMemoryKeyStore } from '@/llm/key-store';
import { completion, createFakeFetch } from '@/llm/testing/fake-fetch';
import { enrichWords } from '@/llm/tasks/enrich-words';

import type { Services } from '../services';
import { draftToItemInput, enrichOne, enrichText, refreshDraft } from './enrich';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { startMockLlmServer } = require('../../../scripts/mock-llm-server.js') as {
  startMockLlmServer: (o: { port: number; host: string }) => Promise<{
    url: string;
    requests: { messages: { content: string }[] }[];
    close: () => Promise<void>;
  }>;
};

let server: Awaited<ReturnType<typeof startMockLlmServer>>;
beforeAll(async () => {
  server = await startMockLlmServer({ port: 0, host: '127.0.0.1' });
});
afterAll(() => server.close());

async function services(overrides: Partial<Services> = {}): Promise<Services> {
  const db = await createTestDb();
  setSetting(db, 'llm.provider', 'custom');
  setSetting(db, 'llm.customBaseUrl', `${server.url}/v1`);
  setSetting(db, 'llm.model', 'mock-mini');
  return {
    db,
    keyStore: createMemoryKeyStore({ custom: 'test-key' }),
    now: () => new Date(2026, 9, 19, 9),
    ...overrides,
  };
}

describe('adding one word', () => {
  it('turns an inflected form into a full entry', async () => {
    const s = await services();
    const draft = await enrichOne(s, 'zog um');
    expect(draft.status).toBe('ok');
    expect(draft.fields).toMatchObject({
      kind: 'verb',
      lemma: 'umziehen',
      verbPresent3: 'zieht um',
      verbPreterite: 'zog um',
      verbParticiple: 'umgezogen',
      verbAuxiliary: 'sein',
      separable: true,
    });
    expect(draft.fields.exampleDe).toBeTruthy();
    expect(recentUsage(s.db)[0].calls).toBe(1);
  });

  it('flags a gender the Wiktionary list disagrees with', async () => {
    const draft = await enrichOne(await services(), 'Garten');
    expect(draft.fields.article).toBe('die');
    expect(draft.flags).toContainEqual(
      expect.objectContaining({
        field: 'article',
        tone: 'warning',
        message: expect.stringContaining('der'),
      }),
    );
  });

  it('flags a word already in the deck', async () => {
    const s = await services();
    const id = createItem(s.db, itemInput(), Date.now());
    const draft = await enrichOne(s, 'Wohnung');
    expect(draft.duplicateOf).toEqual({ id, lemma: 'die Wohnung' });
    expect(draft.include).toBe(false);
  });

  it('re-checks a draft after a manual edit', async () => {
    const s = await services();
    const draft = await enrichOne(s, 'Garten');
    const fixed = refreshDraft(s.db, draft, { ...draft.fields, article: 'der' });
    expect(fixed.flags.filter((f) => f.field === 'article' && f.tone === 'warning')).toEqual([]);
    expect(draftToItemInput(fixed.fields, { chapterId: null })).toMatchObject({
      lemma: 'Garten',
      article: 'der',
      source: 'user',
    });
  });
});

describe('pasting a list', () => {
  const list = `Kapitel 1: Wohnen
die Wohnung, -en – flat
der Bahnhof, ¨-e
das Zimmer, -
die Eltern (Pl.)
umziehen, zog um, ist umgezogen
sich freuen auf
die Küche, -n
die Wohnung`;

  it('reviews every line with flags, sending only real entries to the LLM', async () => {
    const before = server.requests.length;
    const s = await services();
    const progress: number[] = [];
    const drafts = await enrichText(s, list, { onProgress: (p) => progress.push(p.done) });

    expect(server.requests.length - before).toBe(1); // one batch for 8 lines
    expect(progress).toEqual([0, 8]);
    expect(drafts.map((d) => [d.fields.lemma, d.include])).toEqual([
      ['Kapitel 1: Wohnen', false],
      ['Wohnung', true],
      ['Bahnhof', true],
      ['Zimmer', true],
      ['Eltern', true],
      ['umziehen', true],
      ['sich freuen auf', true],
      ['Küche', true],
      ['Wohnung', false],
    ]);
    expect(drafts[0].status).toBe('unclear');
    expect(drafts[1].fields.meanings[0]).toBe('flat');
    expect(drafts[4].fields).toMatchObject({ article: null, plural: 'Eltern' });
    expect(drafts[8].flags).toContainEqual(
      expect.objectContaining({ message: 'Same word as line 2.' }),
    );
  });

  it('splits long lists into batches of 25', async () => {
    const before = server.requests.length;
    const lines = Array.from({ length: 30 }, (_, i) => `der Testbegriff${i}`).join('\n');
    const drafts = await enrichText(await services(), lines);
    expect(drafts).toHaveLength(30);
    expect(server.requests.length - before).toBe(2);
  });

  it('keeps going when one batch returns junk, and stops on a fatal error', async () => {
    const junk = createFakeFetch([completion('not json'), completion('still not json')]);
    const s = await services({ fetch: junk.fetch });
    setSetting(s.db, 'llm.customBaseUrl', 'http://unused.test/v1');
    const drafts = await enrichText(s, 'der Hund\ndie Katze');
    expect(drafts.map((d) => d.status)).toEqual(['failed', 'failed']);
    expect(drafts[0].fields).toMatchObject({ kind: 'noun', article: 'der', lemma: 'Hund' });

    const broke = await services();
    setSetting(broke.db, 'llm.monthlyCap', 0);
    await expect(enrichText(broke, 'der Hund')).rejects.toMatchObject({ kind: 'budget' });
  });
});

describe('enrich_words task checks', () => {
  const input = {
    lines: [
      { id: 0, text: 'x' },
      { id: 1, text: 'y' },
    ],
  };
  const record = (id: number, extra = {}) => ({
    id,
    status: 'ok' as const,
    kind: 'noun' as const,
    lemma: 'Haus',
    article: 'das' as const,
    plural: 'Häuser',
    verb: null,
    separable: false,
    reflexive: false,
    case: null,
    meanings: ['house'],
    example_de: 'Das Haus.',
    example_en: 'The house.',
    low_confidence: [],
    ...extra,
  });

  it('requires one record per line', () => {
    expect(enrichWords.check!({ items: [record(0)] }, input)).toMatch(/missing records for ids 1/);
    expect(enrichWords.check!({ items: [record(0), record(1), record(2)] }, input)).toMatch(
      /unexpected/,
    );
    expect(enrichWords.check!({ items: [record(0), record(1)] }, input)).toBeNull();
  });

  it('requires the basics for clear lines only', () => {
    expect(enrichWords.check!({ items: [record(0, { meanings: [] }), record(1)] }, input)).toMatch(
      /meanings/,
    );
    expect(
      enrichWords.check!({ items: [record(0, { article: null, plural: null }), record(1)] }, input),
    ).toMatch(/article/);
    expect(enrichWords.check!({ items: [record(0, { kind: 'verb' }), record(1)] }, input)).toMatch(
      /verb forms/,
    );
    expect(
      enrichWords.check!(
        { items: [record(0, { status: 'unclear', lemma: '', meanings: [] }), record(1)] },
        input,
      ),
    ).toBeNull();
  });

  it('sizes the output budget to the batch', () => {
    const maxTokens = enrichWords.maxTokens as (i: typeof input) => number;
    expect(maxTokens({ lines: Array(25).fill({ id: 0, text: '' }) })).toBeGreaterThan(5000);
  });
});
