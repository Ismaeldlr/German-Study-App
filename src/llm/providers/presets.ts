import type { ProviderId } from '@/core/settings';

export interface ProviderPreset {
  id: ProviderId;
  label: string;
  /** Empty for the custom provider, whose URL comes from settings. */
  baseUrl: string;
  /** A model that is cheap enough for this app, used when the model field is empty. */
  suggestedModel: string;
  /** OpenAI's newer models only accept `max_completion_tokens`. */
  tokenLimitParam: 'max_tokens' | 'max_completion_tokens';
}

export const PROVIDER_PRESETS: Record<ProviderId, ProviderPreset> = {
  openai: {
    id: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    suggestedModel: 'gpt-4.1-mini',
    tokenLimitParam: 'max_completion_tokens',
  },
  deepseek: {
    id: 'deepseek',
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    suggestedModel: 'deepseek-chat',
    tokenLimitParam: 'max_tokens',
  },
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    suggestedModel: 'openai/gpt-4.1-mini',
    tokenLimitParam: 'max_tokens',
  },
  custom: {
    id: 'custom',
    label: 'Custom',
    baseUrl: '',
    suggestedModel: '',
    tokenLimitParam: 'max_tokens',
  },
};

export function resolveBaseUrl(provider: ProviderId, customBaseUrl: string): string {
  const url = provider === 'custom' ? customBaseUrl : PROVIDER_PRESETS[provider].baseUrl;
  return url.trim().replace(/\/+$/, '');
}
