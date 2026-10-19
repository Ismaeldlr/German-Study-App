import { useLocalSearchParams } from 'expo-router';

import { EditItemScreen } from '@/features/words/EditItemScreen';

export default function EditRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <EditItemScreen key={id} itemId={Number(id)} />;
}
