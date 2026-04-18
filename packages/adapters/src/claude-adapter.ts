import type { ILLMAdapter, LLMMessage, LLMCompletion, LLMCompletionOptions } from './llm-adapter.js';

interface AnthropicMessage {
  id: string;
  content: Array<{ type: string; text?: string; name?: string; input?: unknown }>;
  model: string;
  stop_reason: string;
  usage: { input_tokens: number; output_tokens: number };
}

export interface ClaudeAdapterConfig {
  apiKey: string;
  defaultModel?: string;
  baseUrl?: string;
}

export class ClaudeAdapter implements ILLMAdapter {
  private readonly apiKey: string;
  private readonly defaultModel: string;
  private readonly baseUrl: string;

  constructor(cfg: ClaudeAdapterConfig) {
    this.apiKey = cfg.apiKey;
    this.defaultModel = cfg.defaultModel ?? 'claude-sonnet-4-6';
    this.baseUrl = cfg.baseUrl ?? 'https://api.anthropic.com';
  }

  async complete(messages: LLMMessage[], opts?: LLMCompletionOptions): Promise<LLMCompletion> {
    const systemMsg = messages.find(m => m.role === 'system');
    const userMsgs = messages.filter(m => m.role !== 'system');

    const body: Record<string, unknown> = {
      model: opts?.model ?? this.defaultModel,
      max_tokens: opts?.maxTokens ?? 4096,
      messages: userMsgs,
      ...(systemMsg ? { system: systemMsg.content } : {}),
      ...(opts?.temperature !== undefined ? { temperature: opts.temperature } : {}),
      ...(opts?.tools ? { tools: opts.tools.map(t => ({
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema,
      })) } : {}),
      ...(opts?.toolChoice ? { tool_choice: { type: 'tool', name: opts.toolChoice } } : {}),
    };

    const resp = await fetch(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Claude API error ${resp.status}: ${text}`);
    }

    const data = await resp.json() as AnthropicMessage;

    const textContent = data.content
      .filter(b => b.type === 'text')
      .map(b => b.text ?? '')
      .join('');

    const toolUses = data.content
      .filter(b => b.type === 'tool_use')
      .map(b => ({ toolName: b.name ?? '', toolInput: (b.input ?? {}) as Record<string, unknown> }));

    return {
      content: textContent,
      model: data.model,
      inputTokens: data.usage.input_tokens,
      outputTokens: data.usage.output_tokens,
      toolUses: toolUses.length > 0 ? toolUses : undefined,
      stopReason: data.stop_reason === 'tool_use' ? 'tool_use'
        : data.stop_reason === 'max_tokens' ? 'max_tokens'
        : 'end_turn',
    };
  }

  async *stream(messages: LLMMessage[], opts?: LLMCompletionOptions): AsyncIterable<string> {
    const systemMsg = messages.find(m => m.role === 'system');
    const userMsgs = messages.filter(m => m.role !== 'system');

    const body = {
      model: opts?.model ?? this.defaultModel,
      max_tokens: opts?.maxTokens ?? 4096,
      stream: true,
      messages: userMsgs,
      ...(systemMsg ? { system: systemMsg.content } : {}),
    };

    const resp = await fetch(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok || !resp.body) throw new Error(`Claude stream error ${resp.status}`);

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      for (const line of chunk.split('\n')) {
        if (!line.startsWith('data: ')) continue;
        const json = line.slice(6).trim();
        if (json === '[DONE]') return;
        try {
          const ev = JSON.parse(json) as { type: string; delta?: { type: string; text?: string } };
          if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') {
            yield ev.delta.text ?? '';
          }
        } catch { /* skip malformed lines */ }
      }
    }
  }
}
