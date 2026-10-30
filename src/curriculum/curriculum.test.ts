import { normalizeAnswer } from '@/core/answers';
import { drillProblem, gradeDrillItem } from '@/core/drills';
import { BLANK, fillGap } from '@/core/gap-fill';
import { MISTAKE_CATEGORIES } from '@/core/model';

import {
  BLOCKS,
  BOOKS,
  bookName,
  chapterLines,
  getLesson,
  getTopic,
  lessonForChapter,
  lessonTopics,
  nextLesson,
  searchTopics,
  topicsInBlock,
  TOPICS,
} from './index';
import { BLOCK_IDS, BOOK_IDS } from './types';

/** Every topic needs enough items for a few drills before any item repeats. */
const MIN_BANK = 12;
const ENDS_A_SENTENCE = /[.!?…"“”)]$/;
/** A hint that only lists the choices: "weil / denn". */
const CHOICES = /^[^()…]+( \/ [^()…]+)+$/;

describe('the Momente syllabus', () => {
  it('has six part volumes of twelve lessons, numbered as in the books', () => {
    expect(BOOKS.map((b) => b.id)).toEqual([...BOOK_IDS]);
    for (const book of BOOKS) {
      const first = book.id.endsWith('.1') ? 1 : 13;
      expect(book.lessons.map((l) => l.number)).toEqual(
        Array.from({ length: 12 }, (_, i) => first + i),
      );
      for (const lesson of book.lessons) {
        expect(lesson.book).toBe(book.id);
        expect(lesson.title.trim()).not.toBe('');
        expect(lesson.themes.length).toBeGreaterThan(0);
        expect(lesson.grammar.length).toBeGreaterThan(0);
      }
    }
  });

  it('teaches every lesson’s grammar with at least one topic', () => {
    const bare = BOOKS.flatMap((b) => b.lessons).filter((l) => lessonTopics(l).length === 0);
    expect(bare.map((l) => `${l.book}/${l.number}`)).toEqual([]);
  });

  it('turns a level into chapters and finds the lesson behind a chapter', () => {
    const lines = chapterLines('A2');
    expect(lines).toHaveLength(24);
    expect(lines[5]).toEqual({
      number: 6,
      title: 'Du solltest mehr trainieren.',
      themes: ['Sport und Fitness', 'Sportarten'],
    });
    expect(lessonForChapter({ book: bookName('A2'), number: 6 })?.book).toBe('A2.1');
    expect(lessonForChapter({ book: 'momente a2', number: 13 })?.book).toBe('A2.2');
    expect(lessonForChapter({ book: 'Menschen A2', number: 6 })).toBeUndefined();
  });

  it('walks the path from one lesson to the next, across volumes', () => {
    expect(nextLesson({ book: 'A1.1', number: 12 })).toMatchObject({ book: 'A1.2', number: 13 });
    expect(nextLesson({ book: 'A1.2', number: 24 })).toMatchObject({ book: 'A2.1', number: 1 });
    expect(nextLesson({ book: 'B1.2', number: 24 })).toBeUndefined();
  });
});

describe('the topics', () => {
  it('have unique, stable ids', () => {
    const ids = TOPICS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it('fill every block', () => {
    for (const block of BLOCK_IDS) expect(topicsInBlock(block).length).toBeGreaterThan(0);
    expect(BLOCKS.map((b) => b.id)).toEqual([...BLOCK_IDS]);
  });

  it.each(TOPICS.map((t) => [t.id, t] as const))('%s is complete and well formed', (_, topic) => {
    expect(topic.name.trim()).not.toBe('');
    expect(topic.label.trim()).not.toBe('');
    expect(topic.summary.trim()).not.toBe('');
    expect(BLOCK_IDS).toContain(topic.block);
    for (const ref of topic.lessons) expect(getLesson(ref)).toBeDefined();
    expect(topic.categories.length).toBeGreaterThan(0);
    for (const c of topic.categories) expect(MISTAKE_CATEGORIES).toContain(c);

    expect(topic.sections.length).toBeGreaterThan(0);
    for (const section of topic.sections) {
      expect(section.title.trim()).not.toBe('');
      const widths = new Set((section.table ?? []).map((row) => row.length));
      expect(widths.size).toBeLessThanOrEqual(1);
    }
    expect(topic.examples.length).toBeGreaterThanOrEqual(3);
    for (const e of topic.examples) {
      expect(e.de).toMatch(ENDS_A_SENTENCE);
      expect(e.en.trim()).not.toBe('');
    }

    expect(drillProblem(topic.drills, MIN_BANK)).toBeNull();
    expect(new Set(topic.drills.map((d) => d.key)).size).toBe(topic.drills.length);
    for (const item of topic.drills) {
      const where = `${topic.id}: ${item.sentence}`;
      expect([where, item.sentence]).toEqual([where, item.sentence.replace(/\s+/g, ' ').trim()]);
      expect([where, ENDS_A_SENTENCE.test(item.sentence)]).toEqual([where, true]);
      expect([where, item.answer.includes(BLANK)]).toEqual([where, false]);
      expect([where, item.hint.trim() !== '']).toEqual([where, true]);
      expect([where, item.translation.trim() !== '']).toEqual([where, true]);
      expect([where, ENDS_A_SENTENCE.test(item.explanation)]).toEqual([where, true]);
      expect([where, MISTAKE_CATEGORIES.includes(item.category)]).toEqual([where, true]);
      expect([where, fillGap(item).includes('  ')]).toEqual([where, false]);
      const choices = item.hint.split(' / ').map((c) => normalizeAnswer(c).toLowerCase());
      // Choosing between verbs ("haben / sein") means conjugating the one you pick.
      const verbs = choices.every((c) => c === 'sein' || c.endsWith('en') || c.endsWith('ern'));
      if (CHOICES.test(item.hint) && !verbs) {
        // The answer is one of the choices, or a form of one: "sein / ihr" → ihren.
        const answers = [item.answer, ...item.accepted].map((a) =>
          normalizeAnswer(a).toLowerCase(),
        );
        const fits = answers.some((a) => choices.some((c) => a.startsWith(c)));
        expect([where, fits]).toEqual([where, true]);
      }
      // The answer as written is right, and so is every accepted one.
      expect([where, gradeDrillItem(item, item.answer).outcome]).toEqual([where, 'correct']);
      for (const ok of item.accepted) {
        expect([where, gradeDrillItem(item, ok).outcome]).toEqual([where, 'correct']);
      }
    }
  });

  it('treat a missing umlaut as wrong only where the umlaut is the grammar', () => {
    const plural = getTopic('plural')!.drills.find((d) => d.answer === 'Äpfel')!;
    expect(gradeDrillItem(plural, 'Apfel').outcome).toBe('wrong');
    const genus = getTopic('genus')!.drills[0];
    expect(genus.strictUmlauts).toBeUndefined();
  });
});

describe('searching topics', () => {
  const ids = (query: string) => searchTopics(query).map((t) => t.id);

  it('finds a topic by its German name, English label or keywords', () => {
    expect(ids('der die das')).toContain('genus');
    expect(ids('plural')[0]).toBe('plural');
    expect(ids('reflexive')).toContain('reflexive-verben');
  });

  it('ignores umlauts, case and punctuation', () => {
    expect(ids('PRASENS')).toContain('praesens');
    expect(ids('worauf darauf')).toContain('wo-da-woerter');
  });

  it('returns everything for an empty query', () => {
    expect(searchTopics('  ')).toHaveLength(TOPICS.length);
  });
});
