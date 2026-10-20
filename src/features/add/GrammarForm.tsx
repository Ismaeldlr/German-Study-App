import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { formatExamples, parseExamples, type GrammarFields } from '@/core/grammar';
import { MISTAKE_CATEGORIES } from '@/core/model';
import { AppText } from '@/ui/AppText';
import { Chip } from '@/ui/controls';
import { TextField } from '@/ui/TextField';
import { spacing } from '@/ui/theme';
import { GermanField } from '@/ui/umlaut';

import { MISTAKE_LABELS } from '../words/describe';

/** Everything about a grammar point, editable. Used for the add preview and for editing later. */
export function GrammarForm({
  fields,
  onChange,
}: {
  fields: GrammarFields;
  onChange: (fields: GrammarFields) => void;
}) {
  const set = <K extends keyof GrammarFields>(key: K, value: GrammarFields[K]) =>
    onChange({ ...fields, [key]: value });
  const [examplesText, setExamplesText] = useState(formatExamples(fields.examples));

  return (
    <View style={{ gap: 12 }} testID="grammar-form">
      <GermanField
        testID="grammar-name"
        label="Rule"
        placeholder="Dativ nach mit, bei, von"
        value={fields.name}
        onChangeText={(text) => set('name', text)}
      />
      <TextField
        testID="grammar-label"
        label="In a few words (English)"
        placeholder="dative after mit, bei, von"
        value={fields.label}
        onChangeText={(text) => set('label', text)}
      />
      <TextField
        testID="grammar-summary"
        label="How it works"
        value={fields.summary}
        onChangeText={(text) => set('summary', text)}
        multiline
        style={{ minHeight: 88 }}
      />
      <GermanField
        testID="grammar-examples"
        label="Examples"
        placeholder="Ich fahre mit dem Bus. = I go by bus."
        value={examplesText}
        onChangeText={(text) => {
          setExamplesText(text);
          set('examples', parseExamples(text));
        }}
        helper="One per line: German = English."
        multiline
        style={{ minHeight: 100 }}
      />
      <View style={{ gap: 4 }}>
        <AppText variant="label">Mistakes it is about</AppText>
        <AppText variant="caption">
          When these mistakes pile up, the app drills this rule sooner.
        </AppText>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            {MISTAKE_CATEGORIES.filter(
              (c) => c !== 'spelling' && c !== 'wrong_word' && c !== 'capitalization',
            ).map((category) => {
              const selected = fields.categories.includes(category);
              return (
                <Chip
                  key={category}
                  testID={`grammar-category-${category}`}
                  label={MISTAKE_LABELS[category]}
                  selected={selected}
                  onPress={() =>
                    set(
                      'categories',
                      selected
                        ? fields.categories.filter((c) => c !== category)
                        : [...fields.categories, category],
                    )
                  }
                />
              );
            })}
          </View>
        </ScrollView>
      </View>
    </View>
  );
}
