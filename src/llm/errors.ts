export type LlmErrorKind =
  | 'no_key'
  | 'not_configured'
  | 'budget'
  | 'auth'
  | 'rate_limit'
  | 'bad_request'
  | 'server'
  | 'network'
  | 'timeout'
  | 'aborted'
  | 'bad_response'
  | 'invalid_output';

export class LlmError extends Error {
  readonly kind: LlmErrorKind;
  readonly status?: number;

  constructor(kind: LlmErrorKind, message: string, status?: number) {
    super(message);
    this.name = 'LlmError';
    this.kind = kind;
    this.status = status;
  }
}

export function isLlmError(error: unknown): error is LlmError {
  return error instanceof LlmError;
}

/** A short English sentence for the UI. */
export function describeLlmError(error: unknown): string {
  if (!isLlmError(error)) return error instanceof Error ? error.message : String(error);
  switch (error.kind) {
    case 'no_key':
      return 'No API key saved for this provider.';
    case 'not_configured':
      return error.message;
    case 'budget':
      return error.message;
    case 'auth':
      return `The provider rejected the API key (${error.status ?? 'auth error'}).`;
    case 'rate_limit':
      return 'The provider is rate limiting requests. Try again in a minute.';
    case 'timeout':
      return 'The provider took too long to answer.';
    case 'network':
      return `Could not reach the provider: ${error.message}`;
    case 'aborted':
      return 'The request was cancelled.';
    default:
      return error.message;
  }
}
