import { router } from 'expo-router';
import { View } from 'react-native';

import { displayLemma } from '@/core/cards';
import { LEECH_LAPSES } from '@/core/leeches';
import { getItem } from '@/data/repos/items';
import { confusedPairsInDeck, dismissLeech, listLeeches, suspendLeech } from '@/data/repos/leeches';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { ListItem } from '@/ui/controls';
import { Row, Screen, Section } from '@/ui/layout';

import { useServices } from '../services';
import { useLiveQuery } from '../use-live-query';
import { CARD_TYPE_LABELS } from './describe';

/**
 * Cards you keep forgetting, with a memory hook the LLM wrote for each,
 * and the word pairs you mix up. Rewrite a leech so it sticks, suspend it,
 * or keep studying it as it is.
 */
export function LeechesScreen() {
  const { db } = useServices();
  const leeches = useLiveQuery(() => listLeeches(db), ['card', 'item']);
  const pairs = useLiveQuery(
    () =>
      confusedPairsInDeck(db).map((p) => ({
        ...p,
        words: p.itemIds.map((id) => getItem(db, id)).filter((w) => w !== undefined),
      })),
    ['mistake', 'item'],
  );

  return (
    <Screen testID="leeches-screen">
      <Section title="Leeches" testID="leeches-list">
        <AppText variant="caption">
          Cards that lapsed {LEECH_LAPSES} times or more. A memory hook often helps; if the word
          itself is the problem, rewrite it or suspend the card.
        </AppText>
        {leeches.length === 0 ? (
          <AppText testID="leeches-none">No leeches right now.</AppText>
        ) : null}
        {leeches.map(({ card, item }) => (
          <View key={card.id} style={{ gap: 8 }} testID={`leech-${card.id}`}>
            <ListItem
              title={displayLemma(item)}
              subtitle={`${CARD_TYPE_LABELS[card.type]} · ${card.lapses} lapses · ${item.meanings.join('; ')}`}
              onPress={() =>
                router.push({ pathname: '/item/[id]', params: { id: String(item.id) } })
              }
            />
            <AppText variant="caption" testID={`leech-hook-${card.id}`}>
              {item.memoryHook
                ? `Memory hook: ${item.memoryHook}`
                : 'A memory hook and a contrast exercise get written the next time the app is online.'}
            </AppText>
            <Row>
              <Button
                testID={`leech-edit-${card.id}`}
                label="Rewrite"
                variant="secondary"
                onPress={() =>
                  router.push({ pathname: '/edit/[id]', params: { id: String(item.id) } })
                }
              />
              <Button
                testID={`leech-suspend-${card.id}`}
                label="Suspend card"
                variant="secondary"
                onPress={() => suspendLeech(db, card.id)}
              />
              <Button
                testID={`leech-keep-${card.id}`}
                label="Keep studying"
                variant="ghost"
                onPress={() => dismissLeech(db, card.id)}
              />
            </Row>
          </View>
        ))}
      </Section>

      <Section title="Words you mix up" testID="confused-pairs">
        {pairs.length === 0 ? (
          <AppText variant="caption">
            When you answer one deck word with another more than once, the pair shows up here.
          </AppText>
        ) : (
          <>
            <AppText variant="caption">
              Contrast sets put both words in one exercise. They come up when one of them is due.
            </AppText>
            {pairs.map((p) => (
              <ListItem
                key={p.itemIds.join('-')}
                testID={`pair-${p.itemIds.join('-')}`}
                title={p.words.map((w) => displayLemma(w)).join(' ↔ ')}
                subtitle={`${p.count} mix-ups`}
              />
            ))}
          </>
        )}
      </Section>
    </Screen>
  );
}
