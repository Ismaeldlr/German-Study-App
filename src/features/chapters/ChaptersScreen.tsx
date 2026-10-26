import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import {
  chapterLabel,
  createChapter,
  deleteChapter,
  listChapters,
  parseThemes,
  updateChapter,
} from '@/data/repos/chapters';
import { getSetting, setSetting } from '@/data/repos/settings';
import type { ChapterRow } from '@/data/schema';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { ListItem } from '@/ui/controls';
import { Banner, Row, Screen, Section } from '@/ui/layout';
import { TextField } from '@/ui/TextField';
import { GermanField, UmlautBar } from '@/ui/umlaut';

import { useServices } from '../services';
import { useLiveQuery } from '../use-live-query';

/** Enter the Momente A2 chapter list once; pick the chapter class is on. */
export function ChaptersScreen() {
  const { db } = useServices();
  const chapters = useLiveQuery(() => listChapters(db), ['chapter']);
  const current = useLiveQuery(() => getSetting(db, 'study.currentChapterId'), ['settings']);
  const [editing, setEditing] = useState<ChapterRow | 'new' | null>(chapters.length ? null : 'new');

  const remove = (row: ChapterRow) =>
    Alert.alert(
      `Delete chapter ${chapterLabel(row)}?`,
      'Its words stay in your deck without a chapter.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            if (current === row.id) setSetting(db, 'study.currentChapterId', null);
            deleteChapter(db, row.id);
            setEditing(null);
          },
        },
      ],
    );

  return (
    <Screen testID="chapters-screen" footer={<UmlautBar />}>
      {editing ? (
        <ChapterForm
          key={editing === 'new' ? 'new' : editing.id}
          initial={editing === 'new' ? null : editing}
          nextNumber={Math.max(0, ...chapters.map((c) => c.number)) + 1}
          onCancel={() => setEditing(null)}
          onDelete={editing === 'new' ? undefined : () => remove(editing)}
          onSaved={(id, makeCurrent) => {
            if (makeCurrent) setSetting(db, 'study.currentChapterId', id);
            setEditing(null);
          }}
        />
      ) : (
        <Row style={{ flexWrap: 'nowrap' }}>
          <Button
            testID="chapter-add"
            label="Add a chapter"
            style={{ flex: 1 }}
            onPress={() => setEditing('new')}
          />
          {chapters.length ? (
            <Button
              testID="chapters-cram"
              label="Cram for an exam"
              icon="alarm-outline"
              variant="secondary"
              style={{ flex: 1 }}
              onPress={() => router.push('/cram')}
            />
          ) : null}
        </Row>
      )}
      <Section title="Chapters">
        {chapters.length === 0 ? (
          <AppText variant="caption">No chapters yet. Add the one your class is on.</AppText>
        ) : null}
        {chapters.map((c) => (
          <ListItem
            key={c.id}
            testID={`chapter-row-${c.id}`}
            title={`${chapterLabel(c)}${current === c.id ? '  · current' : ''}`}
            subtitle={[c.book, c.themes.join(', ')].filter(Boolean).join(' · ')}
            onPress={() => setEditing(c)}
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

function ChapterForm({
  initial,
  nextNumber,
  onSaved,
  onCancel,
  onDelete,
}: {
  initial: ChapterRow | null;
  nextNumber: number;
  onSaved: (id: number, makeCurrent: boolean) => void;
  onCancel: () => void;
  onDelete?: () => void;
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
