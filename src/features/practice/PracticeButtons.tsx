import { router } from 'expo-router';

import { nextStory } from '@/data/repos/exercises';
import { Button } from '@/ui/Button';
import { Row } from '@/ui/layout';

import { useServices } from '../services';
import { useLiveQuery } from '../use-live-query';

/**
 * Practice outside the daily session: a mini story or a chat. `replace`
 * swaps the current screen out, so Back goes where it would have gone.
 */
export function PracticeButtons({ replace = false }: { replace?: boolean }) {
  const { db } = useServices();
  const storyWaiting = useLiveQuery(() => nextStory(db) !== null, ['exercise']);
  const go = (path: '/story' | '/chat') => (replace ? router.replace(path) : router.push(path));
  return (
    <Row style={{ flexWrap: 'nowrap' }}>
      <Button
        testID="practice-story"
        style={{ flex: 1 }}
        variant="secondary"
        icon="book-outline"
        label={storyWaiting ? 'Read a story' : 'Story'}
        onPress={() => go('/story')}
      />
      <Button
        testID="practice-chat"
        style={{ flex: 1 }}
        variant="secondary"
        icon="chatbubbles-outline"
        label="Chat"
        onPress={() => go('/chat')}
      />
    </Row>
  );
}
