import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, View } from 'react-native';

import { displayLemma } from '@/core/cards';
import { validateFields, type Draft } from '@/core/drafts';
import { parseVocabularyList } from '@/core/parse-list';
import { createItems } from '@/data/repos/items';
import { getSetting } from '@/data/repos/settings';
import { describeLlmError } from '@/llm/errors';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { FlagList } from '@/ui/controls';
import { Banner, Row, Screen, Section } from '@/ui/layout';
import { spacing, useTheme } from '@/ui/theme';
import { GermanField, UmlautBar, UmlautProvider } from '@/ui/umlaut';

import { ChapterPicker } from '../chapters/ChapterPicker';
import { useServices } from '../services';
import { useOnline } from '../use-online';
import { DraftForm } from './DraftForm';
import { draftToItemInput, enrichLines, refreshDraft, type EnrichProgress } from './enrich';

type Step =
  | { name: 'input' }
  | { name: 'loading'; progress: EnrichProgress | null }
  | { name: 'review' }
  | { name: 'done'; count: number };

/**
 * Paste whatever class gave you. Every row comes back for review with flags
 * for duplicates, unclear lines and doubtful fields; you fix them, set the
 * chapter for the batch, and import.
 */
export function PasteListScreen() {
  const services = useServices();
  const { db, now } = services;
  const online = useOnline();
  const [text, setText] = useState('');
  const [step, setStep] = useState<Step>({ name: 'input' });
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [chapterId, setChapterId] = useState(() => getSetting(db, 'study.currentChapterId'));
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const abort = useRef<AbortController | null>(null);

  const lineCount = parseVocabularyList(text).length;
  const included = drafts.filter((d) => d.include);
  const invalid = included.filter((d) => validateFields(d.fields).length > 0);

  const review = async () => {
    const lines = parseVocabularyList(text);
    if (!lines.length) return;
    setError(null);
    setStep({ name: 'loading', progress: null });
    abort.current = new AbortController();
    try {
      const result = await enrichLines(services, lines, {
        signal: abort.current.signal,
        onProgress: (progress) => setStep({ name: 'loading', progress }),
      });
      setDrafts(result);
      setStep({ name: 'review' });
    } catch (e) {
      setError(describeLlmError(e));
      setStep({ name: 'input' });
    }
  };

  const importRows = () => {
    if (invalid.length || included.length === 0) return;
    createItems(
      db,
      included.map((d) => draftToItemInput(d.fields, { chapterId, note: d.note })),
      now().getTime(),
    );
    setStep({ name: 'done', count: included.length });
  };

  const toggle = (index: number) =>
    setDrafts((all) => all.map((d, i) => (i === index ? { ...d, include: !d.include } : d)));

  if (step.name === 'done') {
    return (
      <Screen testID="paste-done">
        <Banner tone="success">
          <AppText color="successText" variant="label">
            Imported {step.count} {step.count === 1 ? 'word' : 'words'}.
          </AppText>
        </Banner>
        <Button
          testID="paste-study"
          label="Study now"
          size="large"
          onPress={() => router.replace('/study')}
        />
        <Button label="Go to Words" variant="secondary" onPress={() => router.replace('/words')} />
        <Button
          label="Paste another list"
          variant="ghost"
          onPress={() => {
            setText('');
            setDrafts([]);
            setStep({ name: 'input' });
          }}
        />
      </Screen>
    );
  }

  if (step.name === 'review') {
    const flagged = drafts.filter((d) => d.flags.some((f) => f.tone === 'warning')).length;
    return (
      <Screen
        testID="paste-review"
        footer={
          <View style={{ padding: spacing.lg, gap: spacing.sm }}>
            {invalid.length ? (
              <AppText variant="caption" color="danger" testID="paste-invalid">
                Fix {invalid.length} ticked {invalid.length === 1 ? 'row' : 'rows'} before
                importing.
              </AppText>
            ) : null}
            <Button
              testID="paste-import"
              size="large"
              label={`Import ${included.length} ${included.length === 1 ? 'word' : 'words'}`}
              disabled={included.length === 0 || invalid.length > 0}
              onPress={importRows}
            />
          </View>
        }
      >
        <AppText testID="paste-summary">
          {drafts.length} {drafts.length === 1 ? 'line' : 'lines'}, {flagged} flagged. Tap a row to
          edit it.
        </AppText>
        <ChapterPicker value={chapterId} onChange={setChapterId} label="Chapter for this batch" />
        {drafts.map((draft, index) => (
          <DraftRow
            key={draft.lineIndex}
            draft={draft}
            invalid={draft.include && validateFields(draft.fields).length > 0}
            onToggle={() => toggle(index)}
            onEdit={() => setEditing(index)}
          />
        ))}
        <Button
          label="Back to the list"
          variant="ghost"
          onPress={() => setStep({ name: 'input' })}
        />
        <Modal
          visible={editing !== null}
          animationType="slide"
          onRequestClose={() => setEditing(null)}
        >
          {editing !== null && drafts[editing] ? (
            <UmlautProvider>
              <EditRow
                draft={drafts[editing]}
                onDone={(updated) => {
                  setDrafts((all) => all.map((d, i) => (i === editing ? updated : d)));
                  setEditing(null);
                }}
                onCancel={() => setEditing(null)}
              />
            </UmlautProvider>
          ) : null}
        </Modal>
      </Screen>
    );
  }

  return (
    <Screen testID="paste-screen" footer={<UmlautBar />}>
      {!online ? (
        <Banner tone="warning" testID="offline-banner">
          <AppText color="warningText">You are offline. Reading a list needs the LLM.</AppText>
        </Banner>
      ) : null}
      <GermanField
        testID="paste-input"
        label="Vocabulary list"
        placeholder={'die Wohnung, -en\numziehen, zog um, ist umgezogen\ngemütlich – cosy'}
        value={text}
        onChangeText={setText}
        multiline
        style={{ minHeight: 220 }}
        editable={step.name === 'input'}
        helper="Textbook notation, translations and messy copied text all work."
      />
      {error ? (
        <Banner tone="error" testID="paste-error">
          <AppText color="errorText">{error}</AppText>
        </Banner>
      ) : null}
      {step.name === 'loading' ? (
        <Section testID="paste-loading">
          <Row>
            <ActivityIndicator />
            <AppText>
              {step.progress
                ? `Filling in ${Math.min(step.progress.done + 25, step.progress.total)} of ${step.progress.total}…`
                : 'Reading the list…'}
            </AppText>
          </Row>
          <Button label="Cancel" variant="ghost" onPress={() => abort.current?.abort()} />
        </Section>
      ) : (
        <Button
          testID="paste-review-button"
          size="large"
          label={lineCount ? `Review ${lineCount} ${lineCount === 1 ? 'line' : 'lines'}` : 'Review'}
          disabled={lineCount === 0}
          onPress={review}
        />
      )}
    </Screen>
  );
}

