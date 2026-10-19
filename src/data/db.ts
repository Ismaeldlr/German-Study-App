import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';

import type * as schema from './schema';

/**
 * The database handle every repository takes. Both the app driver
 * (expo-sqlite) and the test driver (sql.js) are synchronous Drizzle
 * databases over the same schema, so repositories run unchanged in Jest.
 */
export type Db = BaseSQLiteDatabase<'sync', any, typeof schema>;

/** A transaction handle or the database itself. */
export type DbOrTx = Parameters<Parameters<Db['transaction']>[0]>[0] | Db;
