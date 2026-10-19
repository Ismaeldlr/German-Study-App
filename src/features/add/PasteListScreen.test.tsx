import { fireEvent, screen, within } from '@testing-library/react-native';

import { createChapter } from '@/data/repos/chapters';
import { createItem, listDeck } from '@/data/repos/items';
import { setSetting } from '@/data/repos/settings';
import { itemInput } from '@/data/testing/fixtures';
import { createMockLlmFetch } from '@/llm/testing/mock-llm-fetch';
import { UmlautProvider } from '@/ui/umlaut';

import { createTestServices, renderWithServices } from '../testing/render-with-services';
import { PasteListScreen } from './PasteListScreen';

const LIST = `Kapitel 1
die Wohnung, -en – flat
der Bahnhof, ¨-e
der Garten, ¨
umziehen, zog um, ist umgezogen
die Miete, -n`;

async function setup() {
  const fake = createMockLlmFetch();
  const services = await createTestServices({ fetch: fake.fetch });
  setSetting(services.db, 'llm.model', 'mock-mini');
  await services.keyStore.set('openai', 'sk-test');
  await renderWithServices(
    <UmlautProvider>
      <PasteListScreen />
    </UmlautProvider>,
    services,
  );
  return { services, fake };
}

describe('Paste list screen', () => {
  it('reviews a pasted list with flags and imports the ticked rows into a chapter', async () => {
    const { services, fake } = await setup();
    const chapter = createChapter(services.db, { number: 3, title: 'Zu Hause', themes: [] });
    createItem(services.db, itemInput({ lemma: 'Miete', plural: 'Mieten', meanings: ['rent'] }), 1);

    await fireEvent.changeText(screen.getByLabelText('Vocabulary list'), LIST);
    await fireEvent.press(screen.getByRole('button', { name: 'Review 6 lines' }));

    expect(await screen.findByTestId('paste-review')).toBeOnTheScreen();
    expect(fake.calls).toHaveLength(1);
    expect(screen.getByTestId('paste-summary')).toHaveTextContent(
      '6 lines, 3 flagged. Tap a row to edit it.',
    );

    // The heading is skipped, the duplicate is unticked.
    expect(screen.getByRole('checkbox', { name: 'Import Kapitel 1' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Import Miete' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Import Wohnung' })).toBeChecked();
    // The list's notation beats the LLM, and the noun list agrees with the list.
    const garten = screen.getByTestId('paste-row-3');
    expect(within(garten).getByText(/The list says der; the LLM said die/)).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: '3. Zu Hause' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Import 4 words' }));

    expect(await screen.findByText('Imported 4 words.')).toBeOnTheScreen();
    const deck = listDeck(services.db, { chapterId: chapter }).map((r) => r.item);
    expect(deck.map((i) => i.lemma).sort()).toEqual(['Bahnhof', 'Garten', 'Wohnung', 'umziehen']);
    expect(deck.find((i) => i.lemma === 'Garten')).toMatchObject({
      article: 'der',
      plural: 'Gärten',
    });
    expect(deck.find((i) => i.lemma === 'Wohnung')?.meanings[0]).toBe('flat');
  });

  it('lets you edit a row before importing', async () => {
    await setup();
    await fireEvent.changeText(screen.getByLabelText('Vocabulary list'), 'die Wohnung, -en');
    await fireEvent.press(screen.getByRole('button', { name: 'Review 1 line' }));
    await fireEvent.press(await screen.findByTestId('paste-row-0-edit'));

    expect(await screen.findByTestId('paste-edit')).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText('English meanings'), 'apartment; flat');
    await fireEvent.press(screen.getByRole('button', { name: 'Done' }));
    expect(await screen.findByText(/apartment; flat/)).toBeOnTheScreen();
  });

  it('blocks import while a ticked row is incomplete', async () => {
    await setup();
    await fireEvent.changeText(screen.getByLabelText('Vocabulary list'), 'die Wohnung');
    await fireEvent.press(screen.getByRole('button', { name: 'Review 1 line' }));
    await fireEvent.press(await screen.findByTestId('paste-row-0-edit'));
    await fireEvent.changeText(screen.getByLabelText('English meanings'), '');
    await fireEvent.press(screen.getByRole('button', { name: 'Done' }));

    expect(await screen.findByTestId('paste-invalid')).toHaveTextContent(
      'Fix 1 ticked row before importing.',
    );
    expect(screen.getByRole('button', { name: 'Import 1 word' })).toBeDisabled();
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Import Wohnung' }));
    expect(screen.getByRole('button', { name: 'Import 0 words' })).toBeDisabled();
  });
});
