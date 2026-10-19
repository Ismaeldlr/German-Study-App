export type LlmRole = 'system' | 'user' | 'assistant';

export interface LlmMessage {
  role: LlmRole;
  content: string;
}

export interface LlmRequest {
  model: string;
  messages: LlmMessage[];
  maxTokens: number;
  temperature?: number;
  /** Ask the provider for a JSON object reply. */
  json?: boolean;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface TokenCounts {
  inputTokens: number;
  outputTokens: number;
}

export interface LlmResponse {
  text: string;
  /** The model the provider says answered, which can differ from the one requested. */
  model: string;
  usage: TokenCounts;
  latencyMs: number;
  finishReason?: string;
}

/** One adapter per provider API. Adapters only translate; they do not log or budget. */
export interface LlmProvider {
  readonly api: string;
  complete(request: LlmRequest): Promise<LlmResponse>;
}

export interface UsageEntry extends TokenCounts {
  provider: string;
  model: string;
  at: Date;
}

export interface UsageRecorder {
  record(entry: UsageEntry): void;
}

export type BudgetStatus = { allowed: true } | { allowed: false; spent: number; cap: number };

export interface BudgetGuard {
  /** Whether a call with this estimated cost may run. */
  check(estimatedCost: number): BudgetStatus;
}

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;
