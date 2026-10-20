import { fireEvent, screen } from '@testing-library/react-native';

import { getGrammarPoint } from '@/data/repos/grammar';
import { listDeck } from '@/data/repos/items';
import { setSetting } from '@/data/repos/settings';
import { card } from '@/data/schema';
import { createMockLlmFetch } from '@/llm/testing/mock-llm-fetch';
import { UmlautProvider } from '@/ui/umlaut';

import { createTestServices, renderWithServices } from '../testing/render-with-services';
import { AddGrammarScreen } from './AddGrammarScreen';

async function setup() {
  const fake = createMockLlmFetch();
  const services = await createTestServices({ fetch: fake.fetch });
  setSetting(services.db, 'llm.model', 'mock-mini');
  await services.keyStore.set('openai', 'sk-test');
  return { services, fake };
}

const render = (services: Awaited<ReturnType<typeof setup>>['services'], initialName?: string) =>
  renderWithServices(
    <UmlautProvider>
      <AddGrammarScreen initialName={initialName} />
    </UmlautProvider>,
    services,
  );

describe('Add grammar screen', () => {
  it('writes up a named rule, lets you check it, and saves it with its drill card', async () => {
    const { services, fake } = await setup();
    await render(services);

    await fireEvent.changeText(screen.getByLabelText('Grammar point'), 'Dativ nach mit, bei, von');
    await fireEvent.press(screen.getByRole('button', { name: 'Look up' }));

    expect(await screen.findByText('Check before saving')).toBeOnTheScreen();
    expect(screen.getByLabelText('Rule')).toHaveDisplayValue('Dativ nach mit, bei, von');
    expect(screen.getByLabelText('Examples')).toHaveDisplayValue(
      /Ich fahre mit dem Bus\. = I go by bus\./,
    );
    expect(screen.getByTestId('grammar-category-case_ending')).toBeSelected();
    expect(fake.calls).toHaveLength(1);

    await fireEvent.changeText(screen.getByLabelText('How it works'), 'mit, bei, von: dative.');
    await fireEvent.press(screen.getByTestId('grammar-category-article'));
    await fireEvent.press(screen.getByRole('button', { name: 'Save to deck' }));

    expect(await screen.findByTestId('grammar-saved')).toHaveTextContent(
      /Added Dativ nach mit, bei, von/,
    );
    const [row] = listDeck(services.db);
    expect(row.item.kind).toBe('grammar');
    const point = getGrammarPoint(services.db, row.item.id)!;
    expect(point.note).toMatchObject({
      ruleSummary: 'mit, bei, von: dative.',
      categories: ['case_ending', 'article'],
    });
    expect(
      services.db
        .select()
        .from(card)
        .all()
        .map((c) => c.type),
    ).toEqual(['apply_grammar']);
  });

  it('starts from a suggested name, and can be written by hand', async () => {
    const { services, fake } = await setup();
    await render(services, 'Adjektivdeklination');
    expect(screen.getByLabelText('Grammar point')).toHaveDisplayValue('Adjektivdeklination');

    await fireEvent.press(screen.getByRole('button', { name: 'Write it yourself' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Save to deck' }));
    expect(screen.getByTestId('grammar-errors')).toHaveTextContent(/summary/);

    await fireEvent.changeText(
      screen.getByLabelText('How it works'),
      'Endings follow the article.',
    );
    await fireEvent.changeText(screen.getByLabelText('Examples'), 'ein schöner Tag = a nice day');
    await fireEvent.press(screen.getByRole('button', { name: 'Save to deck' }));
    expect(await screen.findByTestId('grammar-saved')).toBeOnTheScreen();
    expect(fake.calls).toHaveLength(0);
  });

  it('points to a grammar point you already have', async () => {
    const { services } = await setup();
    await render(services);
    await fireEvent.changeText(screen.getByLabelText('Grammar point'), 'Perfekt');
    await fireEvent.press(screen.getByRole('button', { name: 'Look up' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Save to deck' }));

    await fireEvent.changeText(screen.getByLabelText('Grammar point'), 'perfekt ');
    await fireEvent.press(screen.getByRole('button', { name: 'Look up' }));
    expect(await screen.findByTestId('grammar-exists')).toHaveTextContent(/already in your deck/);
  });
});
