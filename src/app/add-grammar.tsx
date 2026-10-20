import { useLocalSearchParams } from 'expo-router';

import { AddGrammarScreen } from '@/features/add/AddGrammarScreen';

export default function AddGrammarRoute() {
  const { name } = useLocalSearchParams<{ name?: string }>();
  return <AddGrammarScreen initialName={name ?? ''} />;
}
