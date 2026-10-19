/// <reference types="node" />

import path from 'path';

import { drizzle } from 'drizzle-orm/sql-js';
import { migrate } from 'drizzle-orm/sql-js/migrator';
import initSqlJs, { type SqlJsStatic } from 'sql.js';

import type { Db } from '../db';
import * as schema from '../schema';

let sqlJs: Promise<SqlJsStatic> | null = null;

/**
 * An in-memory database with the real migrations applied, for tests. sql.js
 * is SQLite compiled to WebAssembly, so it needs no native build.
 */
export async function createTestDb(): Promise<Db> {
  sqlJs ??= initSqlJs();
  const SQL = await sqlJs;
  const sqlite = new SQL.Database();
  sqlite.run('PRAGMA foreign_keys = ON;');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: path.join(__dirname, '..', 'migrations') });
  return db;
}
