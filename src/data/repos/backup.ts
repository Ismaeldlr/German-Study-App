import { getTableName, sql } from 'drizzle-orm';
import { z } from 'zod';

import { encodeSetting } from '@/core/settings';

import { notifyChange, type TableName } from '../changes';
import type { Db } from '../db';
import {
  card,
  chapter,
  chat,
  exercise,
  grammarNote,
  item,
  llmUsage,
  mistake,
  pendingGrade,
  review,
  settings,
  studySession,
  suggestion,
} from '../schema';

/**
 * Whole-database backup as JSON. The API key lives in secure storage, not
 * in the database, so it can never end up in an export.
 */

export const BACKUP_FORMAT = 'german-study-backup';
export const BACKUP_VERSION = 1;

// Parents before children, so foreign keys hold while restoring.
const TABLES = [
  chapter,
  item,
  grammarNote,
  card,
  review,
  mistake,
  exercise,
  pendingGrade,
  suggestion,
  studySession,
  chat,
  llmUsage,
  settings,
] as const;

export type BackupTables = Record<string, Record<string, unknown>[]>;

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  tables: BackupTables;
}

const backupSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.number().int().min(1).max(BACKUP_VERSION),
  exportedAt: z.string(),
  tables: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))),
});

export function exportBackup(db: Db, now: Date): BackupFile {
  const tables: BackupTables = {};
  for (const table of TABLES) {
    tables[getTableName(table)] = db.select().from(table).all() as Record<string, unknown>[];
  }
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: now.toISOString(), tables };
}

export interface BackupSummary {
  exportedAt: string;
  counts: Record<string, number>;
}

/** Validate a parsed backup file before anything is touched. Throws a readable error. */
export function readBackup(data: unknown): { file: BackupFile; summary: BackupSummary } {
  const parsed = backupSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error('This file is not a German Study backup, or it is damaged.');
  }
  const known = new Set<string>(TABLES.map((t) => getTableName(t)));
  const unknown = Object.keys(parsed.data.tables).filter((name) => !known.has(name));
  if (unknown.length) throw new Error(`Unknown tables in backup: ${unknown.join(', ')}`);
  const counts = Object.fromEntries(
    Object.entries(parsed.data.tables).map(([name, rows]) => [name, rows.length]),
  );
  return {
    file: parsed.data as BackupFile,
    summary: { exportedAt: parsed.data.exportedAt, counts },
  };
}

/** Replace everything with the backup's contents, all or nothing. */
export function restoreBackup(db: Db, file: BackupFile): void {
  db.transaction((tx) => {
    for (const table of [...TABLES].reverse()) tx.delete(table).run();
    for (const table of TABLES) {
      const rows = file.tables[getTableName(table)] ?? [];
      for (let i = 0; i < rows.length; i += 50) {
        tx.insert(table)
          .values(rows.slice(i, i + 50) as any)
          .run();
      }
    }
    // Restored rows must satisfy every foreign key, or the restore is undone.
    const broken = tx.all(sql`PRAGMA foreign_key_check`);
    if (broken.length) throw new Error('The backup has rows that point at missing data.');
    // The file is itself an export, so the restored deck was last backed up when it was made.
    // Its own stored value is from the export before it.
    const exportedAt = Date.parse(file.exportedAt);
    if (Number.isFinite(exportedAt)) {
      const value = encodeSetting('data.lastExportAt', exportedAt);
      tx.insert(settings)
        .values({ key: 'data.lastExportAt', value })
        .onConflictDoUpdate({ target: settings.key, set: { value } })
        .run();
    }
  });
  notifyChange(...(TABLES.map((t) => getTableName(t)) as TableName[]));
}
