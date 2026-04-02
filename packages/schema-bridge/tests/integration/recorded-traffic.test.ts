import { describe, it, expect } from 'vitest';
import { SchemaBridge } from '../../src/bridge.js';
import { WireMockAdapter } from '../../src/adapters/wiremock-adapter.js';
import path from 'path';

describe('WireMock Traffic Seeding', () => {
  const fixturePath = path.join(__dirname, '../fixtures/wiremock');

  it('infers schema from recorded wiremock files', async () => {
    const adapter = new WireMockAdapter(fixturePath);
    const inferred = adapter.adapt();
    
    expect(inferred.sampleCount).toBe(2);
    
    const idField = inferred.fields.find(f => f.path === 'id');
    expect(idField).toBeDefined();
    expect(idField?.node.type).toBe('string');
    
    const metadataOrder = inferred.fields.find(f => f.path === 'metadata.order_id');
    expect(metadataOrder).toBeDefined();
    expect(metadataOrder?.required).toBe(false); // Only in 1 of 2 samples
  });

  it('seeds the bridge memory with real captured traffic', async () => {
    const bridge = new SchemaBridge({ autoAcceptThreshold: 0.95 });
    const adapter = new WireMockAdapter(fixturePath);
    
    const count = await bridge.seed(adapter, 'captured-stripe', 'captured-stripe');
    
    expect(count).toBeGreaterThan(0);
    const snapshot = bridge.getMemorySnapshot();
    
    // The specific 'id' field should be in memory now
    const idEntry = snapshot.find(e => e.sourcePath === 'id' && e.targetPath === 'id');
    expect(idEntry).toBeDefined();
    expect(idEntry?.averageConfidence).toBe(1.0);
  });
});
