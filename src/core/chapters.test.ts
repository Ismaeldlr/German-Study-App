import { parseChapterList } from './chapters';

describe('parsing a chapter list', () => {
  it('reads a number, a title and themes in the usual shapes', () => {
    const { chapters, skipped } = parseChapterList(
      [
        '1 Zu Hause: Wohnen, Umzug, Nachbarn',
        'Kapitel 2 – Essen und Trinken (Restaurant; Einkaufen)',
        '3. Arbeit - Beruf, Bewerbung',
        'Lektion 4) Freizeit',
        '',
        '  5:   Gesundheit  ',
      ].join('\n'),
    );
    expect(chapters).toEqual([
      { number: 1, title: 'Zu Hause', themes: ['Wohnen', 'Umzug', 'Nachbarn'] },
      { number: 2, title: 'Essen und Trinken', themes: ['Restaurant', 'Einkaufen'] },
      { number: 3, title: 'Arbeit', themes: ['Beruf', 'Bewerbung'] },
      { number: 4, title: 'Freizeit', themes: [] },
      { number: 5, title: 'Gesundheit', themes: [] },
    ]);
    expect(skipped).toEqual([]);
  });

  it('keeps hyphenated titles whole', () => {
    expect(parseChapterList('6 E-Mails und Briefe').chapters[0].title).toBe('E-Mails und Briefe');
  });

  it('sorts by number, keeps the last of a repeated number and lists lines it skipped', () => {
    const { chapters, skipped } = parseChapterList(
      'Inhalt\r\n3 Reisen\r\n1 Alt\r\n1 Neu: Familie\r\nSeite 12',
    );
    expect(chapters.map((c) => `${c.number} ${c.title}`)).toEqual(['1 Neu', '3 Reisen']);
    expect(skipped).toEqual(['Inhalt', 'Seite 12']);
  });
});
