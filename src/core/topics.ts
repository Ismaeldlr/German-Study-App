/**
 * Topics for generated content: about 70% from the current chapter's
 * themes and 30% from your interests, never the same topic twice in a row.
 */

export const CHAPTER_SHARE = 0.7;
export const FALLBACK_TOPIC = 'Alltag';

export interface TopicSources {
  chapterThemes: readonly string[];
  interests: readonly string[];
}

export function createTopicPicker(
  sources: TopicSources,
  random: () => number = Math.random,
  last: string | null = null,
): () => string {
  const clean = (list: readonly string[]) => [
    ...new Set(list.map((t) => t.trim()).filter(Boolean)),
  ];
  const chapter = clean(sources.chapterThemes);
  const interests = clean(sources.interests);
  let previous = last;

  return () => {
    const preferChapter = random() < CHAPTER_SHARE;
    const pools = preferChapter ? [chapter, interests] : [interests, chapter];
    let topic: string | undefined;
    for (const pool of pools) {
      const options = pool.filter((t) => t !== previous);
      if (options.length) {
        topic = options[Math.floor(random() * options.length)];
        break;
      }
    }
    topic ??= previous ?? FALLBACK_TOPIC;
    previous = topic;
    return topic;
  };
}
