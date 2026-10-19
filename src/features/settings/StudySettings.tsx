import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { parseDecimal } from '@/core/format';
import { chapterLabel, listChapters, parseThemes } from '@/data/repos/chapters';
import { restoreBackup } from '@/data/repos/backup';
import { getAllSettings, setSetting } from '@/data/repos/settings';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { Chip } from '@/ui/controls';
import { Banner, Row, Section } from '@/ui/layout';
import { TextField } from '@/ui/TextField';

import { useStudyStore } from '../study/store';
import { useServices } from '../services';
import { useLiveQuery } from '../use-live-query';
import { pickBackup, shareBackup } from './backup-files';
import { shortDate } from '../words/describe';

export function StudySettings() {
  const { db } = useServices();
  const settings = useLiveQuery(() => getAllSettings(db), ['settings']);
  const chapters = useLiveQuery(() => listChapters(db), ['chapter']);
  const current = settings['study.currentChapterId'];

  return (
    <>
      <Section title="Class" testID="class-section">
        <AppText variant="caption">New words land in the current chapter.</AppText>
        <Row>
          {chapters.map((c) => (
            <Chip
              key={c.id}
              testID={`current-chapter-${c.id}`}
              label={chapterLabel(c)}
              selected={current === c.id}
              onPress={() => setSetting(db, 'study.currentChapterId', c.id)}
            />
          ))}
        </Row>
        <Button
          testID="manage-chapters"
          label="Chapters"
          variant="secondary"
          onPress={() => router.push('/chapters')}
        />
      </Section>
      <Section title="Study" testID="study-section">
        <NumberSetting
          testID="target-recall"
          label="Target recall (%)"
          initial={Math.round(settings['study.targetRecall'] * 100)}
          min={70}
          max={99}
          helper="How sure FSRS should be that you still know a card when it comes back."
          onValid={(v) => setSetting(db, 'study.targetRecall', v / 100)}
        />
        <NumberSetting
          testID="new-items-base"
          label="New words per day"
          initial={settings['study.newItemsBase']}
          min={0}
          max={100}
          integer
          onValid={(v) => setSetting(db, 'study.newItemsBase', v)}
        />
        <NumberSetting
          testID="new-items-max"
          label="Most new words per day"
          initial={settings['study.newItemsMax']}
          min={0}
          max={100}
          integer
          helper="New words per day drop by one for every 10 overdue reviews, down to 0."
          onValid={(v) => setSetting(db, 'study.newItemsMax', v)}
        />
        <NumberSetting
          testID="new-items-min-recall"
          label="Pause new words below recall (%)"
          initial={Math.round(settings['study.newItemsMinRecall'] * 100)}
          min={0}
          max={100}
          integer
          helper="No new words while your recall over the last 3 days is below this."
          onValid={(v) => setSetting(db, 'study.newItemsMinRecall', v / 100)}
        />
        <NumberSetting
          testID="session-minutes"
          label="Session length (minutes)"
          initial={settings['study.sessionMinutes']}
          min={1}
          max={120}
          integer
          onValid={(v) => setSetting(db, 'study.sessionMinutes', v)}
        />
        <InterestsSetting
          initial={settings['study.interests']}
          onChange={(interests) => setSetting(db, 'study.interests', interests)}
        />
      </Section>
    </>
  );
}

function InterestsSetting({
  initial,
  onChange,
}: {
  initial: string[];
  onChange: (interests: string[]) => void;
}) {
  const [text, setText] = useState(initial.join(', '));
  return (
    <TextField
      testID="interests"
      label="Your interests"
      placeholder="Fußball, Kochen, Reisen"
      helper="About 30% of generated sentences pick one of these instead of the chapter's themes."
      value={text}
      autoCorrect={false}
      onChangeText={(next) => {
        setText(next);
        onChange(parseThemes(next));
      }}
    />
  );
}

function NumberSetting({
  label,
  initial,
  min,
  max,
  integer = false,
  helper,
  onValid,
  testID,
}: {
  label: string;
  initial: number;
  min: number;
  max: number;
  integer?: boolean;
  helper?: string;
  onValid: (value: number) => void;
  testID?: string;
}) {
  const [text, setText] = useState(String(initial));
  const [error, setError] = useState<string | null>(null);
  return (
    <TextField
      testID={testID}
      label={label}
      keyboardType={integer ? 'number-pad' : 'decimal-pad'}
      value={text}
      helper={helper}
      error={error}
      onChangeText={(next) => {
        setText(next);
        const value = parseDecimal(next);
        if (value === null || value < min || value > max || (integer && !Number.isInteger(value))) {
          setError(`Enter ${integer ? 'a whole number' : 'a number'} from ${min} to ${max}.`);
          return;
        }
        setError(null);
        onValid(value);
      }}
    />
  );
}

export function DataSettings() {
  const { db, now } = useServices();
  const lastExport = useLiveQuery(() => getAllSettings(db)['data.lastExportAt'], ['settings']);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const exportNow = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await shareBackup(db, now());
    } catch (e) {
      setMessage({ tone: 'error', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  const importNow = async () => {
    setMessage(null);
    try {
      const picked = await pickBackup();
      if (!picked) return;
      const { counts, exportedAt } = picked.summary;
      Alert.alert(
        'Replace your deck?',
        `This backup from ${shortDate(Date.parse(exportedAt))} has ${counts.item ?? 0} words and ${counts.review ?? 0} reviews. Everything on this phone will be replaced. Your API key stays.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Replace',
            style: 'destructive',
            onPress: () => {
              try {
                restoreBackup(db, picked.file);
                useStudyStore.getState().reset();
                setMessage({ tone: 'success', text: `Restored ${counts.item ?? 0} words.` });
              } catch (e) {
                setMessage({ tone: 'error', text: e instanceof Error ? e.message : String(e) });
              }
            },
          },
        ],
      );
    } catch (e) {
      setMessage({ tone: 'error', text: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <Section title="Backup" testID="data-section">
      <AppText variant="caption">
        Your deck lives only on this phone. Exports never include your API key.
        {lastExport ? ` Last export: ${shortDate(lastExport)}.` : ' Never exported.'}
      </AppText>
      <View style={{ gap: 8 }}>
        <Button testID="export-backup" label="Export backup" loading={busy} onPress={exportNow} />
        <Button
          testID="import-backup"
          label="Import backup"
          variant="secondary"
          onPress={importNow}
        />
      </View>
      {message ? (
        <Banner tone={message.tone} testID="data-message">
          <AppText color={message.tone === 'success' ? 'successText' : 'errorText'}>
            {message.text}
          </AppText>
        </Banner>
      ) : null}
    </Section>
  );
}

export function AboutSection() {
  return (
    <Section title="About">
      <AppText variant="caption">
        Noun genders and plurals for the offline check come from Wiktionary, via the german-nouns
        list by gambolputty (CC BY-SA 4.0). No analytics: data leaves the phone only for the LLM
        provider you choose.
      </AppText>
    </Section>
  );
}
