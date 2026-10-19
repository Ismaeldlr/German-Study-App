import { fireEvent, screen } from '@testing-library/react-native';

import { getSetting, setSetting } from '@/data/repos/settings';
import { recentUsage } from '@/data/repos/usage';
import { completion, createFakeFetch } from '@/llm/testing/fake-fetch';

import { createTestServices, renderWithServices } from '../testing/render-with-services';
import { SettingsScreen } from './SettingsScreen';

describe('Settings screen', () => {
  it('saves the API key to secure storage, masked on screen', async () => {
    const services = await renderWithServices(<SettingsScreen />);

    const save = await screen.findByRole('button', { name: 'Save key' });
    expect(save).toBeDisabled();
    await fireEvent.changeText(screen.getByLabelText('API key'), '  sk-secret-1234 ');
    await fireEvent.press(save);

    expect(await screen.findByText('Saved in secure storage: ••••1234')).toBeOnTheScreen();
    expect(await services.keyStore.get('openai')).toBe('sk-secret-1234');
    expect(screen.queryByText(/sk-secret/)).not.toBeOnTheScreen();
  });

  it('keeps keys per provider and can remove one', async () => {
    const services = await createTestServices();
    await services.keyStore.set('deepseek', 'ds-key-9999');
    await renderWithServices(<SettingsScreen />, services);

    expect(await screen.findByLabelText('API key')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('radio', { name: 'DeepSeek' }));
    expect(getSetting(services.db, 'llm.provider')).toBe('deepseek');
    expect(await screen.findByText('Saved in secure storage: ••••9999')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Remove' }));
    expect(await screen.findByLabelText('API key')).toBeOnTheScreen();
    expect(await services.keyStore.get('deepseek')).toBeNull();
  });

  it('runs Test connection and shows the tokens it logged', async () => {
    const fake = createFakeFetch([completion('OK', { prompt_tokens: 14, completion_tokens: 1 })]);
    const services = await createTestServices({ fetch: fake.fetch });
    setSetting(services.db, 'llm.model', 'gpt-test');
    setSetting(services.db, 'llm.prices', { 'gpt-test': { input: 1, output: 4 } });
    await services.keyStore.set('openai', 'sk-test');
    await renderWithServices(<SettingsScreen />, services);

    await fireEvent.press(await screen.findByRole('button', { name: 'Test connection' }));

    expect(await screen.findByText(/Connected to gpt-test-2026-01-01 in \d+ ms/)).toBeOnTheScreen();
    expect(screen.getByText(/Reply: OK · 14 in \/ 1 out tokens/)).toBeOnTheScreen();
    expect(fake.calls[0].url).toBe('https://api.openai.com/v1/chat/completions');
    expect(recentUsage(services.db)[0]).toMatchObject({
      model: 'gpt-test',
      tokensIn: 14,
      tokensOut: 1,
    });
    expect(screen.getByTestId('usage-month')).toHaveTextContent(
      '<$0.0001 of $2.00 · 1 call · 14 in / 1 out tokens',
    );
  });

  it('explains what is missing when Test connection cannot run', async () => {
    await renderWithServices(<SettingsScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Test connection' }));
    expect(await screen.findByText('No API key saved for this provider.')).toBeOnTheScreen();
  });

  it('stores prices for the effective model and accepts a decimal comma', async () => {
    const services = await renderWithServices(<SettingsScreen />);
    expect(await screen.findByTestId('price-warning')).toBeOnTheScreen();

    await fireEvent.changeText(screen.getByLabelText('Input'), '0,4');
    await fireEvent.changeText(screen.getByLabelText('Output'), '1.6');
    expect(getSetting(services.db, 'llm.prices')).toEqual({
      'gpt-4.1-mini': { input: 0.4, output: 1.6 },
    });
    expect(screen.queryByTestId('price-warning')).not.toBeOnTheScreen();

    await fireEvent.changeText(screen.getByLabelText('Monthly cap (USD)'), 'two');
    expect(screen.getByText('Enter a number, like 0.15')).toBeOnTheScreen();
    expect(getSetting(services.db, 'llm.monthlyCap')).toBe(2);
  });

  it('asks for a base URL with the custom provider', async () => {
    const services = await renderWithServices(<SettingsScreen />);
    await fireEvent.press(await screen.findByRole('radio', { name: 'Custom' }));
    await fireEvent.changeText(screen.getByLabelText('Base URL'), ' http://10.0.2.2:8787/v1 ');
    expect(getSetting(services.db, 'llm.customBaseUrl')).toBe('http://10.0.2.2:8787/v1');
  });
});
