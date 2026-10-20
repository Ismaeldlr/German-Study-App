/**
 * A tiny change bus. Repositories call `notifyChange` after every write and
 * screens re-run their queries through `useLiveQuery`. It works the same on
 * the device and in tests, unlike the SQLite update hook.
 */

export type TableName =
  | 'item'
  | 'grammar_note'
  | 'card'
  | 'review'
  | 'mistake'
  | 'exercise'
  | 'pending_grade'
  | 'chapter'
  | 'suggestion'
  | 'session'
  | 'chat'
  | 'llm_usage'
  | 'settings';

type Listener = (tables: readonly TableName[]) => void;

const listeners = new Set<Listener>();

export function notifyChange(...tables: TableName[]): void {
  for (const listener of [...listeners]) listener(tables);
}

export function subscribeToChanges(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
