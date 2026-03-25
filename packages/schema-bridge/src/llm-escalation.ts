/**
 * LLM Escalation — Anthropic call for ambiguous field pair decisions
 *
 * Called from bridge.ts when enableLlmEscalation=true.
 * Only fires for ResolvedConflicts with llmRequired=true (heuristic review + ambiguous).
 * Uses claude-haiku for speed and cost — the decision is binary (same field or not).
 *
 * Each call: ~300 input tokens + 64 output tokens → cheap per pair.
 * maxLlmEscalations caps total spend per compare() call.
 */

import Anthropic from '@anthropic-ai/sdk';
import { ulid } from 'ulid';
import type { ResolvedConflict, TransformSpec } from './types.js';

interface LlmDecision {
  sameField: boolean;
  confidence: number;
  reason: string;
}

function buildPrompt(
  pathA: string,
  pathB: string,
  examplesA: unknown[],
  examplesB: unknown[],
): string {
  // Up to 5 examples per side — enough signal, low token cost.
  const fmtExamples = (vals: unknown[]) =>
    vals.slice(0, 5).map(v => JSON.stringify(v)).join(', ') || '(no samples)';

  return [
    'You are comparing two API schemas from different systems.',
    'Determine if two fields represent the same real-world concept and should be mapped.',
    '',
    `Field from System A: "${pathA}"`,
    `Sample values A: [${fmtExamples(examplesA)}]`,
    '',
    `Field from System B: "${pathB}"`,
    `Sample values B: [${fmtExamples(examplesB)}]`,
    '',
    'Respond with JSON only — no markdown, no explanation outside the JSON.',
    'Write the "reason" field in Spanish.',
    '{',
    '  "sameField": true | false,',
    '  "confidence": 0.0-1.0,',
    '  "reason": "<una oración en español>"',
    '}',
  ].join('\n');
}

function makeRenameMapping(
  pathA: string,
  pathB: string,
  confidence: number,
  reason: string,
): import('./types.js').FieldMapping {
  const transform: TransformSpec = {
    kind: 'rename',
    fromPath: pathA,
    toPath: pathB,
    description: `LLM confirmó renombrado: "${pathA}" → "${pathB}". ${reason}`,
  };
  return {
    id: `map_${ulid()}`,
    pathA,
    pathB,
    transform,
    confidence,
    bidirectional: true,
    decisionReason: 'llm:rename_confirmed',
  };
}

/**
 * Runs LLM escalation for all llmRequired conflicts up to maxEscalations.
 * Returns a new array — confirmed renames are upgraded to deterministic mappings,
 * rejected pairs keep their original resolution with an updated llmReason.
 * Any API error leaves the conflict unchanged (fail-open, not fail-closed).
 */
export async function runLlmEscalations(
  conflicts: ResolvedConflict[],
  apiKey: string,
  maxEscalations: number,
  logger: { info: (...a: unknown[]) => void; warn: (...a: unknown[]) => void },
): Promise<ResolvedConflict[]> {
  const toEscalate = conflicts
    .filter(c => c.llmRequired && c.diff.pathA && c.diff.pathB)
    .slice(0, maxEscalations);

  if (toEscalate.length === 0) return conflicts;

  const client = new Anthropic({ apiKey });

  // Map of "pathA\x00pathB" → updated conflict
  const updated = new Map<string, ResolvedConflict>();

  for (const conflict of toEscalate) {
    const pathA = conflict.diff.pathA!;
    const pathB = conflict.diff.pathB!;
    const examplesA = conflict.diff.nodeA?.examples ?? [];
    const examplesB = conflict.diff.nodeB?.examples ?? [];
    const key = `${pathA}\x00${pathB}`;

    try {
      const message = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 128,
        messages: [{ role: 'user', content: buildPrompt(pathA, pathB, examplesA, examplesB) }],
      });

      const text = message.content[0].type === 'text' ? message.content[0].text.trim() : '';
      const decision: LlmDecision = JSON.parse(text);

      if (decision.sameField) {
        updated.set(key, {
          ...conflict,
          resolution: 'deterministic',
          mapping: makeRenameMapping(pathA, pathB, decision.confidence, decision.reason),
          confidence: decision.confidence,
          llmRequired: false,
          llmReason: decision.reason,
        });
        logger.info({ pathA, pathB, confidence: decision.confidence }, 'LLM confirmed rename');
      } else {
        updated.set(key, {
          ...conflict,
          llmReason: `LLM rechazó el renombrado (${(decision.confidence * 100).toFixed(0)}%): ${decision.reason}`,
        });
        logger.info({ pathA, pathB }, 'LLM rejected rename');
      }
    } catch (err) {
      // Fail-open: keep conflict as-is if LLM call fails
      logger.warn({ err: String(err), pathA, pathB }, 'LLM escalation failed — keeping ambiguous');
    }
  }

  if (updated.size === 0) return conflicts;

  return conflicts.map(c => {
    const key = `${c.diff.pathA ?? ''}\x00${c.diff.pathB ?? ''}`;
    return updated.get(key) ?? c;
  });
}