function DraftRow({
  draft,
  invalid,
  onToggle,
  onEdit,
}: {
  draft: Draft;
  invalid: boolean;
  onToggle: () => void;
  onEdit: () => void;
}) {
  const theme = useTheme();
  const testID = `paste-row-${draft.lineIndex}`;
  return (
    <View
      testID={testID}
      style={{
        flexDirection: 'row',
        gap: spacing.md,
        padding: spacing.md,
        borderRadius: 10,
        backgroundColor: theme.surface,
        borderWidth: invalid ? 1 : 0,
        borderColor: theme.danger,
      }}
    >
      <Pressable
        testID={`${testID}-toggle`}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: draft.include }}
        accessibilityLabel={`Import ${draft.fields.lemma || draft.raw}`}
        onPress={onToggle}
        hitSlop={8}
        style={{ paddingTop: 2 }}
      >
        <AppText
          variant="heading"
          style={{ color: draft.include ? theme.primary : theme.textMuted }}
        >
          {draft.include ? '☑' : '☐'}
        </AppText>
      </Pressable>
      <Pressable
        testID={`${testID}-edit`}
        accessibilityRole="button"
        accessibilityHint="Edit this row"
        onPress={onEdit}
        style={{ flex: 1, gap: 2 }}
      >
        <AppText variant="label">
          {draft.fields.lemma ? displayLemma(draft.fields) : draft.raw}
          <AppText variant="caption"> · {draft.fields.kind}</AppText>
        </AppText>
        <AppText variant="caption" numberOfLines={2}>
          {draft.fields.kind === 'noun' && draft.fields.plural
            ? `Pl. ${draft.fields.plural} · `
            : ''}
          {draft.fields.kind === 'verb' && draft.fields.verbParticiple
            ? `${draft.fields.verbAuxiliary === 'sein' ? 'ist' : 'hat'} ${draft.fields.verbParticiple} · `
            : ''}
          {draft.fields.meanings.join('; ') || 'No meaning yet'}
        </AppText>
        <FlagList flags={draft.flags} />
        {invalid ? (
          <AppText variant="caption" color="danger">
            {validateFields(draft.fields)[0]}
          </AppText>
        ) : null}
      </Pressable>
    </View>
  );
}

function EditRow({
  draft,
  onDone,
  onCancel,
}: {
  draft: Draft;
  onDone: (draft: Draft) => void;
  onCancel: () => void;
}) {
  const { db } = useServices();
  const [current, setCurrent] = useState(draft);
  return (
    <Screen
      testID="paste-edit"
      footer={
        <>
          <UmlautBar />
          <Row style={{ padding: spacing.lg }}>
            <Button
              testID="paste-edit-done"
              label="Done"
              onPress={() =>
                onDone({
                  ...current,
                  include:
                    current.include ||
                    (draft.status !== 'ok' && validateFields(current.fields).length === 0),
                })
              }
            />
            <Button label="Cancel" variant="ghost" onPress={onCancel} />
          </Row>
        </>
      }
    >
      <AppText variant="caption">Line: {draft.raw}</AppText>
      <DraftForm
        fields={current.fields}
        flags={current.flags}
        onChange={(fields) => setCurrent(refreshDraft(db, current, fields))}
      />
    </Screen>
  );
}
