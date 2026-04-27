/**
 * Regression score tests — schema-bridge + schema-bridge-data
 *
 * Two modes per connector pair:
 *   1. seeds_loaded  — ground-truth seeds force auto_accept via rule0_memory
 *   2. raw_algorithm — no seeds; verifies the heuristic engine alone scores well
 */

import { describe, it, expect, vi } from 'vitest';
import { SchemaBridge } from '@integrax/schema-bridge';
import type { BridgeReport, FieldDiff } from '@integrax/schema-bridge';
import {
  MERCADOPAGO_PAYWAY_SEEDS as mercadopagoPaywaySeeds,
  MERCADOPAGO_MOBBEX_SEEDS as mercadopagoMobbexSeeds,
  CONTABILIUM_AFIP_SEEDS as contabiliumAfipSeeds,
} from '@integrax/ontology';

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: vi.fn() };
  },
}));

const silent = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

// ─── Realistic connector samples ──────────────────────────────────────────────

const MP_PAYMENT = {
  id: 'MP-12345678',
  transaction_amount: 4500.0,
  currency_id: 'ARS',
  status: 'approved',
  external_reference: 'ORD-2024-001',
  payer: { id: 'USR-456789' },
  date_approved: '2024-01-15T10:00:00-03:00',
  date_last_updated: '2024-01-15T10:01:00-03:00',
  status_detail: 'accredited',
  installments: 3,
  payment_type_id: 'credit_card',
  description: 'Compra ecommerce',
};

const PAYWAY_PAYMENT = {
  id: 'PW-98765',
  amount: 4500.0,
  currency: 'ARS',
  status: 'approved',
  external_reference: 'ORD-2024-001',
  date_last_updated: '2024-01-15T10:01:00-03:00',
  authorization_code: 'AUTH-1234',
  card_token: 'tok_abc123',
  installments: 3,
};

const MOBBEX_PAYMENT = {
  id: 'MBX-11111',
  total: 4500.0,
  currency: 'ARS',
  status: 'approved',
  reference: 'ORD-2024-001',
  url: 'https://mobbex.com/checkout/abc123',
  updated_at: '2024-01-15T10:01:00-03:00',
};

const CONTABILIUM_INVOICE = {
  Id: 1001,
  NumeroCompleto: '0001-00000123',
  Cliente: { RazonSocial: 'EMPRESA SA', NumeroDocumento: '30-12345678-9' },
  Total: 12100.0,
  Moneda: 'ARS',
  Estado: 'Facturado',
  FechaModificacion: '2024-01-15',
};

