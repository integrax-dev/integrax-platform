/**
 * LLM Port
 *
 * Decouples the control-plane from any specific LLM vendor.
 * Route handlers and services depend on this interface — never on the SDK directly.
 *
 * Adding a new provider = one new adapter file. Zero changes to callers.
 */

export interface LLMRequest {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  /** Override the default model. Adapters may ignore this if unsupported. */
  model?: string;
}

export interface LLMResponse {
  text: string;
}

export interface LLMPort {
  /** Returns null when the provider is unavailable (no key, SDK missing, rate-limited). */
  complete(req: LLMRequest): Promise<LLMResponse | null>;
  isAvailable(): boolean;
}
