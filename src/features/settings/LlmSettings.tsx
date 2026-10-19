import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { formatCount, formatUsd, parseDecimal, plural } from '@/core/format';
import { PROVIDER_IDS, type ProviderId } from '@/core/settings';
import { getAllSettings, setSetting } from '@/data/repos/settings';
import { monthToDate, recentUsage } from '@/data/repos/usage';
import { maskKey } from '@/llm/key-store';
import { PROVIDER_PRESETS, resolveBaseUrl } from '@/llm/providers/presets';
import { testConnection, type ConnectionResult } from '@/llm/test-connection';
import { describeLlmError } from '@/llm/errors';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { Banner, Row, Section, Segmented } from '@/ui/layout';
import { TextField } from '@/ui/TextField';

import { getLlmClient } from '../llm-client';
import { useServices } from '../services';
import { useLiveQuery } from '../use-live-query';

const PROVIDER_OPTIONS = PROVIDER_IDS.map((id) => ({
  value: id,
  label: PROVIDER_PRESETS[id].label,
}));

export function LlmSettings() {
  const { db } = useServices();
  const settings = useLiveQuery(() => getAllSettings(db), ['settings']);
  const provider = settings['llm.provider'];
  const preset = PROVIDER_PRESETS[provider];
  const effectiveModel = settings['llm.model'].trim() || preset.suggestedModel;
  const baseUrl = resolveBaseUrl(provider, settings['llm.customBaseUrl']);

  const chooseProvider = (next: ProviderId) => {
    if (next === provider) return;
    setSetting(db, 'llm.provider', next);
    // Model ids differ between providers, so start from the new provider's suggestion.
    setSetting(db, 'llm.model', '');
  };

  return (
    <>
      <Section title="LLM provider" testID="llm-section">
        <Segmented
          testID="provider"
          accessibilityLabel="Provider"
          options={PROVIDER_OPTIONS}
          value={provider}
          onChange={chooseProvider}
        />
        {provider === 'custom' ? (
          <TextField
            testID="custom-base-url"
            label="Base URL"
            placeholder="https://example.com/v1"
            keyboardType="url"
            defaultValue={settings['llm.customBaseUrl']}
            onChangeText={(text) => setSetting(db, 'llm.customBaseUrl', text.trim())}
            helper="Any server that speaks the OpenAI chat completions API."
          />
        ) : (
          <AppText variant="caption">Endpoint: {baseUrl}</AppText>
        )}
        <TextField
          key={`model-${provider}`}
          testID="model"
          label="Model"
          placeholder={preset.suggestedModel || 'model-id'}
          defaultValue={settings['llm.model']}
          onChangeText={(text) => setSetting(db, 'llm.model', text.trim())}
          helper={
            preset.suggestedModel
              ? `Leave empty to use ${preset.suggestedModel}.`
              : 'The model id your provider expects.'
          }
        />
        <ApiKeyField key={`key-${provider}`} provider={provider} />
        <TestConnection />
      </Section>
      <CostSettings model={effectiveModel} />
    </>
  );
}

function ApiKeyField({ provider }: { provider: ProviderId }) {
  const { keyStore } = useServices();
  // undefined while loading, null when no key is saved.
  const [saved, setSaved] = useState<string | null | undefined>(undefined);
  const [draft, setDraft] = useState('');
  const [replacing, setReplacing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    keyStore.get(provider).then(
      (key) => alive && setSaved(key),
      () => alive && setSaved(null),
    );
    return () => {
      alive = false;
    };
  }, [keyStore, provider]);

  const save = async () => {
    const key = draft.trim();
    if (!key) return;
    try {
      await keyStore.set(provider, key);
      setSaved(key);
      setDraft('');
      setReplacing(false);
      setError(null);
    } catch (e) {
      setError(`Could not save the key: ${describeLlmError(e)}`);
    }
  };

  const remove = async () => {
    await keyStore.remove(provider);
    setSaved(null);
  };

  if (saved === undefined) return <AppText variant="caption">Loading key…</AppText>;

  if (saved && !replacing) {
    return (
      <View style={{ gap: 8 }}>
        <AppText variant="label">API key</AppText>
        <AppText testID="api-key-saved">Saved in secure storage: {maskKey(saved)}</AppText>
        <Row>
          <Button
            testID="api-key-replace"
            label="Replace"
            variant="secondary"
            onPress={() => setReplacing(true)}
          />
          <Button testID="api-key-remove" label="Remove" variant="ghost" onPress={remove} />
        </Row>
      </View>
    );
  }

  return (
    <View style={{ gap: 8 }}>
      <TextField
        testID="api-key-input"
        label="API key"
        placeholder="Paste your key"
        secureTextEntry
        value={draft}
        onChangeText={setDraft}
        onSubmitEditing={save}
        error={error}
        helper="Stored in the phone's secure storage. Never exported."
      />
      <Row>
        <Button testID="api-key-save" label="Save key" onPress={save} disabled={!draft.trim()} />
        {replacing ? (
          <Button label="Cancel" variant="ghost" onPress={() => setReplacing(false)} />
        ) : null}
      </Row>
    </View>
  );
}

