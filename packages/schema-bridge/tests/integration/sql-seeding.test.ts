import { describe, it, expect } from 'vitest';
import { SchemaBridge } from '../../src/bridge.js';
import { SqlDdlAdapter } from '../../src/adapters/sql-adapter.js';

describe('SQL DDL Seeding Integration', () => {
  it('seeds the bridge memory from a complex SQL schema', async () => {
    const bridge = new SchemaBridge({ autoAcceptThreshold: 0.95 });
    
    const ddl = `
      -- Schema for a legacy ERP system
      CREATE TABLE MA_ARTICULOS (
        COD_ARTICULO INT PRIMARY KEY,
        DESCRIPCION VARCHAR(100) NOT NULL,
        PRECIO_VENTA DECIMAL(10,2),
        FECHA_ALTA TIMESTAMP
      );
    `;
    
    const adapter = new SqlDdlAdapter(ddl);
    const count = await bridge.seed(adapter, 'legacy_erp', 'legacy_erp');
    
    expect(count).toBe(4);
    
    const snapshot = bridge.getMemorySnapshot();
    
    // Check that one of the ERP fields was recorded
    const descField = snapshot.find(e => e.sourcePath === 'descripcion');
    expect(descField).toBeDefined();
    expect(descField?.averageConfidence).toBe(1.0);
    expect(descField?.acceptedCount).toBe(1);
  });

  it('proposes bridge between SQL table and OpenAPI spec', async () => {
    // 1. Setup Bridge
    const bridge = new SchemaBridge({ autoAcceptThreshold: 0.95 });

    // 2. Training: Map ERP field to "human" field in memory
    // In a real scenario, this 'training' would come from an expert or previous successful mapping
    bridge.recordFeedback('ma_articulos.descripcion', 'product_name', true, 1.0, 'erp', 'api');

    // 3. New Comparison: System A (SQL record) vs System B (API request)
    const report = await bridge.compare({
      connectorAId: 'erp',
      connectorBId: 'api',
      samplesA: [{ ma_articulos: { descripcion: 'iPhone 15' } }],
      samplesB: [{ product_name: 'iPhone 15' }],
    });

    const mapping = report.mappings.find(m => m.pathA === 'ma_articulos.descripcion' && m.pathB === 'product_name');
    expect(mapping).toBeDefined();
    expect(mapping?.decision).toBe('auto_accept');
    expect(mapping?.decisionReason).toBe('deterministic:rename'); // Rule 0
  });
});
