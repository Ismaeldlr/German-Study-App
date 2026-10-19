import { fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import { createChapter } from '@/data/repos/chapters';
import { createItem, listDeck } from '@/data/repos/items';
import { setSetting } from '@/data/repos/settings';
import { itemInput } from '@/data/testing/fixtures';
import { createMockLlmFetch } from '@/llm/testing/mock-llm-fetch';
import { UmlautProvider } from '@/ui/umlaut';

import { createTestServices, renderWithServices } from '../testing/render-with-services';
import { AddWordScreen } from './AddWordScreen';

async function setup() {
  const fake = createMockLlmFetch();
  const services = await createTestServices({ fetch: fake.fetch });
  setSetting(services.db, 'llm.model', 'mock-mini');
  await services.keyStore.set('openai', 'sk-test');
  return { services, fake };
}

const render = (services: Awaited<ReturnType<typeof setup>>['services']) =>
  renderWithServices(
    <UmlautProvider>
      <AddWordScreen />
    </UmlautProvider>,
    services,
  );

describe('Add word screen', () => {
  it('looks up an inflected form, previews it and saves it to the current chapter', async () => {
    const { services, fake } = await setup();
    const chapter = createChapter(services.db, { number: 1, title: 'Wohnen', themes: [] });
    setSetting(services.db, 'study.currentChapterId', chapter);
    await render(services);

    await fireEvent.changeText(screen.getByLabelText('Word or phrase'), 'zog um');
    await fireEvent.press(screen.getByRole('button', { name: 'Look up' }));

    expect(await screen.findByText('Check before saving')).toBeOnTheScreen();
    expect(screen.getByLabelText('German')).toHaveDisplayValue('umziehen');
    expect(screen.getByLabelText('Präteritum (er/sie/es)')).toHaveDisplayValue('zog um');
    expect(screen.getByLabelText('Partizip II')).toHaveDisplayValue('umgezogen');
    expect(fake.calls).toHaveLength(1);

    await fireEvent.press(screen.getByRole('button', { name: 'Save to deck' }));
    expect(await screen.findByText('Added umziehen to your deck.')).toBeOnTheScreen();
    const [row] = listDeck(services.db);
    expect(row.item).toMatchObject({
      lemma: 'umziehen',
      verbAuxiliary: 'sein',
      chapterId: chapter,
    });
  });

  it('shows the Wiktionary flag and lets you fix the article', async () => {
    const { services } = await setup();
    await render(services);
    await fireEvent.changeText(screen.getByLabelText('Word or phrase'), 'Garten');
    await fireEvent.press(screen.getByRole('button', { name: 'Look up' }));

    expect(
      await screen.findAllByText(/Wiktionary lists this noun as der, not die/),
    ).not.toHaveLength(0);
    await fireEvent.press(screen.getByRole('radio', { name: 'der' }));
    expect(screen.queryByText(/Wiktionary lists this noun/)).not.toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Save to deck' }));
    expect(listDeck(services.db)[0].item).toMatchObject({ lemma: 'Garten', article: 'der' });
  });

  it('asks "did you mean" for a near-miss before calling the LLM', async () => {
    const { services, fake } = await setup();
    const id = createItem(services.db, itemInput(), Date.now());
    await render(services);
    await fireEvent.changeText(screen.getByLabelText('Word or phrase'), 'Wohnug');
    await fireEvent.press(screen.getByRole('button', { name: 'Look up' }));

    expect(await screen.findByText(/Did you mean one of these/)).toBeOnTheScreen();
    expect(fake.calls).toHaveLength(0);
    await fireEvent.press(screen.getByRole('button', { name: 'Open die Wohnung' }));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/item/[id]',
      params: { id: String(id) },
    });

    await fireEvent.press(screen.getByRole('button', { name: 'Look up "Wohnug" anyway' }));
    expect(await screen.findByText('Check before saving')).toBeOnTheScreen();
    expect(fake.calls).toHaveLength(1);
  });

  it('validates a word filled in by hand', async () => {
    const { services } = await setup();
    await render(services);
    await fireEvent.changeText(screen.getByLabelText('Word or phrase'), 'Fenster');
    await fireEvent.press(screen.getByRole('button', { name: 'Fill in by hand' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Save to deck' }));
    expect(screen.getByText('Enter at least one English meaning.')).toBeOnTheScreen();
    expect(screen.getByText(/A noun needs an article/)).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('radio', { name: 'das' }));
    await fireEvent.changeText(screen.getByLabelText('Plural'), 'Fenster');
    await fireEvent.changeText(screen.getByLabelText('English meanings'), 'window');
    await fireEvent.press(screen.getByRole('button', { name: 'Save to deck' }));
    expect(listDeck(services.db)[0].item).toMatchObject({
      lemma: 'Fenster',
      article: 'das',
      meanings: ['window'],
    });
  });

  it('explains when the LLM is not set up', async () => {
    const services = await createTestServices();
    await render(services);
    await fireEvent.changeText(screen.getByLabelText('Word or phrase'), 'Haus');
    await fireEvent.press(screen.getByRole('button', { name: 'Look up' }));
    expect(await screen.findByText('No API key saved for this provider.')).toBeOnTheScreen();
  });

  it('types umlauts from the bar into the focused field', async () => {
    const { services } = await setup();
    await render(services);
    const input = screen.getByLabelText('Word or phrase');
    await fireEvent(input, 'focus');
    await fireEvent.changeText(input, 'K');
    await fireEvent.press(screen.getByRole('button', { name: 'Insert ü' }));
    expect(screen.getByLabelText('Word or phrase')).toHaveDisplayValue('Kü');
    // Typing in the middle: the bar inserts at the cursor.
    await fireEvent(screen.getByLabelText('Word or phrase'), 'selectionChange', {
      nativeEvent: { selection: { start: 1, end: 1 } },
    });
    await fireEvent.press(screen.getByRole('button', { name: 'Insert ß' }));
    expect(screen.getByLabelText('Word or phrase')).toHaveDisplayValue('Kßü');
    await fireEvent(screen.getByLabelText('Word or phrase'), 'blur');
    expect(screen.queryByTestId('umlaut-bar')).not.toBeOnTheScreen();
  });
});
