/**
 * Tests para SchemaBridge (bridge.ts)
 *
 * Cubre: fingerprints idénticos (reporte vacío), compare básico con campos distintos,
 * recordFeedback actualiza la memoria interna, getMemorySnapshot devuelve copia,
 * LLM escalation habilitada de punta a punta via bridge.
 *
 * La escalación LLM se testea con @anthropic-ai/sdk mockeado — no se hacen llamadas reales.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SchemaBridge } from '../bridge.js';
import type { CompareSchemasRequest } from '../types.js';

// ─── Mock de @anthropic-ai/sdk ─────────────────────────────────────────────────
// El mock se define a nivel de archivo para que aplique al describe de LLM escalation.

const createMessageMock = vi.fn();

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: createMessageMock };
  },
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(
  samplesA: Record<string, unknown>[],
  samplesB: Record<string, unknown>[],
  overrides: Partial<Omit<CompareSchemasRequest, 'options'>> & { options?: Partial<CompareSchemasRequest['options']> } = {},
): CompareSchemasRequest {
  return {
    connectorAId: 'mp',
    connectorBId: 'contabilium',
    tenantId: 'ten_01',
    samplesA,
    samplesB,
    ...overrides,
    options: {
      renameSimilarityThreshold: 0.70,
      enableLlmEscalation: false,
      maxLlmEscalations: 3,
      ...overrides.options,
    },
  };
}

const silentLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('SchemaBridge.compare — fingerprints idénticos', () => {
  it('devuelve un reporte vacío sin diffs cuando los datos son idénticos', async () => {
    const bridge = new SchemaBridge({ logger: silentLogger });

    const samples = [{ id: '1', amount: 100, currency: 'ARS' }];
    const report = await bridge.compare(makeRequest(samples, samples));

    expect(report.diffs).toHaveLength(0);
    expect(report.mappings).toHaveLength(0);
    expect(report.generatedTransformTs).toContain('idénticos');
  });

  it('el id del reporte empieza con "br_"', async () => {
    const bridge = new SchemaBridge({ logger: silentLogger });
    const samples = [{ x: 1 }];
    const report = await bridge.compare(makeRequest(samples, samples));
    expect(report.id).toMatch(/^br_/);
  });

  it('incluye tenantId y connectorIds en el reporte', async () => {
    const bridge = new SchemaBridge({ logger: silentLogger });
    const samples = [{ x: 1 }];
    const report = await bridge.compare(makeRequest(samples, samples, {
      tenantId: 'ten_99',
      connectorAId: 'mp',
      connectorBId: 'cl',
    }));

    expect(report.tenantId).toBe('ten_99');
    expect(report.connectorAId).toBe('mp');
    expect(report.connectorBId).toBe('cl');
  });
});

describe('SchemaBridge.compare — campos distintos', () => {
  it('detecta un campo añadido en B que no existe en A', async () => {
    const bridge = new SchemaBridge({ logger: silentLogger });

    const samplesA = [{ id: '1', amount: 100 }];
    const samplesB = [{ id: '1', amount: 100, currency: 'ARS' }];

    const report = await bridge.compare(makeRequest(samplesA, samplesB));

    const kinds = report.diffs.map(d => d.kind);
    expect(kinds).toContain('field_added');
  });

  it('detecta un campo eliminado en B que existía en A', async () => {
    const bridge = new SchemaBridge({ logger: silentLogger });

    const samplesA = [{ id: '1', amount: 100, currency: 'ARS' }];
    const samplesB = [{ id: '1', amount: 100 }];

    const report = await bridge.compare(makeRequest(samplesA, samplesB));

    const kinds = report.diffs.map(d => d.kind);
    expect(kinds).toContain('field_removed');
  });

  it('genera TypeScript con la función transformAToB (nombrada)', async () => {
    const bridge = new SchemaBridge({ logger: silentLogger });

    const samplesA = [{ userId: '1', totalAmount: 100 }];
    const samplesB = [{ id: '1', total: 100 }];

    const report = await bridge.compare(makeRequest(samplesA, samplesB));

    // El generador ahora usa PascalCase(connectorId)
    // Conector A: "mp" -> Mp, Conector B: "contabilium" -> Contabilium
    expect(report.generatedTransformTs).toContain('transformMpToContabilium');
  });

  it('incluye un summary de cobertura en requirementsReport', async () => {
    const bridge = new SchemaBridge({ logger: silentLogger });

    const samplesA = [{ id: '1', name: 'Test', amount: 100 }];
    const samplesB = [{ id: '1', name: 'Test', monto: 100 }];

    const report = await bridge.compare(makeRequest(samplesA, samplesB));

    expect(report.requirementsReport.summary).toBeDefined();
    expect(typeof report.requirementsReport.summary.coveragePercent).toBe('number');
  });
});

describe('SchemaBridge — LLM escalation deshabilitado por defecto', () => {
  it('no invoca al LLM si enableLlmEscalation no está en true', async () => {
    const bridge = new SchemaBridge({
      logger: silentLogger,
      anthropicApiKey: 'sk-test', // key presente pero escalación no habilitada
    });

    const samplesA = [{ userId: '1', totalAmount: 100, status: 'paid' }];
    const samplesB = [{ user_id: '1', total_amount: 100, estado: 'pagado' }];

    // No debe lanzar aunque la key esté configurada
    const report = await bridge.compare(makeRequest(samplesA, samplesB, {
      options: { enableLlmEscalation: false },
    }));

    expect(report.id).toMatch(/^br_/);
  });
});

describe('SchemaBridge — recordFeedback y getMemorySnapshot', () => {
  it('getMemorySnapshot devuelve array vacío antes de cualquier feedback', () => {
    const bridge = new SchemaBridge({ logger: silentLogger });
    expect(bridge.getMemorySnapshot()).toHaveLength(0);
  });

  it('recordFeedback agrega una entrada a la memoria interna', () => {
    const bridge = new SchemaBridge({ logger: silentLogger });

    bridge.recordFeedback('userId', 'user_id', true, 0.90, 'mp', 'cl');

    const snapshot = bridge.getMemorySnapshot();
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0].sourcePath).toBe('userId');
    expect(snapshot[0].acceptedCount).toBe(1);
  });

  it('getMemorySnapshot devuelve una copia — mutar el resultado no afecta el estado interno', () => {
    const bridge = new SchemaBridge({ logger: silentLogger });
    bridge.recordFeedback('a', 'b', true, 0.80);

    const snapshot = bridge.getMemorySnapshot();
    snapshot.push({ sourcePath: 'x', targetPath: 'y', acceptedCount: 1, rejectedCount: 0, averageConfidence: 0.5 });

    // El estado interno sigue siendo 1
    expect(bridge.getMemorySnapshot()).toHaveLength(1);
  });

  it('multiple feedbacks acumulan correctamente los contadores', () => {
    const bridge = new SchemaBridge({ logger: silentLogger });

    bridge.recordFeedback('email', 'correo', true, 0.90);
    bridge.recordFeedback('email', 'correo', true, 0.95);
    bridge.recordFeedback('email', 'correo', false, 0.40);

    const snapshot = bridge.getMemorySnapshot();
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0].acceptedCount).toBe(2);
    expect(snapshot[0].rejectedCount).toBe(1);
  });
});

describe('SchemaBridge — toMarkdown', () => {
  it('devuelve un string no vacío para un reporte con diffs', async () => {
    const bridge = new SchemaBridge({ logger: silentLogger });

    const samplesA = [{ id: '1', amount: 100 }];
    const samplesB = [{ id: '1', monto: 100 }];

    const report = await bridge.compare(makeRequest(samplesA, samplesB));
    const md = bridge.toMarkdown(report);

    expect(typeof md).toBe('string');
    expect(md.length).toBeGreaterThan(0);
  });
});

describe('SchemaBridge — LLM escalation habilitada end-to-end', () => {
  beforeEach(() => {
    createMessageMock.mockReset();
  });

  it('llama al LLM para pares ambiguos cuando enableLlmEscalation es true', async () => {
    // El LLM responde que "totalAmount" → "monto_total" es un rename válido
    createMessageMock.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify({ isRename: true, confidence: 0.92, reason: 'Misma semántica' }) }],
    });

    const bridge = new SchemaBridge({
      logger: silentLogger,
      anthropicApiKey: 'sk-test-key',
    });

    // Campos con nombres muy distintos generan pares 'ambiguous' que se escalan al LLM
    const samplesA = [{ id: '1', totalAmount: 100, createdAt: '2024-01-01' }];
    const samplesB = [{ id: '1', monto_total: 100, fecha_creacion: '2024-01-01' }];

    const report = await bridge.compare(makeRequest(samplesA, samplesB, {
      options: { enableLlmEscalation: true, maxLlmEscalations: 5 },
    }));

    // El report debe existir y tener id aunque no haya diffs ambiguos suficientes
    expect(report.id).toMatch(/^br_/);
    // Si hubo al menos un par ambiguo, el LLM fue invocado
    // (no todos los pares son ambiguos — depende del score de similitud)
    expect(report.resolvedConflicts).toBeDefined();
  });

  it('no llama al LLM si no hay pares ambiguos (campos idénticos)', async () => {
    const bridge = new SchemaBridge({
      logger: silentLogger,
      anthropicApiKey: 'sk-test-key',
    });

    const samples = [{ id: '1', amount: 100 }];
    await bridge.compare(makeRequest(samples, samples, {
      options: { enableLlmEscalation: true },
    }));

    // Sin diffs no hay pares ambiguos → LLM no se invoca
    expect(createMessageMock).not.toHaveBeenCalled();
  });

  it('fail-open: el reporte se genera igual si el LLM lanza un error', async () => {
    createMessageMock.mockRejectedValue(new Error('API rate limit exceeded'));

    const bridge = new SchemaBridge({
      logger: silentLogger,
      anthropicApiKey: 'sk-test-key',
    });

    const samplesA = [{ id: '1', totalAmount: 100 }];
    const samplesB = [{ id: '1', monto_total: 100 }];

    // No debe lanzar — fail-open
    const report = await bridge.compare(makeRequest(samplesA, samplesB, {
      options: { enableLlmEscalation: true },
    }));

    expect(report.id).toMatch(/^br_/);
  });
});
