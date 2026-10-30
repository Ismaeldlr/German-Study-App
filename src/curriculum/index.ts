import { stripUmlauts } from '@/core/answers';
import type { ChapterLine } from '@/core/chapters';
import { sentenceHash } from '@/core/gap-fill';

import { BLOCKS } from './blocks';
import { BOOKS } from './momente';
import { TOPIC_SOURCES } from './topics';
import type {
  Block,
  BlockId,
  Book,
  BookId,
  Lesson,
  LessonRef,
  Level,
  Topic,
  TopicSource,
} from './types';

export * from './types';
export { BLOCKS, BOOKS };

/** Saved with each built-in drill, like a prompt version: which edition of the banks it came from. */
export const CURRICULUM_VERSION = 'builtin-1';

export function compileTopic(source: TopicSource): Topic {
  const { examples, drills, ...rest } = source;
  return {
    ...rest,
    examples: examples.map(([de, en]) => ({ de, en })),
    drills: drills.map((d) => ({
      key: sentenceHash(d.s),
      sentence: d.s,
      hint: d.h,
      answer: d.a,
      accepted: d.ok ?? [],
      translation: d.en,
      explanation: d.why,
      category: d.cat ?? source.categories[0],
      ...(source.strictUmlauts ? { strictUmlauts: true } : {}),
    })),
  };
}

export const TOPICS: readonly Topic[] = TOPIC_SOURCES.map(compileTopic);

const topicById = new Map(TOPICS.map((t) => [t.id, t]));
const blockById = new Map(BLOCKS.map((b) => [b.id, b]));

export function getTopic(id: string): Topic | undefined {
  return topicById.get(id);
}

export function getBlock(id: BlockId): Block {
  return blockById.get(id)!;
}

export function topicsInBlock(block: BlockId, topics: readonly Topic[] = TOPICS): Topic[] {
  return topics.filter((t) => t.block === block);
}

export function lessonRef(book: BookId, number: number): LessonRef {
  return `${book}/${number}`;
}

export function getLesson(ref: string): Lesson | undefined {
  const [book, number] = ref.split('/');
  return BOOKS.find((b) => b.id === book)?.lessons.find((l) => l.number === Number(number));
}

export function getBook(id: BookId): Book {
  return BOOKS.find((b) => b.id === id)!;
}

export function bookOf(lesson: Pick<Lesson, 'book'>): Book {
  return getBook(lesson.book);
}

/** The topics a lesson teaches, in path order. */
export function lessonTopics(lesson: Pick<Lesson, 'book' | 'number'>): Topic[] {
  const ref = lessonRef(lesson.book, lesson.number);
  return TOPICS.filter((t) => t.lessons.includes(ref));
}

/** Where Momente first teaches a topic, or undefined for one it only uses. */
export function firstLesson(topic: Pick<Topic, 'lessons'>): Lesson | undefined {
  return topic.lessons.map(getLesson).find((l) => l !== undefined);
}

/** "A2.1 · Lektion 6" */
export function lessonLabel(lesson: Pick<Lesson, 'book' | 'number'>): string {
  return `${lesson.book} · Lektion ${lesson.number}`;
}

/** Every lesson of a level, in book order. */
export function lessonsOf(level: Level): Lesson[] {
  return BOOKS.filter((b) => b.level === level).flatMap((b) => b.lessons);
}

/** The chapter name the full volume of a level goes by, as in the chapter list. */
export function bookName(level: Level): string {
  return `Momente ${level}`;
}

/** A level's lessons as chapters, to fill the chapter list in one go. */
export function chapterLines(level: Level): ChapterLine[] {
  return lessonsOf(level).map((l) => ({ number: l.number, title: l.title, themes: l.themes }));
}

/** The Momente lesson a chapter in your list stands for, if it is one. */
export function lessonForChapter(chapter: { book: string; number: number }): Lesson | undefined {
  const level = (['A1', 'A2', 'B1'] as const).find(
    (l) => searchKey(chapter.book) === searchKey(bookName(l)),
  );
  return level ? lessonsOf(level).find((l) => l.number === chapter.number) : undefined;
}

/** The lesson after this one on the path, across volumes and levels. */
export function nextLesson(lesson: Pick<Lesson, 'book' | 'number'>): Lesson | undefined {
  const all = BOOKS.flatMap((b) => b.lessons);
  const index = all.findIndex((l) => l.book === lesson.book && l.number === lesson.number);
  return index >= 0 ? all[index + 1] : undefined;
}

/**
 * Topics matching every word of the query in their name, English label,
 * keywords, block or the lesson grammar they cover. Umlauts and case do not
 * matter, so "um zu" finds um … zu and "konjunktiv 2" finds Konjunktiv II.
 */
export function searchTopics(query: string, topics: readonly Topic[] = TOPICS): Topic[] {
  const words = searchKey(query.replace(/\b2\b/g, 'ii').replace(/\b1\b/g, 'i'))
    .split(' ')
    .filter(Boolean);
  if (words.length === 0) return [...topics];
  const scored = topics.flatMap((topic) => {
    const name = searchKey(topic.name);
    const haystack = searchKey(
      [
        topic.name,
        topic.label,
        ...(topic.keywords ?? []),
        getBlock(topic.block).name,
        getBlock(topic.block).label,
        topic.level,
      ].join(' '),
    );
    if (!words.every((w) => haystack.includes(w))) return [];
    const score = words.filter((w) => name.includes(w)).length;
    return [{ topic, score }];
  });
  return scored.sort((a, b) => b.score - a.score).map((s) => s.topic);
}

/** Lowercase, umlauts and their ae / oe / ue spellings alike, words only. */
function searchKey(text: string): string {
  return stripUmlauts(text.toLowerCase())
    .replace(/ae/g, 'a')
    .replace(/oe/g, 'o')
    .replace(/ue/g, 'u')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
