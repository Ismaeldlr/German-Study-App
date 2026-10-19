import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import { localDay } from '@/core/time';
import type { Db } from '@/data/db';
import { exportBackup, readBackup, type BackupFile, type BackupSummary } from '@/data/repos/backup';
import { setSetting } from '@/data/repos/settings';

/** Write the backup to a JSON file and hand it to the share sheet. */
export async function shareBackup(db: Db, now: Date): Promise<void> {
  const data = exportBackup(db, now);
  const file = new File(Paths.cache, `german-study-backup-${localDay(now)}.json`);
  if (file.exists) file.delete();
  file.create();
  file.write(JSON.stringify(data));
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device.');
  }
  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/json',
    dialogTitle: 'Save your German Study backup',
  });
  setSetting(db, 'data.lastExportAt', now.getTime());
}

/** Let you pick a backup file and validate it. Null when you cancel. */
export async function pickBackup(): Promise<{ file: BackupFile; summary: BackupSummary } | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/json', 'text/plain', 'application/octet-stream'],
    // On Android, read the picked content:// URI directly. Expo Go copies picked files outside
    // the app's sandbox, where File refuses to read them.
    copyToCacheDirectory: Platform.OS !== 'android',
  });
  if (result.canceled || !result.assets[0]) return null;
  const text = await new File(result.assets[0].uri).text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error('This file is not a German Study backup, or it is damaged.');
  }
  return readBackup(json);
}
