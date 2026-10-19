import { useEffect, useMemo, useState } from 'react';

import { subscribeToChanges, type TableName } from '@/data/changes';

/**
 * Run a synchronous query, and run it again whenever one of `tables`
 * changes. The React Compiler memoizes an inline `query` on the values it
 * captures, so a new search term or id re-runs it too.
 */
export function useLiveQuery<T>(query: () => T, tables: readonly TableName[]): T {
  const [version, setVersion] = useState(0);
  const tableKey = tables.join(',');

  useEffect(() => {
    const watched = new Set(tableKey.split(','));
    return subscribeToChanges((changed) => {
      if (changed.some((table) => watched.has(table))) setVersion((v) => v + 1);
    });
  }, [tableKey]);

  return useMemo(() => runAt(version, query), [query, version]);
}

/** `version` only counts writes; taking it as an argument ties the memo to it. */
function runAt<T>(_version: number, query: () => T): T {
  return query();
}
