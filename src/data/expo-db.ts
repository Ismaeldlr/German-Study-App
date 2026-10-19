import { drizzle, type ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync } from 'expo-sqlite';

import * as schema from './schema';

export const DB_NAME = 'german-study.db';

let instance: ExpoSQLiteDatabase<typeof schema> | null = null;

/** The app's database, opened once. */
export function getAppDb(): ExpoSQLiteDatabase<typeof schema> {
  if (!instance) {
    const sqlite = openDatabaseSync(DB_NAME);
    sqlite.execSync('PRAGMA journal_mode = WAL;');
    sqlite.execSync('PRAGMA foreign_keys = ON;');
    instance = drizzle(sqlite, { schema });
  }
  return instance;
}
