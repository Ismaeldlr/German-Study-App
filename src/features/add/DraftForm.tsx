import { useState } from 'react';
import { View } from 'react-native';

import type { DraftFields, DraftFlag, FlagField } from '@/core/drafts';
import type { Article, Auxiliary, GrammaticalCase, ItemKind } from '@/core/model';
import { AppText } from '@/ui/AppText';
import { FlagList, SwitchRow } from '@/ui/controls';
import { Segmented } from '@/ui/layout';
import { TextField } from '@/ui/TextField';
import { GermanField } from '@/ui/umlaut';

const KIND_OPTIONS: { value: Exclude<ItemKind, 'grammar'>; label: string }[] = [
  { value: 'noun', label: 'Noun' },
  { value: 'verb', label: 'Verb' },
  { value: 'adjective', label: 'Adj.' },
  { value: 'adverb', label: 'Adv.' },
  { value: 'phrase', label: 'Phrase' },
];

const ARTICLE_OPTIONS: { value: Article | 'none'; label: string }[] = [
  { value: 'der', label: 'der' },
  { value: 'die', label: 'die' },
  { value: 'das', label: 'das' },
  { value: 'none', label: 'Pl. only' },
];

const AUX_OPTIONS: { value: Auxiliary; label: string }[] = [
  { value: 'haben', label: 'hat' },
  { value: 'sein', label: 'ist' },
];

const CASE_OPTIONS: { value: GrammaticalCase | 'none'; label: string }[] = [
  { value: 'none', label: '–' },
  { value: 'akk', label: 'Akk' },
  { value: 'dat', label: 'Dat' },
  { value: 'gen', label: 'Gen' },
  { value: 'akk_dat', label: 'Akk/Dat' },
];

/**
 * Everything about a word, editable. Used for the add preview, rows of a
 * pasted list, and editing an item later.
 */
export function DraftForm({
  fields,
  onChange,
  flags = [],
}: {
  fields: DraftFields;
  onChange: (fields: DraftFields) => void;
  flags?: DraftFlag[];
}) {
  const set = <K extends keyof DraftFields>(key: K, value: DraftFields[K]) =>
    onChange({ ...fields, [key]: value });
  const flagged = (field: FlagField) =>
    flags.find((f) => f.field === field && f.tone === 'warning')?.message ?? null;
  const [meaningsText, setMeaningsText] = useState(fields.meanings.join('; '));
  const optional = (text: string) => (text.trim() ? text : null);

  return (
    <View style={{ gap: 12 }} testID="draft-form">
      <FlagList flags={flags} testID="draft-flags" />
      <View style={{ gap: 4 }}>
        <AppText variant="label">Word type</AppText>
        <Segmented
          testID="draft-kind"
          accessibilityLabel="Word type"
          options={KIND_OPTIONS}
          value={fields.kind === 'grammar' ? 'phrase' : fields.kind}
          onChange={(kind) => set('kind', kind)}
        />
      </View>
      <GermanField
        testID="draft-lemma"
        label="German"
        value={fields.lemma}
        onChangeText={(text) => set('lemma', text)}
        error={flagged('lemma')}
      />

      {fields.kind === 'noun' ? (
        <>
          <View style={{ gap: 4 }}>
            <AppText variant="label">Article</AppText>
            <Segmented
              testID="draft-article"
              accessibilityLabel="Article"
              options={ARTICLE_OPTIONS}
              value={fields.article ?? 'none'}
              onChange={(value) => set('article', value === 'none' ? null : value)}
            />
            {flagged('article') ? (
              <AppText variant="caption" color="danger">
                {flagged('article')}
              </AppText>
            ) : null}
          </View>
          <GermanField
            testID="draft-plural"
            label="Plural"
            placeholder="Wohnungen"
            value={fields.plural ?? ''}
            onChangeText={(text) => set('plural', optional(text))}
            helper="Leave empty if the noun has no plural."
            error={flagged('plural')}
          />
        </>
      ) : null}

      {fields.kind === 'verb' ? (
        <>
          <GermanField
            testID="draft-present3"
            label="Präsens (er/sie/es)"
            placeholder="zieht um"
            value={fields.verbPresent3 ?? ''}
            onChangeText={(text) => set('verbPresent3', optional(text))}
          />
          <GermanField
            testID="draft-preterite"
            label="Präteritum (er/sie/es)"
            placeholder="zog um"
            value={fields.verbPreterite ?? ''}
            onChangeText={(text) => set('verbPreterite', optional(text))}
          />
          <GermanField
            testID="draft-participle"
            label="Partizip II"
            placeholder="umgezogen"
            value={fields.verbParticiple ?? ''}
            onChangeText={(text) => set('verbParticiple', optional(text))}
            error={flagged('verb')}
          />
          <View style={{ gap: 4 }}>
            <AppText variant="label">Perfekt with</AppText>
            <Segmented
              testID="draft-aux"
              accessibilityLabel="Perfekt helper verb"
              options={AUX_OPTIONS}
              value={fields.verbAuxiliary}
              onChange={(value) => set('verbAuxiliary', value)}
            />
          </View>
          <SwitchRow
            testID="draft-separable"
            label="Separable (zieht … um)"
            value={fields.separable}
            onValueChange={(value) => set('separable', value)}
          />
          <SwitchRow
            testID="draft-reflexive"
            label="Reflexive (sich …)"
            value={fields.reflexive}
            onValueChange={(value) => set('reflexive', value)}
          />
        </>
      ) : null}

      {fields.kind === 'verb' || fields.kind === 'phrase' ? (
        <View style={{ gap: 4 }}>
          <AppText variant="label">Takes the case</AppText>
          <Segmented
            testID="draft-case"
            accessibilityLabel="Case"
            options={CASE_OPTIONS}
            value={fields.governedCase ?? 'none'}
            onChange={(value) => set('governedCase', value === 'none' ? null : value)}
          />
        </View>
      ) : null}

      <TextField
        testID="draft-meanings"
        label="English meanings"
        placeholder="flat; apartment"
        value={meaningsText}
        onChangeText={(text) => {
          setMeaningsText(text);
          set(
            'meanings',
            text
              .split(';')
              .map((m) => m.trim())
              .filter(Boolean),
          );
        }}
        helper="Separate meanings with semicolons."
        error={flagged('meanings')}
      />
      <GermanField
        testID="draft-example-de"
        label="Example (German)"
        value={fields.exampleDe ?? ''}
        onChangeText={(text) => set('exampleDe', optional(text))}
        multiline
        style={{ minHeight: 64 }}
      />
      <TextField
        testID="draft-example-en"
        label="Example (English)"
        value={fields.exampleEn ?? ''}
        onChangeText={(text) => set('exampleEn', optional(text))}
        multiline
        style={{ minHeight: 64 }}
      />
    </View>
  );
}
