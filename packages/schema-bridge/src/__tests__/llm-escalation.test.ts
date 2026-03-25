/**
 * Tests para llm-escalation.ts
 *
 * Cubre: confirmación de renombrado, rechazo, fail-open ante error de API, límite maxEscalations.
 * El cliente de Anthropic se mockea completamente — no se hacen llamadas reales.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ResolvedConflict } from '../types.js';

// ─── Mock de @anthropic-ai/sdk ────────────────────────────────────────────────

const createMessageMock = vi.fn();

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: createMessageMock };
  },
}));

import { runLlmEscalations } from '../llm-escalation.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeConflict(pathA: string, pathB: string, llmRequired = true): ResolvedConflict {
  return {
    diff: {
      kind: 'rename_candidate',
      pathA,
      pathB,
      nodeA: { path: pathA, type: 'string', examples: ['foo'], nullable: false, businessType: null },
      nodeB: { path: pathB, type: 'string', examples: ['bar'], nullable: false, businessType: null },
      breakingScore: 0.5,
    },
    resolution: 'heuristic',
    mapping: null,
    confidence: 0.6,
    llmRequired,
  };
}

function noopLogger() {
  return { info: vi.fn(), warn: vi.fn() };
}

function llmResponse(sameField: boolean, confidence = 0.9, reason = 'Ambos representan el ID de usuario') {
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({ sameField, confidence, reason }),
    }],
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('runLlmEscalations', () => {
  beforeEach(() => {
    createMessageMock.mockReset();
  });

  it('devuelve el array sin cambios si no hay conflictos llmRequired', async () => {
    const conflicts = [makeConflict('userId', 'user_id', false)];
    const result = await runLlmEscalations(conflicts, 'key-123', 5, noopLogger());
    expect(result).toBe(conflicts); // misma referencia
    expect(createMessageMock).not.toHaveBeenCalled();
  });

  it('actualiza el conflicto a determinístico cuando el LLM confirma el renombrado', async () => {
    createMessageMock.mockResolvedValueOnce(llmResponse(true, 0.92, 'Ambos son el email del cliente'));

    const [result] = await runLlmEscalations(
      [makeConflict('email', 'emailAddress')],
      'key-123', 5, noopLogger(),
    );

    expect(result.resolution).toBe('deterministic');
    expect(result.llmRequired).toBe(false);
    expect(result.confidence).toBe(0.92);
    expect(result.llmReason).toBe('Ambos son el email del cliente');
    expect(result.mapping).not.toBeNull();
    expect(result.mapping?.decisionReason).toBe('llm:rename_confirmed');
  });

  it('actualiza solo llmReason cuando el LLM rechaza el renombrado', async () => {
    createMessageMock.mockResolvedValueOnce(llmResponse(false, 0.85, 'Son conceptos distintos'));

    const original = makeConflict('total', 'subtotal');
    const [result] = await runLlmEscalations([original], 'key-123', 5, noopLogger());

    expect(result.resolution).toBe('heuristic'); // sin cambio
    expect(result.llmRequired).toBe(true);       // sin cambio
    expect(result.llmReason).toContain('LLM rechazó');
    expect(result.mapping).toBeNull();
  });

  it('fail-open: conserva el conflicto sin cambios si la API lanza un error', async () => {
    createMessageMock.mockRejectedValueOnce(new Error('Network error'));

    const original = makeConflict('price', 'monto');
    const [result] = await runLlmEscalations([original], 'key-123', 5, noopLogger());

    expect(result.resolution).toBe('heuristic');
    expect(result.llmReason).toBeUndefined();
    expect(result.mapping).toBeNull();
  });

  it('fail-open: conserva el conflicto si la respuesta no es JSON válido', async () => {
    createMessageMock.mockResolvedValueOnce({ content: [{ type: 'text', text: 'no es json' }] });

    const [result] = await runLlmEscalations([makeConflict('name', 'nombre')], 'key-123', 5, noopLogger());

    expect(result.resolution).toBe('heuristic');
    expect(result.llmReason).toBeUndefined();
  });

  it('respeta maxEscalations y no llama al LLM más veces que el límite', async () => {
    createMessageMock.mockResolvedValue(llmResponse(true));

    const conflicts = [
      makeConflict('a', 'a2'),
      makeConflict('b', 'b2'),
      makeConflict('c', 'c2'),
    ];

    await runLlmEscalations(conflicts, 'key-123', 2, noopLogger());

    expect(createMessageMock).toHaveBeenCalledTimes(2); // solo los primeros 2
  });

  it('no modifica conflictos que no son llmRequired aunque aparezcan en el array', async () => {
    createMessageMock.mockResolvedValue(llmResponse(true));

    const required = makeConflict('email', 'correo', true);
    const notRequired = makeConflict('id', 'identifier', false);

    const [r1, r2] = await runLlmEscalations([required, notRequired], 'key-123', 5, noopLogger());

    expect(r1.resolution).toBe('deterministic'); // escalado
    expect(r2.resolution).toBe('heuristic');      // sin tocar
  });
});
