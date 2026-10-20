import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { lemmaKey } from '@/core/duplicates';
import { emptyGrammarFields, validateGrammar, type GrammarFields } from '@/core/grammar';
import { createGrammarItem } from '@/data/repos/grammar';
import { allLemmas } from '@/data/repos/items';
import { getSetting } from '@/data/repos/settings';
import { describeLlmError } from '@/llm/errors';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { Banner, Row, Screen, Section } from '@/ui/layout';
import { GermanField, UmlautBar } from '@/ui/umlaut';

import { ChapterPicker } from '../chapters/ChapterPicker';
import { useServices } from '../services';
import { useOnline } from '../use-online';
import { describeGrammarPoint } from './grammar';
import { GrammarForm } from './GrammarForm';

type Step =
  | { name: 'input' }
  | { name: 'exists'; id: number; label: string }
  | { name: 'loading' }
  | { name: 'preview'; fields: GrammarFields }
  | { name: 'error'; message: string };

/**
 * Name a grammar point; the LLM writes a short English summary and three
 * examples; you check them and save. It is then drilled like any card.
 */
export function AddGrammarScreen({ initialName = '' }: { initialName?: string }) {
  const services = useServices();
  const { db, now } = services;
  const online = useOnline();
  const [name, setName] = useState(initialName);
  const [step, setStep] = useState<Step>({ name: 'input' });
  const [chapterId, setChapterId] = useState(() => getSetting(db, 'study.currentChapterId'));
  const [errors, setErrors] = useState<string[]>([]);
  const [saved, setSaved] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);
  const abort = useRef<AbortController | null>(null);

  const existing = (text: string) =>
    allLemmas(db).find((l) => l.kind === 'grammar' && lemmaKey(l.lemma) === lemmaKey(text));

  const lookUp = async (skipCheck = false) => {
    const text = name.trim();
    if (!text) return;
    setSaved(null);
    const match = skipCheck ? undefined : existing(text);
    if (match) {
      setStep({ name: 'exists', id: match.id, label: match.lemma });
      return;
    }
    setStep({ name: 'loading' });
    abort.current = new AbortController();
    try {
      const fields = await describeGrammarPoint(services, text, abort.current.signal);
      setFormKey((k) => k + 1);
      setStep({ name: 'preview', fields });
    } catch (error) {
      setStep({ name: 'error', message: describeLlmError(error) });
    }
  };

  const byHand = () => {
    setErrors([]);
    setFormKey((k) => k + 1);
    setStep({ name: 'preview', fields: emptyGrammarFields(name.trim()) });
  };

  const save = (fields: GrammarFields) => {
    const problems = validateGrammar(fields);
    setErrors(problems);
    if (problems.length) return;
    createGrammarItem(db, fields, chapterId, now().getTime());
    setSaved(fields.name.trim());
    setName('');
    setStep({ name: 'input' });
  };

  const reset = () => {
    abort.current?.abort();
    setErrors([]);
    setStep({ name: 'input' });
  };

  return (
    <Screen testID="add-grammar-screen" footer={<UmlautBar />}>
      {saved ? (
        <Banner tone="success" testID="grammar-saved">
          <AppText color="successText">
            Added {saved}. Its first drill gets written the next time the app is online.
          </AppText>
        </Banner>
      ) : null}
      {!online ? (
        <Banner tone="warning" testID="offline-banner">
          <AppText color="warningText">
            You are offline. Look up needs the LLM, but you can write the rule up yourself.
          </AppText>
        </Banner>
      ) : null}

      {step.name !== 'preview' && step.name !== 'loading' ? (
        <Section>
          <GermanField
            testID="grammar-input"
            label="Grammar point"
            placeholder="Dativ nach mit, bei, von"
            value={name}
            onChangeText={(text) => {
              setName(text);
              if (step.name !== 'input') setStep({ name: 'input' });
            }}
            onSubmitEditing={() => void lookUp()}
            returnKeyType="search"
            autoFocus={!initialName}
          />
          <Row>
            <Button
              testID="grammar-look-up"
              label="Look up"
              onPress={() => void lookUp()}
              disabled={!name.trim()}
            />
            <Button
              testID="grammar-by-hand"
              label="Write it yourself"
              variant="ghost"
              onPress={byHand}
            />
          </Row>
        </Section>
      ) : null}

      {step.name === 'exists' ? (
        <Section testID="grammar-exists">
          <AppText>
            <AppText variant="label">{step.label}</AppText> is already in your deck.
          </AppText>
          <Button
            label={`Open ${step.label}`}
            variant="secondary"
            onPress={() => router.push({ pathname: '/item/[id]', params: { id: String(step.id) } })}
          />
          <Button
            testID="grammar-look-up-anyway"
            label="Add it again anyway"
            variant="ghost"
            onPress={() => void lookUp(true)}
          />
        </Section>
      ) : null}

      {step.name === 'loading' ? (
        <Section testID="grammar-loading">
          <Row>
            <ActivityIndicator />
            <AppText>Writing up {name.trim()}…</AppText>
          </Row>
          <Button label="Cancel" variant="ghost" onPress={reset} />
        </Section>
      ) : null}

      {step.name === 'error' ? (
        <Banner tone="error" testID="grammar-error">
          <AppText color="errorText">{step.message}</AppText>
        </Banner>
      ) : null}

      {step.name === 'preview' ? (
        <>
          <Section title="Check before saving" testID="grammar-preview">
            <GrammarForm
              key={formKey}
              fields={step.fields}
              onChange={(fields) => setStep({ name: 'preview', fields })}
            />
            <ChapterPicker value={chapterId} onChange={setChapterId} />
          </Section>
          {errors.length ? (
            <Banner tone="error" testID="grammar-errors">
              {errors.map((e) => (
                <AppText key={e} color="errorText">
                  {e}
                </AppText>
              ))}
            </Banner>
          ) : null}
          <View style={{ gap: 8 }}>
            <Button
              testID="grammar-save"
              size="large"
              label="Save to deck"
              onPress={() => save(step.fields)}
            />
            <Button label="Start over" variant="ghost" onPress={reset} />
          </View>
        </>
      ) : null}
    </Screen>
  );
}
