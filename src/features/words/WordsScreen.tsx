import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { FlatList, ScrollView, StyleSheet, View } from 'react-native';

import type { ItemState } from '@/core/cards';
import type { ItemKind } from '@/core/model';
import { chapterLabel, listChapters } from '@/data/repos/chapters';
import { listDeck, type DeckRow } from '@/data/repos/items';
import { pendingSuggestions } from '@/data/repos/suggestions';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { Chip, ListItem, StatePill, stateColors } from '@/ui/controls';
import { TextField } from '@/ui/TextField';
import { genderColors, radius, spacing, useTheme } from '@/ui/theme';
import { Lemma } from '@/ui/visuals';

import { useServices } from '../services';
import { useLiveQuery } from '../use-live-query';

const STATES: { value: ItemState | null; label: string }[] = [
  { value: null, label: 'All' },
  { value: 'new', label: 'New' },
  { value: 'learning', label: 'Learning' },
  { value: 'young', label: 'Young' },
  { value: 'mature', label: 'Mature' },
  { value: 'suspended', label: 'Suspended' },
];

const KINDS: { value: ItemKind | null; label: string }[] = [
  { value: null, label: 'All types' },
  { value: 'noun', label: 'Nouns' },
  { value: 'verb', label: 'Verbs' },
  { value: 'adjective', label: 'Adjectives' },
  { value: 'adverb', label: 'Adverbs' },
  { value: 'phrase', label: 'Phrases' },
  { value: 'grammar', label: 'Grammar' },
];

/** The deck browser: search, and filter by chapter, state and word type. */
export function WordsScreen() {
  const { db } = useServices();
  const theme = useTheme();
  const [search, setSearch] = useState('');
  const [state, setState] = useState<ItemState | null>(null);
  const [kind, setKind] = useState<ItemKind | null>(null);
  const [chapterId, setChapterId] = useState<number | 'none' | null>(null);
  const chapters = useLiveQuery(() => listChapters(db), ['chapter']);
  const rows = useLiveQuery(
    () => listDeck(db, { search, state, kind, chapterId }),
    ['item', 'card', 'chapter'],
  );
  const suggestions = useLiveQuery(() => pendingSuggestions(db).length, ['suggestion']);
  const chapterNames = new Map(chapters.map((c) => [c.id, chapterLabel(c)]));

  const counts = { new: 0, learning: 0, young: 0, mature: 0, suspended: 0 };
  for (const row of rows) counts[row.state]++;

  const header = (
    <View style={{ gap: spacing.md, paddingBottom: spacing.sm }}>
      <ChipRow>
        <Button
          testID="words-add"
          icon="add"
          label="Add word"
          onPress={() => router.push('/add')}
        />
        <Button
          testID="words-paste"
          icon="clipboard-outline"
          label="Paste list"
          variant="secondary"
          onPress={() => router.push('/paste')}
        />
        <Button
          testID="words-grammar"
          icon="extension-puzzle-outline"
          label="Add grammar"
          variant="secondary"
          onPress={() => router.push('/add-grammar')}
        />
        <Button
          testID="words-suggestions"
          icon="bulb-outline"
          label={suggestions ? `Suggestions (${suggestions})` : 'Suggest words'}
          variant="secondary"
          onPress={() => router.push('/suggestions')}
        />
      </ChipRow>
      <TextField
        testID="words-search"
        placeholder="Search German or English"
        value={search}
        onChangeText={setSearch}
        accessibilityLabel="Search"
      />
      <ChipRow>
        {STATES.map((s) => (
          <Chip
            key={s.label}
            testID={`filter-state-${s.value ?? 'all'}`}
            label={s.label}
            selected={state === s.value}
            onPress={() => setState(s.value)}
          />
        ))}
      </ChipRow>
      {chapters.length ? (
        <ChipRow>
          <Chip
            label="All chapters"
            selected={chapterId === null}
            onPress={() => setChapterId(null)}
          />
          {chapters.map((c) => (
            <Chip
              key={c.id}
              testID={`filter-chapter-${c.id}`}
              label={chapterLabel(c)}
              selected={chapterId === c.id}
              onPress={() => setChapterId(c.id)}
            />
          ))}
          <Chip
            label="No chapter"
            selected={chapterId === 'none'}
            onPress={() => setChapterId('none')}
          />
        </ChipRow>
      ) : null}
      <ChipRow>
        {KINDS.map((k) => (
          <Chip
            key={k.label}
            testID={`filter-kind-${k.value ?? 'all'}`}
            label={k.label}
            selected={kind === k.value}
            onPress={() => setKind(k.value)}
          />
        ))}
      </ChipRow>
      {rows.length ? (
        <View style={{ gap: spacing.xs }}>
          <View style={[styles.mastery, { backgroundColor: theme.track }]}>
            {(['mature', 'young', 'learning', 'new', 'suspended'] as const).map((key) =>
              counts[key] ? (
                <View
                  key={key}
                  style={{ flex: counts[key], backgroundColor: stateColors(theme, key).dot }}
                />
              ) : null,
            )}
          </View>
          <AppText variant="caption">
            {counts.mature} mature · {counts.young} young · {counts.learning} learning ·{' '}
            {counts.new} new
          </AppText>
        </View>
      ) : null}
      <AppText variant="overline" testID="words-count">
        {rows.length} {rows.length === 1 ? 'word' : 'words'}
      </AppText>
    </View>
  );

  return (
    <FlatList<DeckRow>
      testID="words-screen"
      style={{ flex: 1, backgroundColor: theme.background }}
      contentContainerStyle={{ padding: spacing.lg }}
      keyboardShouldPersistTaps="handled"
      data={rows}
      keyExtractor={(row) => String(row.item.id)}
      ListHeaderComponent={header}
      ListEmptyComponent={
        <AppText variant="caption" style={{ paddingVertical: spacing.lg }}>
          {search || state || kind || chapterId
            ? 'Nothing matches these filters.'
            : 'Your deck is empty. Add a word or paste a list.'}
        </AppText>
      }
      renderItem={({ item: row }) => (
        <ListItem
          testID={`word-${row.item.id}`}
          left={
            <View
              style={[
                styles.stripe,
                {
                  backgroundColor:
                    row.item.kind === 'noun'
                      ? genderColors(theme, row.item.article).fg
                      : theme.border,
                },
              ]}
            />
          }
          title={<Lemma item={row.item} variant="label" />}
          subtitle={[
            row.item.meanings.slice(0, 2).join(', '),
            row.item.chapterId ? chapterNames.get(row.item.chapterId) : null,
          ]
            .filter(Boolean)
            .join(' · ')}
          right={<StatePill state={row.state} />}
          onPress={() =>
            router.push({ pathname: '/item/[id]', params: { id: String(row.item.id) } })
          }
        />
      )}
    />
  );
}

const styles = StyleSheet.create({
  mastery: { height: 10, borderRadius: radius.pill, overflow: 'hidden', flexDirection: 'row' },
  stripe: { width: 4, alignSelf: 'stretch', borderRadius: 2 },
});

function ChipRow({ children }: { children: ReactNode }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>{children}</View>
    </ScrollView>
  );
}
