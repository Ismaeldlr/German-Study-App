import { router } from 'expo-router';
import { View } from 'react-native';

import { plural } from '@/core/format';
import type { MistakeCategory } from '@/core/model';
import { topWeakSpot, WEAK_SPOT_HALF_LIFE_DAYS } from '@/core/weak-spots';
import { grammarForCategory } from '@/data/repos/grammar';
import { focusQueue } from '@/data/repos/study';
import { pullForwardGrammar, weakSpotExamples, weakSpots } from '@/data/repos/weak-spots';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { ListItem } from '@/ui/controls';
import { Screen, Section } from '@/ui/layout';
import { radius, useTheme } from '@/ui/theme';

import { useServices } from '../services';
import { useLiveQuery } from '../use-live-query';
import {
  MISTAKE_DESCRIPTIONS,
  MISTAKE_LABELS,
  SUGGESTED_GRAMMAR,
  shortDate,
} from '../words/describe';

/**
 * Your mistakes by category, scored so that recent ones weigh most: each
 * score halves every two weeks without new errors. The top one pulls its
 * grammar points into your next session, and any of them can be drilled
 * right away.
 */
export function WeakSpotsScreen() {
  const { db, now } = useServices();
  const theme = useTheme();
  const tables = ['mistake', 'item', 'card', 'grammar_note', 'exercise', 'pending_grade'] as const;
  const spots = useLiveQuery(() => weakSpots(db, now()), tables);
  const pulled = useLiveQuery(() => pullForwardGrammar(db, now()), tables);
  const details = useLiveQuery(
    () =>
      new Map(
        spots.map((s) => [
          s.category,
          {
            examples: weakSpotExamples(db, s.category),
            grammar: grammarForCategory(db, s.category).map((g) => g.item),
            drill: focusQueue(db, s.category).length,
          },
        ]),
      ),
    tables,
  );
  const top = topWeakSpot(spots);
  const max = spots[0]?.score ?? 1;

  if (spots.length === 0) {
    return (
      <Screen testID="weak-spots-empty">
        <AppText variant="heading">No mistakes yet</AppText>
        <AppText>
          As you study, every mistake is sorted into a category. The ones that keep coming back show
          up here.
        </AppText>
      </Screen>
    );
  }

  return (
    <Screen testID="weak-spots-screen">
      <AppText variant="caption">
        Recent mistakes weigh most: a score halves every {WEAK_SPOT_HALF_LIFE_DAYS} days without new
        ones. The top one pulls its grammar points into your next session.
      </AppText>
      {spots.map((spot) => {
        const detail = details.get(spot.category);
        const suggestion = SUGGESTED_GRAMMAR[spot.category];
        return (
          <Section key={spot.category} testID={`weak-spot-${spot.category}`}>
            <View style={{ gap: 4 }}>
              <AppText variant="heading">{MISTAKE_LABELS[spot.category]}</AppText>
              <AppText variant="caption">{MISTAKE_DESCRIPTIONS[spot.category]}</AppText>
            </View>
            <View
              accessibilityRole="progressbar"
              accessibilityLabel={`Score ${spot.score.toFixed(1)}`}
              style={{ height: 8, borderRadius: radius.sm, backgroundColor: theme.surfaceAlt }}
            >
              <View
                style={{
                  width: `${Math.max(4, (spot.score / max) * 100)}%`,
                  height: 8,
                  borderRadius: radius.sm,
                  backgroundColor: spot === top ? theme.danger : theme.primary,
                }}
              />
            </View>
            <AppText variant="caption" testID={`weak-spot-score-${spot.category}`}>
              Score {spot.score.toFixed(1)} · {spot.count}{' '}
              {spot.count === 1 ? 'mistake' : 'mistakes'} · last on {shortDate(spot.lastAt)}
            </AppText>
            {detail?.drill ? <DrillButton category={spot.category} cards={detail.drill} /> : null}
            {detail?.examples.map((m) => (
              <ListItem
                key={m.id}
                title={`${m.yourText || '—'} → ${m.correction}`}
                subtitle={[m.lemma, m.explanation].filter(Boolean).join(' · ')}
              />
            ))}
            {detail?.grammar.length ? (
              <View style={{ gap: 4 }}>
                <AppText variant="label">Practised by</AppText>
                {detail.grammar.map((g) => (
                  <ListItem
                    key={g.id}
                    testID={`weak-spot-grammar-${g.id}`}
                    title={g.lemma}
                    subtitle={pulled.has(g.id) ? 'Drilled in your next session' : g.meanings[0]}
                    onPress={() =>
                      router.push({ pathname: '/item/[id]', params: { id: String(g.id) } })
                    }
                  />
                ))}
              </View>
            ) : suggestion ? (
              <Button
                testID={`weak-spot-add-${spot.category}`}
                label="Add a grammar point for this"
                variant="secondary"
                onPress={() =>
                  router.push({ pathname: '/add-grammar', params: { name: suggestion } })
                }
              />
            ) : null}
          </Section>
        );
      })}
    </Screen>
  );
}

/** Start a short drill on one weak spot: its grammar drills and the cards you missed. */
export function DrillButton({ category, cards }: { category: MistakeCategory; cards: number }) {
  return (
    <Button
      testID={`drill-${category}`}
      label={`Drill now · ${plural(cards, 'card')}`}
      icon="flash-outline"
      onPress={() => router.push({ pathname: '/study', params: { focus: category } })}
    />
  );
}
