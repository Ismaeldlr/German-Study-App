import { router, Stack } from 'expo-router';
import { Alert, View } from 'react-native';

import { displayLemma } from '@/core/cards';
import { chapterLabel } from '@/data/repos/chapters';
import { getGrammarNote } from '@/data/repos/grammar';
import { deleteItem, getItemDetail, setCardSuspended, setItemStatus } from '@/data/repos/items';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { ListItem, StatePill, SwitchRow } from '@/ui/controls';
import { Row, Screen, Section } from '@/ui/layout';
import { Lemma } from '@/ui/visuals';

import { useServices } from '../services';
import { useLiveQuery } from '../use-live-query';
import {
  CARD_TYPE_LABELS,
  CASE_LABELS,
  MISTAKE_LABELS,
  RATING_LABELS,
  describeDue,
  shortDate,
  stateLabel,
} from './describe';

/** Forms, examples, cards with their schedule, review history and mistakes. */
export function ItemDetailScreen({ itemId }: { itemId: number }) {
  const { db, now } = useServices();
  const detail = useLiveQuery(
    () => getItemDetail(db, itemId),
    ['item', 'card', 'review', 'mistake', 'chapter'],
  );
  const note = useLiveQuery(
    () => (detail?.item.kind === 'grammar' ? (getGrammarNote(db, itemId) ?? null) : null),
    ['grammar_note', 'item'],
  );

  if (!detail) {
    return (
      <Screen testID="item-missing">
        <AppText>This word is no longer in your deck.</AppText>
      </Screen>
    );
  }
  const { item, chapter, cards, reviews, mistakes, state } = detail;
  const time = now().getTime();
  const traits = [
    item.separable ? 'separable' : null,
    item.reflexive ? 'reflexive' : null,
    item.governedCase ? `+ ${CASE_LABELS[item.governedCase]}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const confirmDelete = () =>
    Alert.alert(`Delete ${displayLemma(item)}?`, 'Its cards and review history go too.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteItem(db, item.id);
          router.back();
        },
      },
    ]);

  const grammar = item.kind === 'grammar';
  return (
    <Screen testID="item-detail">
      <Stack.Screen options={{ title: grammar ? 'Grammar point' : 'Word' }} />
      <View style={{ gap: 4 }}>
        <Lemma item={item} variant="display" testID="item-title" />
        <Row>
          <AppText variant="caption">
            {item.kind}
            {chapter ? ` · ${chapterLabel(chapter)}` : ''}
            {item.source === 'llm' ? ' · suggested' : ''}
          </AppText>
          <StatePill state={item.status === 'suspended' ? 'suspended' : state} />
        </Row>
      </View>

      <Section title={grammar ? 'In short' : 'Meaning'} icon="💬">
        <AppText testID="item-meanings">{item.meanings.join('; ')}</AppText>
        {/* A grammar point's examples are listed under its rule. */}
        {item.exampleDe && !grammar ? (
          <View style={{ gap: 2 }}>
            <AppText style={{ fontStyle: 'italic' }}>{item.exampleDe}</AppText>
            {item.exampleEn ? <AppText variant="caption">{item.exampleEn}</AppText> : null}
          </View>
        ) : null}
        {item.notes ? <AppText variant="caption">{item.notes}</AppText> : null}
        {item.memoryHook ? (
          <AppText variant="caption" testID="item-hook">
            Memory hook: {item.memoryHook}
          </AppText>
        ) : null}
      </Section>

      {note ? (
        <Section title="Rule" testID="item-rule">
          <AppText>{note.ruleSummary}</AppText>
          {note.examples.map((e, i) => (
            <View key={i} style={{ gap: 2 }}>
              <AppText style={{ fontStyle: 'italic' }}>{e.de}</AppText>
              {e.en ? <AppText variant="caption">{e.en}</AppText> : null}
            </View>
          ))}
          {note.categories.length ? (
            <AppText variant="caption">
              About: {note.categories.map((c) => MISTAKE_LABELS[c].toLowerCase()).join(', ')}
            </AppText>
          ) : null}
        </Section>
      ) : null}

      {grammar ? null : (
        <Section title="Forms" testID="item-forms">
          {item.kind === 'noun' ? (
            <AppText>
              {item.article ? `${item.article} ${item.lemma}` : `${item.lemma} (plural only)`}
              {item.article ? ` · Pl. ${item.plural ? `die ${item.plural}` : 'none'}` : ''}
            </AppText>
          ) : null}
          {item.kind === 'verb' && item.verbParticiple ? (
            <AppText>
              er/sie/es {item.verbPresent3} · {item.verbPreterite} ·{' '}
              {item.verbAuxiliary === 'sein' ? 'ist' : 'hat'} {item.verbParticiple}
            </AppText>
          ) : null}
          {traits ? <AppText variant="caption">{traits}</AppText> : null}
        </Section>
      )}

      <Section title="Cards" testID="item-cards">
        {cards.map((c) => (
          <View key={c.id} style={{ gap: 2 }}>
            <SwitchRow
              testID={`card-active-${c.type}`}
              label={CARD_TYPE_LABELS[c.type]}
              value={!c.suspended}
              onValueChange={(active) => setCardSuspended(db, c.id, !active)}
            />
            <AppText variant="caption">
              {stateLabel(c.state)}
              {c.state !== 0 ? ` · ${describeDue(c.due, time)}` : ''} · {c.reps} reviews ·{' '}
              {c.lapses} lapses
              {c.leechAt ? ' · leech' : ''}
            </AppText>
          </View>
        ))}
      </Section>

      <Section title="History" testID="item-history">
        {reviews.length === 0 ? <AppText variant="caption">Not reviewed yet.</AppText> : null}
        {reviews.slice(0, 15).map((r) => (
          <ListItem
            key={r.id}
            title={`${CARD_TYPE_LABELS[r.cardType]}: ${RATING_LABELS[r.rating] ?? r.rating}`}
            subtitle={`${shortDate(r.reviewedAt)}${r.answer ? ` · “${r.answer}”` : ''}`}
          />
        ))}
      </Section>

      {mistakes.length ? (
        <Section title="Mistakes" testID="item-mistakes">
          {mistakes.slice(0, 15).map((m) => (
            <ListItem
              key={m.id}
              title={`${m.yourText || '—'} → ${m.correction}`}
              subtitle={`${MISTAKE_LABELS[m.category]}${m.explanation ? ` · ${m.explanation}` : ''}`}
            />
          ))}
        </Section>
      ) : null}

      <View style={{ gap: 8 }}>
        <Button
          testID="item-edit"
          label="Edit"
          onPress={() => router.push({ pathname: '/edit/[id]', params: { id: String(item.id) } })}
        />
        <Button
          testID="item-suspend"
          label={item.status === 'suspended' ? 'Unsuspend' : 'Suspend'}
          variant="secondary"
          onPress={() =>
            setItemStatus(db, item.id, item.status === 'suspended' ? 'active' : 'suspended', time)
          }
        />
        <Button testID="item-delete" label="Delete" variant="danger" onPress={confirmDelete} />
      </View>
    </Screen>
  );
}
