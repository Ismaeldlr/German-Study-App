import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { validateFields, withNounCheck, type Draft, type DraftFields } from '@/core/drafts';
import { checkNounAgainstList } from '@/data/nouns';
import { getItem, updateItem } from '@/data/repos/items';
import type { ItemRow } from '@/data/schema';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { Banner, Screen, Section } from '@/ui/layout';
import { UmlautBar } from '@/ui/umlaut';

import { DraftForm } from '../add/DraftForm';
import { ChapterPicker } from '../chapters/ChapterPicker';
import { useServices } from '../services';

export function EditItemScreen({ itemId }: { itemId: number }) {
  const { db } = useServices();
  const [item] = useState(() => getItem(db, itemId));
  if (!item) {
    return (
      <Screen>
        <AppText>This word is no longer in your deck.</AppText>
      </Screen>
    );
  }
  return <EditForm item={item} />;
}

function EditForm({ item }: { item: ItemRow }) {
  const { db, now } = useServices();
  const [fields, setFields] = useState<DraftFields>(() => fieldsOf(item));
  const [chapterId, setChapterId] = useState(item.chapterId);
  const [errors, setErrors] = useState<string[]>([]);
  const flags = nounFlags(fields);

  const save = () => {
    const problems = validateFields(fields);
    setErrors(problems);
    if (problems.length) return;
    updateItem(
      db,
      item.id,
      { ...fields, chapterId, tags: item.tags, source: item.source, notes: item.notes },
      now().getTime(),
    );
    router.back();
  };

  return (
    <Screen
      testID="edit-item"
      footer={
        <>
          <UmlautBar />
          <View style={{ padding: 16 }}>
            <Button testID="edit-save" label="Save changes" onPress={save} />
          </View>
        </>
      }
    >
      <Section>
        <DraftForm fields={fields} flags={flags} onChange={setFields} />
        <ChapterPicker value={chapterId} onChange={setChapterId} />
      </Section>
      {errors.length ? (
        <Banner tone="error" testID="edit-errors">
          {errors.map((e) => (
            <AppText key={e} color="errorText">
              {e}
            </AppText>
          ))}
        </Banner>
      ) : null}
    </Screen>
  );
}

function fieldsOf(item: ItemRow): DraftFields {
  return {
    kind: item.kind,
    lemma: item.lemma,
    article: item.article,
    plural: item.plural,
    verbPresent3: item.verbPresent3,
    verbPreterite: item.verbPreterite,
    verbParticiple: item.verbParticiple,
    verbAuxiliary: item.verbAuxiliary,
    separable: item.separable,
    reflexive: item.reflexive,
    governedCase: item.governedCase,
    meanings: item.meanings,
    exampleDe: item.exampleDe,
    exampleEn: item.exampleEn,
  };
}

/** Live Wiktionary check while you edit a noun. */
function nounFlags(fields: DraftFields) {
  if (fields.kind !== 'noun' || !fields.lemma.trim()) return [];
  const draft: Draft = {
    lineIndex: 0,
    raw: '',
    status: 'ok',
    include: true,
    fields,
    flags: [],
    note: null,
  };
  return withNounCheck(draft, checkNounAgainstList(fields)).flags;
}
