/**
 * LLM Client
 *
 * Cliente para interactuar con Claude API
 */

import Anthropic from '@anthropic-ai/sdk';
import type { LLMConfig, Message, ToolDefinition, ToolResult } from './types';

const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
const DEFAULT_MAX_TOKENS = 4096;

export class LLMClient {
  private client: Anthropic;
  private model: string;
  private maxTokens: number;
  private temperature: number;

  constructor(config: LLMConfig) {
    this.client = new Anthropic({
      apiKey: config.apiKey,
    });
    this.model = config.model || DEFAULT_MODEL;
    this.maxTokens = config.maxTokens || DEFAULT_MAX_TOKENS;
    this.temperature = config.temperature ?? 0.7;
  }

  /**
   * Send a simple message and get a response
   */
  async chat(
    messages: Message[],
    systemPrompt?: string
  ): Promise<string> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      temperature: this.temperature,
      system: systemPrompt,
      messages: messages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    });

    const textBlock = response.content.find((block) => block.type === 'text');
    return textBlock?.type === 'text' ? textBlock.text : '';
  }

  /**
   * Send a message with tools and handle tool calls
   */
  async chatWithTools(
    messages: Message[],
    tools: ToolDefinition[],
    systemPrompt: string,
    executeToolFn: (toolName: string, input: Record<string, unknown>) => Promise<ToolResult>
  ): Promise<{ response: string; toolResults: Array<{ tool: string; result: ToolResult }> }> {
    const toolResults: Array<{ tool: string; result: ToolResult }> = [];

    // Convert our tool format to Anthropic's format
    const anthropicTools = tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.input_schema,
    }));

    let currentMessages: Anthropic.MessageParam[] = messages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    // Loop until we get a final response (no more tool calls)
    while (true) {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        temperature: this.temperature,
        system: systemPrompt,
        tools: anthropicTools,
        messages: currentMessages,
      });

      // Check if there are tool use blocks
      const toolUseBlocks = response.content.filter((block) => block.type === 'tool_use');

      if (toolUseBlocks.length === 0) {
        // No tool calls, return the text response
        const textBlock = response.content.find((block) => block.type === 'text');
        return {
          response: textBlock?.type === 'text' ? textBlock.text : '',
          toolResults,
        };
      }

      // Execute each tool call
      const toolResultContents: Array<{
        type: 'tool_result';
        tool_use_id: string;
        content: string;
      }> = [];

      for (const block of toolUseBlocks) {
        if (block.type === 'tool_use') {
          const result = await executeToolFn(block.name, block.input as Record<string, unknown>);
          toolResults.push({ tool: block.name, result });

          toolResultContents.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify(result),
          });
        }
      }

      // Add assistant response and tool results to messages
      currentMessages = [
        ...currentMessages,
        { role: 'assistant' as const, content: response.content },
        { role: 'user' as const, content: toolResultContents },
      ];
    }
  }

  /**
   * Parse structured JSON from response
   */
  async parseStructured<T>(
    prompt: string,
    systemPrompt: string,
    parseJsonFn: (text: string) => T
  ): Promise<T> {
    const response = await this.chat(
      [{ role: 'user', content: prompt }],
      systemPrompt + '\n\nIMPORTANT: Respond ONLY with valid JSON, no markdown or explanations.'
    );

    // Extract JSON from response (handle potential markdown code blocks)
    let jsonStr = response.trim();
    if (jsonStr.startsWith('```json')) {
      jsonStr = jsonStr.slice(7);
    }
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.slice(3);
    }
    if (jsonStr.endsWith('```')) {
      jsonStr = jsonStr.slice(0, -3);
    }

    return parseJsonFn(jsonStr.trim());
  }

  /**
   * Get embeddings for semantic search (placeholder for future)
   */
  async getEmbeddings(text: string): Promise<number[]> {
    // Note: Claude doesn't have a native embeddings API
    // This would use a different service like Voyage AI or OpenAI
    // For now, return empty array as placeholder
    console.warn('Embeddings not implemented - would use external service');
    return [];
  }
}

// Factory function
export function createLLMClient(config: LLMConfig): LLMClient {
  return new LLMClient(config);
}
