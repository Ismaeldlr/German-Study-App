import { useState } from 'react';
import { View } from 'react-native';

import { displayLemma } from '@/core/cards';
import { plural } from '@/core/format';
import { chapterLabel, getChapter } from '@/data/repos/chapters';
import { acceptSuggestion, pendingSuggestions, rejectSuggestion } from '@/data/repos/suggestions';
import type { SuggestionRow } from '@/data/schema';
import { requestSuggestions } from '@/jobs/suggest';
import { describeLlmError } from '@/llm/errors';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { FlagList } from '@/ui/controls';
import { Banner, Row, Screen, Section } from '@/ui/layout';
import { TextField } from '@/ui/TextField';

import { useServices } from '../services';
import { useLiveQuery } from '../use-live-query';
import { useOnline } from '../use-online';

/**
 * Words the LLM suggests for the current chapter or a topic you give. Each
 * shows why; accept adds it to the deck with one tap, reject keeps it from
 * ever coming back.
 */
export function SuggestionsScreen() {
  const services = useServices();
  const { db, now } = services;
  const online = useOnline();
  const pending = useLiveQuery(() => pendingSuggestions(db), ['suggestion']);
  const [topic, setTopic] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const ask = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const added = await requestSuggestions(services, { topic });
      setMessage({
        tone: 'success',
        text: added
          ? `${plural(added, 'new suggestion')} below.`
          : 'Nothing new this time: every word it found is in your deck or was suggested before.',
      });
    } catch (error) {
      setMessage({ tone: 'error', text: describeLlmError(error) });
    } finally {
      setBusy(false);
    }
  };

  const accept = (row: SuggestionRow) => {
    acceptSuggestion(db, row.id, now().getTime());
    const chapter = row.chapterId ? getChapter(db, row.chapterId) : undefined;
    setMessage({
      tone: 'success',
      text: `Added ${row.details ? displayLemma(row.details.fields) : row.lemma}${chapter ? ` to ${chapterLabel(chapter)}` : ''}.`,
    });
  };

  return (
    <Screen testID="suggestions-screen">
      <Section title="Suggest words">
        <AppText variant="caption">
          A2 words that fit the current chapter, or a topic you name. They lean on words you already
          know.
        </AppText>
        <TextField
          testID="suggest-topic"
          label="Topic (optional)"
          placeholder="Kochen, Arzt, Reisen …"
          value={topic}
          onChangeText={setTopic}
          autoCorrect={false}
        />
        <Button
          testID="suggest-run"
          label="Suggest words"
          loading={busy}
          disabled={!online}
          onPress={ask}
        />
        {!online ? <AppText variant="caption">Suggestions need a connection.</AppText> : null}
      </Section>

      {message ? (
        <Banner tone={message.tone} testID="suggest-message">
          <AppText color={message.tone === 'success' ? 'successText' : 'errorText'}>
            {message.text}
          </AppText>
        </Banner>
      ) : null}

      {pending.length === 0 ? (
        <AppText testID="suggestions-empty">No suggestions waiting.</AppText>
      ) : (
        pending.map((row) => (
          <SuggestionCard
            key={row.id}
            row={row}
            onAccept={() => accept(row)}
            onReject={() => rejectSuggestion(db, row.id)}
          />
        ))
      )}
    </Screen>
  );
}

function SuggestionCard({
  row,
  onAccept,
  onReject,
}: {
  row: SuggestionRow;
  onAccept: () => void;
  onReject: () => void;
}) {
  const fields = row.details?.fields;
  return (
    <Section testID={`suggestion-${row.id}`}>
      <View style={{ gap: 4 }}>
        <AppText variant="heading">{fields ? displayLemma(fields) : row.lemma}</AppText>
        {fields ? (
          <>
            <AppText>{fields.meanings.join('; ')}</AppText>
            {fields.kind === 'noun' && fields.plural && fields.article ? (
              <AppText variant="caption">Plural: die {fields.plural}</AppText>
            ) : null}
            {fields.kind === 'verb' && fields.verbParticiple ? (
              <AppText variant="caption">
                {fields.verbPresent3} · {fields.verbPreterite} ·{' '}
                {fields.verbAuxiliary === 'sein' ? 'ist' : 'hat'} {fields.verbParticiple}
              </AppText>
            ) : null}
            {fields.exampleDe ? (
              <AppText style={{ fontStyle: 'italic' }}>{fields.exampleDe}</AppText>
            ) : null}
          </>
        ) : null}
        <AppText variant="caption" testID={`suggestion-reason-${row.id}`}>
          Why: {row.reason}
        </AppText>
        <FlagList flags={row.details?.flags ?? []} />
      </View>
      <Row style={{ flexWrap: 'nowrap' }}>
        <Button
          testID={`suggestion-accept-${row.id}`}
          style={{ flex: 1 }}
          label="Add"
          disabled={!fields}
          onPress={onAccept}
        />
        <Button
          testID={`suggestion-reject-${row.id}`}
          style={{ flex: 1 }}
          variant="secondary"
          label="No thanks"
          onPress={onReject}
        />
      </Row>
    </Section>
  );
}
