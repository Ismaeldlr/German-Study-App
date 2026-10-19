import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { displayLemma } from '@/core/cards';
import { emptyFields, validateFields, type Draft, type DraftFields } from '@/core/drafts';
import { findDuplicates } from '@/core/duplicates';
import { allLemmas, createItem } from '@/data/repos/items';
import { getSetting } from '@/data/repos/settings';
import { describeLlmError } from '@/llm/errors';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { Banner, Row, Screen, Section } from '@/ui/layout';
import { GermanField, UmlautBar } from '@/ui/umlaut';

import { ChapterPicker } from '../chapters/ChapterPicker';
import { useServices } from '../services';
import { useOnline } from '../use-online';
import { DraftForm } from './DraftForm';
import { draftToItemInput, enrichOne, refreshDraft } from './enrich';

type Step =
  | { name: 'input' }
  | { name: 'match'; exact: Match | null; near: Match[] }
  | { name: 'loading' }
  | { name: 'preview'; draft: Draft }
  | { name: 'error'; message: string };

type Match = { id: number; label: string };

/**
 * Type a word in any form; the LLM fills in the grammar; you check the
 * preview and save. Typos that are close to a word you already have ask
 * "did you mean" first.
 */
export function AddWordScreen() {
  const services = useServices();
  const { db, now } = services;
  const online = useOnline();
  const [word, setWord] = useState('');
  const [step, setStep] = useState<Step>({ name: 'input' });
  const [chapterId, setChapterId] = useState(() => getSetting(db, 'study.currentChapterId'));
  const [errors, setErrors] = useState<string[]>([]);
  const [saved, setSaved] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  // A new draft remounts the form so its local text state starts fresh.
  const [formKey, setFormKey] = useState(0);

  const lookUp = (skipMatch = false) => {
    const text = word.trim();
    if (!text) return;
    setSaved(null);
    if (!skipMatch) {
      const deck = allLemmas(db).map((l) => ({ ...l, label: displayLemma(l) }));
      const { exact, near } = findDuplicates(text, deck);
      if (exact.length || near.length) {
        setStep({
          name: 'match',
          exact: exact[0] ? { id: exact[0].id, label: exact[0].label } : null,
          near: near.slice(0, 3).map((n) => ({ id: n.id, label: n.label })),
        });
        return;
      }
    }
    void enrich(text);
  };

  const enrich = async (text: string) => {
    setStep({ name: 'loading' });
    abort.current = new AbortController();
    try {
      const draft = await enrichOne(services, text, abort.current.signal);
      setFormKey((k) => k + 1);
      setStep({ name: 'preview', draft });
    } catch (error) {
      setStep({ name: 'error', message: describeLlmError(error) });
    }
  };

  const fillByHand = () => {
    setErrors([]);
    setFormKey((k) => k + 1);
    setStep({
      name: 'preview',
      draft: {
        lineIndex: 0,
        raw: word,
        status: 'ok',
        include: true,
        fields: emptyFields(word.trim()),
        flags: [],
        note: null,
      },
    });
  };

  const updateFields = (draft: Draft, fields: DraftFields) => {
    setStep({ name: 'preview', draft: refreshDraft(db, draft, fields) });
  };

  const save = (draft: Draft) => {
    const problems = validateFields(draft.fields);
    setErrors(problems);
    if (problems.length) return;
    createItem(
      db,
      draftToItemInput(draft.fields, { chapterId, note: draft.note }),
      now().getTime(),
    );
    setSaved(displayLemma(draft.fields));
    setWord('');
    setStep({ name: 'input' });
  };

  const reset = () => {
    abort.current?.abort();
    setErrors([]);
    setStep({ name: 'input' });
  };

  return (
    <Screen testID="add-word-screen" footer={<UmlautBar />}>
      {saved ? (
        <Banner tone="success" testID="add-saved">
          <AppText color="successText">Added {saved} to your deck.</AppText>
        </Banner>
      ) : null}
      {!online ? (
        <Banner tone="warning" testID="offline-banner">
          <AppText color="warningText">
            You are offline. Look up needs the LLM, but you can fill a word in by hand.
          </AppText>
        </Banner>
      ) : null}

      {step.name === 'input' || step.name === 'match' || step.name === 'error' ? (
        <Section>
          <GermanField
            testID="add-word-input"
            label="Word or phrase"
            placeholder="Wohnung, zog um, sich freuen auf"
            value={word}
            onChangeText={(text) => {
              setWord(text);
              if (step.name !== 'input') setStep({ name: 'input' });
            }}
            onSubmitEditing={() => lookUp()}
            returnKeyType="search"
            autoFocus
          />
          <Row>
            <Button
              testID="add-look-up"
              label="Look up"
              onPress={() => lookUp()}
              disabled={!word.trim()}
            />
            <Button
              testID="add-by-hand"
              label="Fill in by hand"
              variant="ghost"
              onPress={fillByHand}
            />
          </Row>
        </Section>
      ) : null}

      {step.name === 'match' ? (
        <Section testID="add-match">
          {step.exact ? (
            <AppText>
              <AppText variant="label">{step.exact.label}</AppText> is already in your deck.
            </AppText>
          ) : (
            <AppText>Did you mean one of these? They are already in your deck.</AppText>
          )}
          {[...(step.exact ? [step.exact] : []), ...step.near].map((m) => (
            <Button
              key={m.id}
              testID={`add-open-${m.id}`}
              label={`Open ${m.label}`}
              variant="secondary"
              onPress={() => router.push({ pathname: '/item/[id]', params: { id: String(m.id) } })}
            />
          ))}
          <Button
            testID="add-look-up-anyway"
            label={`Look up "${word.trim()}" anyway`}
            variant="ghost"
            onPress={() => lookUp(true)}
          />
        </Section>
      ) : null}

      {step.name === 'loading' ? (
        <Section testID="add-loading">
          <Row>
            <ActivityIndicator />
            <AppText>Looking up {word.trim()}…</AppText>
          </Row>
          <Button label="Cancel" variant="ghost" onPress={reset} />
        </Section>
      ) : null}

      {step.name === 'error' ? (
        <Banner tone="error" testID="add-error">
          <AppText color="errorText">{step.message}</AppText>
        </Banner>
      ) : null}

      {step.name === 'preview' ? (
        <>
          <Section title="Check before saving" testID="add-preview">
            {step.draft.note ? <AppText variant="caption">{step.draft.note}</AppText> : null}
            <DraftForm
              key={formKey}
              fields={step.draft.fields}
              flags={step.draft.flags}
              onChange={(fields) => updateFields(step.draft, fields)}
            />
            <ChapterPicker value={chapterId} onChange={setChapterId} />
          </Section>
          {errors.length ? (
            <Banner tone="error" testID="add-errors">
              {errors.map((e) => (
                <AppText key={e} color="errorText">
                  {e}
                </AppText>
              ))}
            </Banner>
          ) : null}
          <View style={{ gap: 8 }}>
            <Button
              testID="add-save"
              size="large"
              label={step.draft.duplicateOf ? 'Add anyway' : 'Save to deck'}
              onPress={() => save(step.draft)}
            />
            <Button testID="add-start-over" label="Start over" variant="ghost" onPress={reset} />
          </View>
        </>
      ) : null}
    </Screen>
  );
}
