import { bankDrill, isBankWorn, pickBankItems, WORN_AFTER, type BankUse } from './bank';
import type { BankItem } from './types';

const bankItem = (key: string): BankItem => ({
  key,
  sentence: `Satz ${key} ___.`,
  hint: 'h',
  answer: 'a',
  accepted: [],
  translation: 't',
  explanation: 'e',
  category: 'article',
});

const bank = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(bankItem);
const keys = (items: BankItem[]) => items.map((i) => i.key).sort();

describe('drawing from a bank', () => {
  it('takes the items asked least, then longest ago', () => {
    const uses = new Map<string, BankUse>([
      ['a', { count: 2, last: 50 }],
      ['b', { count: 1, last: 10 }],
      ['c', { count: 1, last: 40 }],
      ['d', { count: 1, last: 20 }],
      ['e', { count: 1, last: 30 }],
    ]);
    // f and g were never asked, then b, d, e by how long ago.
    expect(keys(pickBankItems(bank, uses, 5))).toEqual(['b', 'd', 'e', 'f', 'g']);
  });

  it('never asks more items than the bank has', () => {
    expect(pickBankItems(bank, new Map(), 20)).toHaveLength(bank.length);
  });

  it('mixes the order of the items it picks', () => {
    const orders = new Set(
      [1, 2, 3, 4, 5].map((seed) => {
        let s = seed;
        const random = () => {
          s = (s * 16807) % 2147483647;
          return s / 2147483647;
        };
        return pickBankItems(bank, new Map(), 5, random)
          .map((i) => i.key)
          .join('');
      }),
    );
    expect(orders.size).toBeGreaterThan(1);
  });

  it('builds a drill that names its topic and the items it asks', () => {
    const drill = bankDrill({ id: 'genus', name: 'der, die, das', drills: bank }, new Map(), 3);
    expect(drill.point).toBe('der, die, das');
    expect(drill.items).toHaveLength(3);
    expect(drill.items[0]).not.toHaveProperty('key');
    expect(drill.bank).toEqual({ topic: 'genus', keys: expect.any(Array) });
    expect(drill.bank!.keys.map((k) => `Satz ${k} ___.`)).toEqual(
      drill.items.map((i) => i.sentence),
    );
  });

  it('is worn once every item came up often enough', () => {
    const uses = new Map(bank.map((i) => [i.key, { count: WORN_AFTER, last: 1 }]));
    expect(isBankWorn(bank, uses)).toBe(true);
    uses.set('c', { count: WORN_AFTER - 1, last: 1 });
    expect(isBankWorn(bank, uses)).toBe(false);
  });
});
