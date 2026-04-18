export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMCompletionOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  /** If provided, forces a specific tool to be called */
  toolChoice?: string;
  tools?: LLMTool[];
}

export interface LLMTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface LLMToolUse {
  toolName: string;
  toolInput: Record<string, unknown>;
}

export interface LLMCompletion {
  content: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  toolUses?: LLMToolUse[];
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens';
}

/** Provider-agnostic LLM interface. Implement for Claude, OpenAI, Ollama, etc. */
export interface ILLMAdapter {
  complete(messages: LLMMessage[], opts?: LLMCompletionOptions): Promise<LLMCompletion>;
  /** Streaming variant — yields text chunks */
  stream?(messages: LLMMessage[], opts?: LLMCompletionOptions): AsyncIterable<string>;
}