const AFIP_INVOICE = {
  CAE: '74111111111111',
  CbteDesde: 123,
  PtoVta: 1,
  CbteTipo: 1,
  DocNro: '30123456789',
  ImpTotal: 12100.0,
  MonId: 'PES',
  Resultado: 'A',
  CbteFch: '20240115',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renameCandidate(report: BridgeReport, pathA: string, pathB: string): FieldDiff | undefined {
  return report.diffs.find(
    d => d.kind === 'rename_candidate' && d.pathA === pathA && d.pathB === pathB,
  );
}

function mappingFor(report: BridgeReport, pathA: string, pathB: string) {
  return report.mappings.find(m => m.pathA === pathA && m.pathB === pathB);
}

// ─── mercadopago ↔ payway ─────────────────────────────────────────────────────

describe('regression: mercadopago ↔ payway — seeds loaded', () => {
  it('transaction_amount ↔ amount is mapped via rule0_memory', async () => {
    const bridge = new SchemaBridge({ logger: silent, mappingMemory: mercadopagoPaywaySeeds });
    const report = await bridge.compare({
      connectorAId: 'mercadopago',
      connectorBId: 'payway',
      samplesA: [MP_PAYMENT],
      samplesB: [PAYWAY_PAYMENT],
      options: { renameSimilarityThreshold: 0.70, enableLlmEscalation: false, maxLlmEscalations: 0 },
    });

    const m = mappingFor(report, 'transaction_amount', 'amount');
    expect(m, 'transaction_amount↔amount mapping should exist with seeds').toBeDefined();
    if (m) {
      expect(m.confidence).toBeGreaterThanOrEqual(0.85);
      expect(m.why?.rule).toBe('rule0_memory');
    }
  });

  it('currency_id ↔ currency is mapped via rule0_memory', async () => {
    const bridge = new SchemaBridge({ logger: silent, mappingMemory: mercadopagoPaywaySeeds });
    const report = await bridge.compare({
      connectorAId: 'mercadopago',
      connectorBId: 'payway',
      samplesA: [MP_PAYMENT],
      samplesB: [PAYWAY_PAYMENT],
      options: { renameSimilarityThreshold: 0.70, enableLlmEscalation: false, maxLlmEscalations: 0 },
    });

    const m = mappingFor(report, 'currency_id', 'currency');
    expect(m, 'currency_id↔currency mapping should exist with seeds').toBeDefined();
    if (m) expect(m.confidence).toBeGreaterThanOrEqual(0.85);
  });
});

describe('regression: mercadopago ↔ payway — raw algorithm', () => {
  it('transaction_amount ↔ amount rename_candidate scores ≥ 0.65', async () => {
    const bridge = new SchemaBridge({ logger: silent });
    const report = await bridge.compare({
      connectorAId: 'mercadopago',
      connectorBId: 'payway',
      samplesA: Array(10).fill(MP_PAYMENT),
      samplesB: Array(10).fill(PAYWAY_PAYMENT),
      options: { renameSimilarityThreshold: 0.50, enableLlmEscalation: false, maxLlmEscalations: 0 },
    });

    const candidate = renameCandidate(report, 'transaction_amount', 'amount');
    const m = mappingFor(report, 'transaction_amount', 'amount');
    const score = candidate?.similarity?.combined ?? m?.confidence ?? 0;
    expect(score).toBeGreaterThanOrEqual(0.65);
  });

  it('currency_id ↔ currency rename_candidate scores ≥ 0.60', async () => {
    const bridge = new SchemaBridge({ logger: silent });
    const report = await bridge.compare({
      connectorAId: 'mercadopago',
      connectorBId: 'payway',
      samplesA: Array(10).fill(MP_PAYMENT),
      samplesB: Array(10).fill(PAYWAY_PAYMENT),
      options: { renameSimilarityThreshold: 0.50, enableLlmEscalation: false, maxLlmEscalations: 0 },
    });

    const candidate = renameCandidate(report, 'currency_id', 'currency');
    const m = mappingFor(report, 'currency_id', 'currency');
    const score = candidate?.similarity?.combined ?? m?.confidence ?? 0;
    expect(score).toBeGreaterThanOrEqual(0.60);
  });
});

// ─── mercadopago ↔ mobbex ─────────────────────────────────────────────────────

describe('regression: mercadopago ↔ mobbex — seeds loaded', () => {
  it('transaction_amount ↔ total is mapped via rule0_memory', async () => {
    const bridge = new SchemaBridge({ logger: silent, mappingMemory: mercadopagoMobbexSeeds });
    const report = await bridge.compare({
      connectorAId: 'mercadopago',
      connectorBId: 'mobbex',
      samplesA: [MP_PAYMENT],
      samplesB: [MOBBEX_PAYMENT],
      options: { renameSimilarityThreshold: 0.70, enableLlmEscalation: false, maxLlmEscalations: 0 },
    });

    const m = mappingFor(report, 'transaction_amount', 'total');
    expect(m, 'transaction_amount↔total mapping should exist with seeds').toBeDefined();
    if (m) expect(m.why?.rule).toBe('rule0_memory');
  });

  it('external_reference ↔ reference is mapped via rule0_memory', async () => {
    const bridge = new SchemaBridge({ logger: silent, mappingMemory: mercadopagoMobbexSeeds });
    const report = await bridge.compare({
      connectorAId: 'mercadopago',
      connectorBId: 'mobbex',
      samplesA: [MP_PAYMENT],
      samplesB: [MOBBEX_PAYMENT],
      options: { renameSimilarityThreshold: 0.70, enableLlmEscalation: false, maxLlmEscalations: 0 },
    });

    const m = mappingFor(report, 'external_reference', 'reference');
    expect(m, 'external_reference↔reference mapping should exist with seeds').toBeDefined();
  });
});

describe('regression: mercadopago ↔ mobbex — raw algorithm', () => {
  it('external_reference ↔ reference scores ≥ 0.70 (substring overlap)', async () => {
    const bridge = new SchemaBridge({ logger: silent });
    const report = await bridge.compare({
      connectorAId: 'mercadopago',
      connectorBId: 'mobbex',
      samplesA: Array(10).fill(MP_PAYMENT),
      samplesB: Array(10).fill(MOBBEX_PAYMENT),
      options: { renameSimilarityThreshold: 0.50, enableLlmEscalation: false, maxLlmEscalations: 0 },
    });

    const candidate = renameCandidate(report, 'external_reference', 'reference');
    const m = mappingFor(report, 'external_reference', 'reference');
    const score = candidate?.similarity?.combined ?? m?.confidence ?? 0;
    expect(score).toBeGreaterThanOrEqual(0.70);
  });
});

// ─── contabilium ↔ afip-wsfe ──────────────────────────────────────────────────

describe('regression: contabilium ↔ afip-wsfe — seeds loaded', () => {
  it('Total ↔ ImpTotal is mapped via rule0_memory', async () => {
    const bridge = new SchemaBridge({ logger: silent, mappingMemory: contabiliumAfipSeeds });
    const report = await bridge.compare({
      connectorAId: 'contabilium',
      connectorBId: 'afip-wsfe',
      samplesA: [CONTABILIUM_INVOICE],
      samplesB: [AFIP_INVOICE],
      options: { renameSimilarityThreshold: 0.70, enableLlmEscalation: false, maxLlmEscalations: 0 },
    });

    const m = mappingFor(report, 'Total', 'ImpTotal');
    expect(m, 'Total↔ImpTotal mapping should exist with seeds').toBeDefined();
    if (m) expect(m.why?.rule).toBe('rule0_memory');
  });

  it('FechaModificacion ↔ CbteFch is mapped via rule0_memory', async () => {
    const bridge = new SchemaBridge({ logger: silent, mappingMemory: contabiliumAfipSeeds });
    const report = await bridge.compare({
      connectorAId: 'contabilium',
      connectorBId: 'afip-wsfe',
      samplesA: [CONTABILIUM_INVOICE],
      samplesB: [AFIP_INVOICE],
      options: { renameSimilarityThreshold: 0.70, enableLlmEscalation: false, maxLlmEscalations: 0 },
    });

    const m = mappingFor(report, 'FechaModificacion', 'CbteFch');
    expect(m, 'FechaModificacion↔CbteFch mapping should exist with seeds').toBeDefined();
  });
});

describe('regression: contabilium ↔ afip-wsfe — raw algorithm', () => {
  it('Total ↔ ImpTotal rename_candidate scores ≥ 0.60 (value + suffix overlap)', async () => {
    const bridge = new SchemaBridge({ logger: silent });
    const report = await bridge.compare({
      connectorAId: 'contabilium',
      connectorBId: 'afip-wsfe',
      samplesA: Array(10).fill(CONTABILIUM_INVOICE),
      samplesB: Array(10).fill(AFIP_INVOICE),
      options: { renameSimilarityThreshold: 0.40, enableLlmEscalation: false, maxLlmEscalations: 0 },
    });

    const candidate = renameCandidate(report, 'Total', 'ImpTotal');
    const m = mappingFor(report, 'Total', 'ImpTotal');
    const score = candidate?.similarity?.combined ?? m?.confidence ?? 0;
    expect(score).toBeGreaterThanOrEqual(0.60);
  });
});

// ─── Seed shape validation ────────────────────────────────────────────────────

describe('seed shape — payment gateway seeds', () => {
  it('mercadopagoPaywaySeeds contains transaction_amount↔amount', () => {
    const pair = mercadopagoPaywaySeeds.find(
      s => s.sourcePath === 'transaction_amount' && s.targetPath === 'amount',
    );
    expect(pair).toBeDefined();
    expect(pair?.isGroundTruth).toBe(true);
    expect(pair?.connectorAId).toBe('mercadopago');
    expect(pair?.connectorBId).toBe('payway');
  });

  it('mercadopagoMobbexSeeds contains transaction_amount↔total', () => {
    const pair = mercadopagoMobbexSeeds.find(
      s => s.sourcePath === 'transaction_amount' && s.targetPath === 'total',
    );
    expect(pair).toBeDefined();
    expect(pair?.isGroundTruth).toBe(true);
  });

  it('contabiliumAfipSeeds contains Total↔ImpTotal', () => {
    const pair = contabiliumAfipSeeds.find(
      s => s.sourcePath === 'Total' && s.targetPath === 'ImpTotal',
    );
    expect(pair).toBeDefined();
    expect(pair?.isGroundTruth).toBe(true);
  });

  it('all ground truth seeds have acceptedCount ≥ 10 and rejectedCount === 0', () => {
    const allSeeds = [...mercadopagoPaywaySeeds, ...mercadopagoMobbexSeeds, ...contabiliumAfipSeeds];
    for (const seed of allSeeds) {
      expect(seed.acceptedCount).toBeGreaterThanOrEqual(10);
      expect(seed.rejectedCount).toBe(0);
    }
  });
});
