/**
 * LLM singleton
 *
 * Exposes a single LLMPort instance to the rest of the control-plane.
 * Swap AnthropicLLMAdapter for any other adapter here — callers never change.
 */

import { AnthropicLLMAdapter } from '../../ports/anthropic-llm-adapter.js';
import type { LLMPort } from '../../ports/llm-port.js';

export const llm: LLMPort = new AnthropicLLMAdapter();
