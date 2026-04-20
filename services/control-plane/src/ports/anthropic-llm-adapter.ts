/**
 * Anthropic LLM Adapter
 *
 * Implements LLMPort using the @anthropic-ai/sdk.
 * Loaded lazily — the control-plane starts even when the SDK is not installed.
 *
 * To swap to OpenAI/Gemini/local: create a new adapter, wire it in container/llm.ts.
 * Nothing else changes.
 */

import type { LLMPort, LLMRequest, LLMResponse } from './llm-port.js';

type AnthropicSDK = {
  default: new (opts: { apiKey: string }) => {
    messages: {
      create(opts: {
        model: string;
        max_tokens: number;
        system: string;
        messages: Array<{ role: string; content: string }>;
      }): Promise<{ content: Array<{ type: string; text: string }> }>;
    };
  };
};

export class AnthropicLLMAdapter implements LLMPort {
  private readonly apiKey: string | undefined;
  private readonly defaultModel: string;

  constructor(opts?: { apiKey?: string; model?: string }) {
    this.apiKey = opts?.apiKey ?? process.env.ANTHROPIC_API_KEY;
    this.defaultModel = opts?.model ?? process.env.LLM_MODEL ?? 'claude-haiku-4-5-20251001';
  }

  isAvailable(): boolean {
    return Boolean(this.apiKey);
  }

  async complete(req: LLMRequest): Promise<LLMResponse | null> {
    if (!this.apiKey) return null;

    let sdk: AnthropicSDK;
    try {
      sdk = await import('@anthropic-ai/sdk') as AnthropicSDK;
    } catch {
      return null;
    }

    try {
      const client = new sdk.default({ apiKey: this.apiKey });
      const message = await client.messages.create({
        model: req.model ?? this.defaultModel,
        max_tokens: req.maxTokens ?? 512,
        system: req.systemPrompt,
        messages: [{ role: 'user', content: req.userPrompt }],
      });
      const text = message.content[0]?.type === 'text' ? message.content[0].text : '';
      return { text };
    } catch (err) {
      const e = err as { status?: number; statusCode?: number } | null;
      const status = e?.status ?? e?.statusCode ?? 0;
      // Re-throw rate-limit and auth errors so callers can surface them
      if (status === 429 || status === 401) throw err;
      return null;
    }
  }
}
