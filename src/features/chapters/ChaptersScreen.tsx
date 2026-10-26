import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { parseChapterList } from '@/core/chapters';
import { plural } from '@/core/format';
import { coverageShare, type StateCounts } from '@/core/stats';
import {
  chapterLabel,
  createChapter,
  parseThemes,
  saveChapterList,
  updateChapter,
} from '@/data/repos/chapters';
import { getSetting, setSetting } from '@/data/repos/settings';
import { chapterStats } from '@/data/repos/stats';
import type { ChapterRow } from '@/data/schema';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { ListItem } from '@/ui/controls';
import { Banner, Row, Screen, Section } from '@/ui/layout';
import { ProgressBar } from '@/ui/motion';
import { TextField } from '@/ui/TextField';
import { useTheme } from '@/ui/theme';
import { GermanField, UmlautBar } from '@/ui/umlaut';

import { useServices } from '../services';
import { useLiveQuery } from '../use-live-query';

/**
 * Enter the Momente A2 chapter list once, by pasting the contents page or
 * one chapter at a time, and pick the chapter class is on. Each row shows
 * how much of the chapter is learned and opens its word list.
 */
export function ChaptersScreen() {
  const { db } = useServices();
  const theme = useTheme();
  const chapters = useLiveQuery(() => chapterStats(db), ['chapter', 'item', 'card']);
  const current = useLiveQuery(() => getSetting(db, 'study.currentChapterId'), ['settings']);
  const [mode, setMode] = useState<'new' | 'paste' | null>(chapters.length ? null : 'new');

  return (
    <Screen testID="chapters-screen" footer={<UmlautBar />}>
      {mode === 'new' ? (
        <ChapterForm
          initial={null}
          nextNumber={Math.max(0, ...chapters.map((c) => c.chapter.number)) + 1}
          onCancel={() => setMode(null)}
          onPaste={() => setMode('paste')}
          onSaved={(id, makeCurrent) => {
            if (makeCurrent) setSetting(db, 'study.currentChapterId', id);
            setMode(null);
          }}
        />
      ) : mode === 'paste' ? (
        <PasteChapters
          book={chapters[0]?.chapter.book ?? 'Momente A2'}
          onDone={() => setMode(null)}
        />
      ) : (
        <>
          <Row style={{ flexWrap: 'nowrap' }}>
            <Button
              testID="chapter-add"
              label="Add a chapter"
              style={{ flex: 1 }}
              onPress={() => setMode('new')}
            />
            <Button
              testID="chapter-paste"
              label="Paste the list"
              icon="clipboard-outline"
              variant="secondary"
              style={{ flex: 1 }}
              onPress={() => setMode('paste')}
            />
          </Row>
          {chapters.length ? (
            <Button
              testID="chapters-cram"
              label="Cram for an exam"
              icon="alarm-outline"
              variant="secondary"
              onPress={() => router.push('/cram')}
            />
          ) : null}
        </>
      )}
      <Section title="Chapters">
        {chapters.length === 0 ? (
          <AppText variant="caption">No chapters yet. Add the one your class is on.</AppText>
        ) : null}
        {chapters.map(({ chapter: c, counts }) => (
          <ListItem
            key={c.id}
            testID={`chapter-row-${c.id}`}
            title={`${chapterLabel(c)}${current === c.id ? '  · current' : ''}`}
            subtitle={
              <View style={{ gap: 6 }}>
                <AppText variant="caption">
                  {[c.themes.join(', '), coverageLine(counts)].filter(Boolean).join(' · ')}
                </AppText>
                {counts.total ? (
                  <ProgressBar
                    value={coverageShare(counts)}
                    color={theme.xp}
                    track={theme.track}
                    height={6}
                  />
                ) : null}
              </View>
            }
            onPress={() => router.push({ pathname: '/chapter/[id]', params: { id: String(c.id) } })}
            right={
              current === c.id ? null : (
                <Button
                  testID={`chapter-current-${c.id}`}
                  label="Set current"
                  variant="ghost"
                  onPress={() => setSetting(db, 'study.currentChapterId', c.id)}
                />
              )
            }
          />
        ))}
      </Section>
    </Screen>
  );
}

/** "40% mature · 12 of 30 items", or that the chapter has no words yet. */
export function coverageLine(counts: StateCounts): string {
  const active = counts.total - counts.suspended;
  if (!active) return 'no words yet';
  return `${Math.round(coverageShare(counts) * 100)}% mature · ${counts.mature} of ${plural(active, 'item')}`;
}

