import { describe, expect, it } from 'vitest';
import { SchemaBridge } from '../../src/bridge.js';
import { SchemaInferrer } from '../../src/schema-inferrer.js';

describe('Deep arrays stability', () => {
  it('captures deep array leaf paths with [*] segments', () => {
    const inferrer = new SchemaInferrer();

    const schema = inferrer.infer([
      {
        order: {
          lines: [
            {
              sub_items: [
                {
                  components: [
                    { id: 'CMP-001', code: 'SKU-001' },
                  ],
                },
              ],
            },
          ],
        },
      },
    ]);

    expect(schema.fields.map(field => field.path)).toContain(
      'order.lines[*].sub_items[*].components[*].id',
    );
    expect(schema.fields.map(field => field.path)).toContain(
      'order.lines[*].sub_items[*].components[*].code',
    );
  });

  it('detects deep leaf renames across four nested array levels under permissive historical threshold', async () => {
    const bridge = new SchemaBridge({
      autoAcceptThreshold: 0.88,
      decisionPolicy: { autoAcceptThreshold: 0.88 },
    });

    const samplesA = Array.from({ length: 5 }, (_, index) => ({
      order: {
        lines: [
          {
            sub_items: [
              {
                components: [
                  { id: `CMP-${index + 1}`, code: `SKU-${index + 1}` },
                ],
              },
            ],
          },
        ],
      },
    }));

    const samplesB = Array.from({ length: 5 }, (_, index) => ({
      salesOrder: {
        items: [
          {
            parts: [
              {
                elements: [
                  { component_id: `CMP-${index + 1}`, sku: `SKU-${index + 1}` },
                ],
              },
            ],
          },
        ],
      },
    }));

    const report = await bridge.compare({
      connectorAId: 'deep-a',
      connectorBId: 'deep-b',
      samplesA,
      samplesB,
      options: {
        renameSimilarityThreshold: 0.70,
        enableLlmEscalation: false,
        maxLlmEscalations: 0,
      },
    });

    expect(
      report.mappings.some(
        mapping =>
          mapping.pathA === 'order.lines[*].sub_items[*].components[*].id' &&
          mapping.pathB === 'salesOrder.items[*].parts[*].elements[*].component_id',
      ),
    ).toBe(true);
  });

  it('auto-accepts pais -> country under strict default 0.95 using iso3 semantics', async () => {
    const bridge = new SchemaBridge();

    const report = await bridge.compare({
      connectorAId: 'latam-source',
      connectorBId: 'latam-target',
      samplesA: [
        { txn_ref: 'T-001', moneda: 'ARS', monto: '15000,00', pais: 'ARG' },
        { txn_ref: 'T-002', moneda: 'BRL', monto: '3200,50', pais: 'BRA' },
        { txn_ref: 'T-003', moneda: 'MXN', monto: '8500,00', pais: 'MEX' },
        { txn_ref: 'T-004', moneda: 'CLP', monto: '22000,00', pais: 'CHL' },
        { txn_ref: 'T-005', moneda: 'COP', monto: '45000,00', pais: 'COL' },
      ],
      samplesB: [
        { transaction_id: 'T-001', currency: 'ARS', amount: '15000.00', country: 'ARG' },
        { transaction_id: 'T-002', currency: 'BRL', amount: '3200.50', country: 'BRA' },
        { transaction_id: 'T-003', currency: 'MXN', amount: '8500.00', country: 'MEX' },
        { transaction_id: 'T-004', currency: 'CLP', amount: '22000.00', country: 'CHL' },
        { transaction_id: 'T-005', currency: 'COP', amount: '45000.00', country: 'COL' },
      ],
    });

    const renameCandidate = report.diffs.find(
      diff => diff.kind === 'rename_candidate' && diff.pathA === 'pais' && diff.pathB === 'country',
    );

    expect(renameCandidate?.similarity?.decision).toBe('auto_accept');
    expect(
      report.mappings.some(mapping => mapping.pathA === 'pais' && mapping.pathB === 'country'),
    ).toBe(true);
  });
});
