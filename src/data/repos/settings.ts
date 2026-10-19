import { eq } from 'drizzle-orm';

import {
  decodeSetting,
  encodeSetting,
  isSettingKey,
  SETTING_DEFAULTS,
  type SettingKey,
  type SettingsValues,
} from '@/core/settings';

import { notifyChange } from '../changes';
import type { DbOrTx } from '../db';
import { settings } from '../schema';

export function getSetting<K extends SettingKey>(db: DbOrTx, key: K): SettingsValues[K] {
  const row = db.select().from(settings).where(eq(settings.key, key)).get();
  return decodeSetting(key, row?.value);
}

export function getAllSettings(db: DbOrTx): SettingsValues {
  const values: Record<string, unknown> = { ...SETTING_DEFAULTS };
  for (const row of db.select().from(settings).all()) {
    if (isSettingKey(row.key)) values[row.key] = decodeSetting(row.key, row.value);
  }
  return values as SettingsValues;
}

export function setSetting<K extends SettingKey>(
  db: DbOrTx,
  key: K,
  value: SettingsValues[K],
): void {
  const encoded = encodeSetting(key, value);
  db.insert(settings)
    .values({ key, value: encoded })
    .onConflictDoUpdate({ target: settings.key, set: { value: encoded } })
    .run();
  notifyChange('settings');
}
