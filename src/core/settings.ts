import { z } from 'zod';

/**
 * Every persisted setting, its schema and its default. Values are stored as
 * JSON in the `settings` table. The API key is not a setting: it lives in
 * secure storage and never enters the database or an export.
 */

export const PROVIDER_IDS = ['openai', 'deepseek', 'openrouter', 'custom'] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

const modelPrice = z.object({
  /** USD per million input tokens. */
  input: z.number().min(0),
  /** USD per million output tokens. */
  output: z.number().min(0),
});
export type ModelPrice = z.infer<typeof modelPrice>;

export const settingsSchema = {
  'llm.provider': z.enum(PROVIDER_IDS),
  'llm.model': z.string(),
  'llm.customBaseUrl': z.string(),
  /** Prices keyed by model id, so a per-task model override keeps its own price. */
  'llm.prices': z.record(z.string(), modelPrice),
  /** Hard monthly cap in USD. LLM calls are blocked once it is reached. */
  'llm.monthlyCap': z.number().min(0),
  'study.targetRecall': z.number().min(0.7).max(0.99),
  'study.newItemsBase': z.number().int().min(0).max(100),
  'study.newItemsMax': z.number().int().min(0).max(100),
  /** New items stop for the day when recall over the last 3 days falls below this. */
  'study.newItemsMinRecall': z.number().min(0).max(1),
  /** The Study session ends after this many minutes, or when the work runs out. */
  'study.sessionMinutes': z.number().int().min(1).max(120),
  /** Your own topics; about 30% of generated sentences use one. */
  'study.interests': z.array(z.string()),
  'study.currentChapterId': z.number().int().nullable(),
  /** Daily XP goal; about 30 XP is a minute of study. */
  'study.dailyGoalXp': z.number().int().min(10).max(1000),
  /** Vibrate on right and wrong answers. */
  'ui.haptics': z.boolean(),
  /** One study reminder a day, skipped once you studied. Off until you turn it on. */
  'ui.reminderEnabled': z.boolean(),
  /** Local hour the reminder fires at. */
  'ui.reminderHour': z.number().int().min(0).max(23),
  /** When the last backup was exported, for the weekly nudge. */
  'data.lastExportAt': z.number().nullable(),
} as const;

export type SettingKey = keyof typeof settingsSchema;
export type SettingsValues = { [K in SettingKey]: z.infer<(typeof settingsSchema)[K]> };

export const SETTING_DEFAULTS: SettingsValues = {
  'llm.provider': 'openai',
  'llm.model': '',
  'llm.customBaseUrl': '',
  'llm.prices': {},
  'llm.monthlyCap': 2,
  'study.targetRecall': 0.9,
  'study.newItemsBase': 10,
  'study.newItemsMax': 15,
  'study.newItemsMinRecall': 0.8,
  'study.sessionMinutes': 10,
  'study.interests': [],
  'study.currentChapterId': null,
  'study.dailyGoalXp': 100,
  'ui.haptics': true,
  'ui.reminderEnabled': false,
  'ui.reminderHour': 19,
  'data.lastExportAt': null,
};

export const SETTING_KEYS = Object.keys(settingsSchema) as SettingKey[];

export function isSettingKey(key: string): key is SettingKey {
  return key in settingsSchema;
}

/** Parse a stored JSON string, falling back to the default when it is missing or invalid. */
export function decodeSetting<K extends SettingKey>(
  key: K,
  raw: string | undefined,
): SettingsValues[K] {
  if (raw === undefined) return SETTING_DEFAULTS[key];
  try {
    const parsed = settingsSchema[key].safeParse(JSON.parse(raw));
    return parsed.success ? (parsed.data as SettingsValues[K]) : SETTING_DEFAULTS[key];
  } catch {
    return SETTING_DEFAULTS[key];
  }
}

/** Validate and JSON-encode a value for storage. Throws on invalid input. */
export function encodeSetting<K extends SettingKey>(key: K, value: SettingsValues[K]): string {
  return JSON.stringify(settingsSchema[key].parse(value));
}
