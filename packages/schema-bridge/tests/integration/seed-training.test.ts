import { describe, it, expect } from 'vitest';
import { SchemaBridge } from '../../src/bridge.js';
import { OpenApiAdapter } from '../../src/adapters/openapi-adapter.js';
import fs from 'fs';
import path from 'path';

describe('Seed Training - Real World OpenAPI', () => {
  const stripeSpecPath = path.join(__dirname, '../fixtures/specs/stripe-api.json');

  it('trains the bridge memory using Stripe OpenAPI spec', async () => {
    // 1. Initial State: Empty memory
    const bridge = new SchemaBridge({ 
      autoAcceptThreshold: 0.95,
      logger: { info: () => {}, warn: () => {}, error: () => {} } 
    });
    expect(bridge.getMemorySnapshot()).toHaveLength(0);

    // 2. Load and Seed
    if (!fs.existsSync(stripeSpecPath)) {
      console.warn('Skipping test: Stripe spec not found. Run dataset-factory.sh first.');
      return;
    }
    
    const content = fs.readFileSync(stripeSpecPath, 'utf8');
    const adapter = new OpenApiAdapter(content);
    
    // Seed for a specific source/target conector pair (e.g., Stripe version A to Stripe version B)
    const seededCount = await bridge.seed(adapter, 'stripe_v1', 'stripe_v2');
    
    expect(seededCount).toBeGreaterThan(100); // Stripe spec is massive
    
    const snapshot = bridge.getMemorySnapshot();
    expect(snapshot.length).toBe(seededCount);
    
    // Check for a known high-confidence field from Stripe
    const chargeId = snapshot.find(e => e.sourcePath.includes('charge.id'));
    expect(chargeId).toBeDefined();
    expect(chargeId?.acceptedCount).toBe(1);
    expect(chargeId?.averageConfidence).toBe(1.0);
  });

  it('improves matching score after seeding (Memory Rule 0)', async () => {
    const bridge = new SchemaBridge({ 
      autoAcceptThreshold: 0.95,
      logger: { info: () => {}, warn: () => {}, error: () => {} } 
    });

    // We manually seed a field 'monto' -> 'amount' to simulate a known business rule trained from a spec
    bridge.recordFeedback('monto', 'amount', true, 1.0, 'erp', 'stripe');

    // Scenario: System A says 'monto', System B says 'amount'.
    // Even if lexical score is low, memory from seeding should trigger Rule 0.
    const report = await bridge.compare({
      connectorAId: 'erp',
      connectorBId: 'stripe',
      samplesA: [{ monto: 100 }],
      samplesB: [{ amount: 100 }],
    });

    const mapping = report.mappings.find(m => m.pathA === 'monto' && m.pathB === 'amount');
    expect(mapping).toBeDefined();
    // In id018, Rule 0 is: b.ontology >= 0.85 && minMargin >= 0.05 && score.combined >= 0.60
    expect(mapping?.decisionReason).toBe('deterministic:rename'); 
  });
});