function TestConnection() {
  const services = useServices();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ConnectionResult | null>(null);

  const run = async () => {
    setRunning(true);
    setResult(null);
    try {
      const client = await getLlmClient(services);
      setResult(await testConnection(client));
    } catch (error) {
      setResult({ ok: false, error: describeLlmError(error) });
    } finally {
      setRunning(false);
    }
  };

  return (
    <View style={{ gap: 8 }}>
      <Button
        testID="test-connection"
        label="Test connection"
        variant="secondary"
        loading={running}
        onPress={run}
      />
      {result?.ok ? (
        <Banner tone="success" testID="test-connection-result">
          <AppText color="successText" variant="label">
            Connected to {result.model} in {result.latencyMs} ms
          </AppText>
          <AppText color="successText">
            Reply: {result.reply || '(empty)'} · {result.usage.inputTokens} in /{' '}
            {result.usage.outputTokens} out tokens
          </AppText>
        </Banner>
      ) : result ? (
        <Banner tone="error" testID="test-connection-result">
          <AppText color="errorText">{result.error}</AppText>
        </Banner>
      ) : null}
    </View>
  );
}

function CostSettings({ model }: { model: string }) {
  const { db, now } = useServices();
  const settings = useLiveQuery(() => getAllSettings(db), ['settings']);
  const usage = useLiveQuery(() => monthToDate(db, now()), ['llm_usage']);
  const rows = useLiveQuery(() => recentUsage(db, 5), ['llm_usage']);
  const prices = settings['llm.prices'];
  const price = prices[model];
  const cap = settings['llm.monthlyCap'];

  const setPrice = (field: 'input' | 'output', value: number) => {
    const next = { input: price?.input ?? 0, output: price?.output ?? 0, [field]: value };
    setSetting(db, 'llm.prices', { ...prices, [model]: next });
  };

  return (
    <Section title="Cost" testID="cost-section">
      <AppText variant="caption">
        Prices for {model || 'the selected model'}, in USD per million tokens.
      </AppText>
      <Row style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <DecimalField
            key={`in-${model}`}
            testID="price-input"
            label="Input"
            initial={price?.input}
            onValid={(v) => setPrice('input', v)}
          />
        </View>
        <View style={{ flex: 1 }}>
          <DecimalField
            key={`out-${model}`}
            testID="price-output"
            label="Output"
            initial={price?.output}
            onValid={(v) => setPrice('output', v)}
          />
        </View>
      </Row>
      <DecimalField
        testID="monthly-cap"
        label="Monthly cap (USD)"
        initial={cap}
        onValid={(v) => setSetting(db, 'llm.monthlyCap', v)}
        helper="LLM calls stop once this month's spend reaches the cap."
      />
      {!price || (price.input === 0 && price.output === 0) ? (
        <Banner tone="warning" testID="price-warning">
          <AppText color="warningText">
            Enter this model&apos;s prices so the cap can track what you spend.
          </AppText>
        </Banner>
      ) : null}
      <Button
        testID="open-usage"
        label="Usage and generated content"
        variant="secondary"
        onPress={() => router.push('/usage')}
      />
      <View testID="usage-summary" style={{ gap: 4 }}>
        <AppText variant="label">This month</AppText>
        <AppText testID="usage-month">
          {formatUsd(usage.cost)} of {formatUsd(cap)} · {plural(usage.calls, 'call')} ·{' '}
          {formatCount(usage.tokensIn)} in / {formatCount(usage.tokensOut)} out tokens
        </AppText>
        {rows.map((row) => (
          <AppText key={row.id} variant="caption" testID={`usage-row-${row.id}`}>
            {row.day} · {row.model} · {plural(row.calls, 'call')} · {formatCount(row.tokensIn)} in /{' '}
            {formatCount(row.tokensOut)} out · {formatUsd(row.estimatedCost)}
          </AppText>
        ))}
      </View>
    </Section>
  );
}

function DecimalField({
  label,
  initial,
  onValid,
  testID,
  helper,
}: {
  label: string;
  initial: number | undefined;
  onValid: (value: number) => void;
  testID?: string;
  helper?: string;
}) {
  const [text, setText] = useState(initial === undefined ? '' : String(initial));
  const [error, setError] = useState<string | null>(null);

  const change = (next: string) => {
    setText(next);
    if (next.trim() === '') {
      setError(null);
      return;
    }
    const value = parseDecimal(next);
    if (value === null) {
      setError('Enter a number, like 0.15');
    } else {
      setError(null);
      onValid(value);
    }
  };

  return (
    <TextField
      testID={testID}
      label={label}
      keyboardType="decimal-pad"
      placeholder="0.00"
      value={text}
      onChangeText={change}
      error={error}
      helper={helper}
    />
  );
}