/** Paste the book's contents page: one chapter per line, with its themes. */
function PasteChapters({ book: initialBook, onDone }: { book: string; onDone: () => void }) {
  const { db } = useServices();
  const [text, setText] = useState('');
  const [book, setBook] = useState(initialBook);
  const parsed = parseChapterList(text);
  const count = parsed.chapters.length;

  return (
    <Section title="Paste the chapter list" testID="chapter-paste-form">
      <AppText variant="caption">
        One chapter per line: a number, the title, then its themes after a colon or in brackets.
      </AppText>
      <GermanField
        testID="chapter-paste-text"
        label="Chapters"
        multiline
        placeholder={'1 Zu Hause: Wohnen, Umzug\n2 Essen und Trinken: Restaurant, Einkaufen'}
        value={text}
        onChangeText={setText}
        style={{ minHeight: 140, textAlignVertical: 'top' }}
      />
      <GermanField testID="chapter-paste-book" label="Book" value={book} onChangeText={setBook} />
      {count ? (
        <AppText variant="caption" testID="chapter-paste-preview">
          {parsed.chapters.map((c) => chapterLabel(c)).join(' · ')}
        </AppText>
      ) : null}
      {parsed.skipped.length ? (
        <Banner tone="warning" testID="chapter-paste-skipped">
          <AppText color="warningText">
            {parsed.skipped.length === 1 ? 'This line has' : 'These lines have'} no chapter number:{' '}
            {parsed.skipped.join(' · ')}
          </AppText>
        </Banner>
      ) : null}
      <Row>
        <Button
          testID="chapter-paste-save"
          label={count ? `Save ${plural(count, 'chapter')}` : 'Save'}
          disabled={!count}
          onPress={() => {
            saveChapterList(db, parsed.chapters, book);
            onDone();
          }}
        />
        <Button label="Cancel" variant="ghost" onPress={onDone} />
      </Row>
    </Section>
  );
}

export function ChapterForm({
  initial,
  nextNumber,
  onSaved,
  onCancel,
  onDelete,
  onPaste,
}: {
  initial: ChapterRow | null;
  nextNumber: number;
  onSaved: (id: number, makeCurrent: boolean) => void;
  onCancel: () => void;
  onDelete?: () => void;
  /** Switch to pasting the whole list instead. */
  onPaste?: () => void;
}) {
  const { db } = useServices();
  const [number, setNumber] = useState(String(initial?.number ?? nextNumber));
  const [title, setTitle] = useState(initial?.title ?? '');
  const [themes, setThemes] = useState(initial?.themes.join(', ') ?? '');
  const [book, setBook] = useState(initial?.book ?? 'Momente A2');
  const [error, setError] = useState<string | null>(null);

  const save = (makeCurrent: boolean) => {
    const n = Number(number.trim());
    if (!Number.isInteger(n) || n < 0)
      return setError('The chapter number must be a whole number.');
    if (!title.trim()) return setError('Enter a title.');
    const input = { book, number: n, title, themes: parseThemes(themes) };
    try {
      if (initial) {
        updateChapter(db, initial.id, input);
        onSaved(initial.id, makeCurrent);
      } else {
        onSaved(createChapter(db, input), makeCurrent);
      }
    } catch {
      setError(`${book} already has a chapter ${n}.`);
    }
  };

  return (
    <Section title={initial ? 'Edit chapter' : 'New chapter'} testID="chapter-form">
      <TextField
        testID="chapter-number"
        label="Number"
        keyboardType="number-pad"
        value={number}
        onChangeText={setNumber}
      />
      <GermanField
        testID="chapter-title"
        label="Title"
        placeholder="Zu Hause"
        value={title}
        onChangeText={setTitle}
      />
      <GermanField
        testID="chapter-themes"
        label="Themes"
        placeholder="Wohnen, Umzug, Nachbarn"
        value={themes}
        onChangeText={setThemes}
        helper="Separated by commas. They steer topics for generated content."
      />
      <GermanField testID="chapter-book" label="Book" value={book} onChangeText={setBook} />
      {error ? <Banner tone="error">{error}</Banner> : null}
      <Row>
        <Button testID="chapter-save-current" label="Save as current" onPress={() => save(true)} />
        <Button
          testID="chapter-save"
          label="Save"
          variant="secondary"
          onPress={() => save(false)}
        />
        <Button label="Cancel" variant="ghost" onPress={onCancel} />
      </Row>
      {onPaste ? (
        <Button
          testID="chapter-form-paste"
          label="Paste the whole list instead"
          icon="clipboard-outline"
          variant="ghost"
          onPress={onPaste}
        />
      ) : null}
      {onDelete ? (
        <View>
          <Button
            testID="chapter-delete"
            label="Delete chapter"
            variant="danger"
            onPress={onDelete}
          />
        </View>
      ) : null}
    </Section>
  );
}
