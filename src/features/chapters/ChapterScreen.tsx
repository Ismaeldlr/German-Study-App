import { router, Stack } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';

import type { ItemState } from '@/core/cards';
import { plural } from '@/core/format';
import { countStates } from '@/core/stats';
import { chapterLabel, deleteChapter, getChapter } from '@/data/repos/chapters';
import { getCramPlan } from '@/data/repos/cram';
import { listDeck } from '@/data/repos/items';
import { getSetting, setSetting } from '@/data/repos/settings';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { StackedBar } from '@/ui/charts';
import { Chip, ListItem, StatePill, stateColors } from '@/ui/controls';
import { Row, Screen, Section } from '@/ui/layout';
import { spacing, useTheme } from '@/ui/theme';
import { UmlautBar } from '@/ui/umlaut';
import { Lemma } from '@/ui/visuals';

import { useServices } from '../services';
import { useLiveQuery } from '../use-live-query';
import { ChapterForm, coverageLine } from './ChaptersScreen';

const STATES = ['mature', 'young', 'learning', 'new'] as const;
const FILTERS: { value: ItemState | null; label: string }[] = [
  { value: null, label: 'All' },
  { value: 'new', label: 'New' },
  { value: 'learning', label: 'Learning' },
  { value: 'young', label: 'Young' },
  { value: 'mature', label: 'Mature' },
  { value: 'suspended', label: 'Suspended' },
];

/** One chapter: how much of it you know, its words, and what to do next with it. */
export function ChapterScreen({ chapterId }: { chapterId: number }) {
  const { db } = useServices();
  const theme = useTheme();
  const chapter = useLiveQuery(() => getChapter(db, chapterId), ['chapter']);
  const rows = useLiveQuery(() => listDeck(db, { chapterId }), ['item', 'card']);
  const current = useLiveQuery(() => getSetting(db, 'study.currentChapterId'), ['settings']);
  const crammed = useLiveQuery(
    () => getCramPlan(db)?.chapterIds.includes(chapterId) ?? false,
    ['settings'],
  );
  const [filter, setFilter] = useState<ItemState | null>(null);
  const [editing, setEditing] = useState(false);

  if (!chapter) {
    return (
      <Screen testID="chapter-missing">
        <AppText>This chapter no longer exists.</AppText>
      </Screen>
    );
  }

  const counts = countStates(rows.map((r) => r.state));
  const shown = filter ? rows.filter((r) => r.state === filter) : rows;
  const remove = () =>
    Alert.alert(
      `Delete chapter ${chapterLabel(chapter)}?`,
      'Its words stay in your deck without a chapter.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            if (current === chapter.id) setSetting(db, 'study.currentChapterId', null);
            deleteChapter(db, chapter.id);
            router.back();
          },
        },
      ],
    );

  return (
    <Screen testID="chapter-screen" footer={editing ? <UmlautBar /> : null}>
      <Stack.Screen options={{ title: chapterLabel(chapter) }} />
      {editing ? (
        <ChapterForm
          initial={chapter}
          nextNumber={chapter.number}
          onCancel={() => setEditing(false)}
          onDelete={remove}
          onSaved={(id, makeCurrent) => {
            if (makeCurrent) setSetting(db, 'study.currentChapterId', id);
            setEditing(false);
          }}
        />
      ) : (
        <Section testID="chapter-summary">
          <View style={{ gap: 2 }}>
            <AppText variant="overline">{chapter.book}</AppText>
            <AppText variant="heading">{chapterLabel(chapter)}</AppText>
            {chapter.themes.length ? (
              <AppText variant="caption">{chapter.themes.join(', ')}</AppText>
            ) : null}
          </View>
          <StackedBar
            testID="chapter-coverage"
            track={theme.track}
            parts={STATES.map((key) => ({
              value: counts[key],
              color: stateColors(theme, key).dot,
            }))}
          />
          <AppText variant="label" testID="chapter-coverage-text">
            {coverageLine(counts)}
          </AppText>
          <Row>
            {current === chapter.id ? (
              <AppText variant="caption" testID="chapter-is-current">
                📍 Class is on this chapter
              </AppText>
            ) : (
              <Button
                testID="chapter-make-current"
                label="Set as current"
                variant="secondary"
                onPress={() => setSetting(db, 'study.currentChapterId', chapter.id)}
              />
            )}
            <Button
              testID="chapter-edit"
              label="Edit"
              icon="create-outline"
              variant="ghost"
              onPress={() => setEditing(true)}
            />
          </Row>
          <Button
            testID="chapter-cram"
            label={crammed ? 'Cram plan' : 'Cram for an exam'}
            icon="alarm-outline"
            variant="secondary"
            onPress={() => router.push('/cram')}
          />
        </Section>
      )}

      <Section
        title="Words"
        testID="chapter-words"
        right={
          <AppText variant="label" color="textMuted">
            {shown.length}
          </AppText>
        }
      >
        {rows.length ? (
          <>
            <ChipRow>
              {FILTERS.filter((f) => f.value === null || counts[f.value]).map((f) => (
                <Chip
                  key={f.label}
                  testID={`chapter-filter-${f.value ?? 'all'}`}
                  label={f.value ? `${f.label} ${counts[f.value]}` : f.label}
                  selected={filter === f.value}
                  onPress={() => setFilter(f.value)}
                />
              ))}
            </ChipRow>
            {shown.map((row) => (
              <ListItem
                key={row.item.id}
                testID={`chapter-word-${row.item.id}`}
                title={<Lemma item={row.item} variant="label" />}
                subtitle={row.item.meanings.slice(0, 2).join(', ')}
                right={<StatePill state={row.state} />}
                onPress={() =>
                  router.push({ pathname: '/item/[id]', params: { id: String(row.item.id) } })
                }
              />
            ))}
          </>
        ) : (
          <>
            <AppText>
              No words in this chapter yet.{' '}
              {current === chapter.id
                ? 'New words land here while it is the current chapter.'
                : 'Make it current and new words land here.'}
            </AppText>
            <Button
              label="Paste a list"
              icon="clipboard-outline"
              variant="secondary"
              onPress={() => router.push('/paste')}
            />
          </>
        )}
        {rows.length ? (
          <AppText variant="caption">{plural(rows.length, 'item')} in this chapter.</AppText>
        ) : null}
      </Section>
    </Screen>
  );
}

function ChipRow({ children }: { children: ReactNode }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={styles.chips}>{children}</View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', gap: spacing.sm },
});
