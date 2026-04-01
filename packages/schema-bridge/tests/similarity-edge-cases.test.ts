import { describe, it, expect } from 'vitest';
import { SchemaBridge } from '../src/index.js';

describe('Similarity Engine Edge Cases', () => {
  const bridge = new SchemaBridge();

  async function compare(samplesA: any[], samplesB: any[]) {
    return bridge.compare({
      connectorAId: 'sysA',
      connectorBId: 'sysB',
      tenantId: 'test',
      samplesA,
      samplesB,
      options: { renameSimilarityThreshold: 0.2 },
    });
  }

  it('handles Domain Mismatch Structural Collision (prevent false positives)', async () => {
    // Before fix: It auto-accepted customer.id to supplier.id
    const report = await compare(
      [{ customer: { id: "C1", name: "Acme", address: "123 St" } }],
      [{ supplier: { id: "S1", name: "Beta", address: "456 Rd" } }]
    );
    
    // Should NOT auto-accept cross-domain mappings based on deep path collisions alone
    const autoAccepted = report.mappings.filter(m => m.decisionReason === 'deterministic:rename');
    expect(autoAccepted.length).toBe(0);
    
    // They should have been knocked down to rename_candidates or rejected entirely because of the penalty
    const candidates = report.diffs.filter(d => d.kind === 'rename_candidate');
    // If they were rejected entirely, candidates will be empty, which is also fine.
    for (const c of candidates) {
      if (c.pathA?.startsWith('customer') && c.pathB?.startsWith('supplier')) {
        // Because of the root mismatch, score should be significantly lower than the critical auto-accept threshold
        expect(c.similarity!.combined).toBeLessThan(0.8);
      }
    }
  });

  it('handles LatAm Decimal Normalization', async () => {
    const report = await compare(
      [{ amount: "1.234,56", date: "31/12/2025" }],
      [{ amount_total: 1234.56, created_at: "2025-12-31" }]
    );
    
    // Value similarity should now correctly identify and boost the similarity of amount -> amount_total
    const candidates = report.diffs.filter(d => d.kind === 'rename_candidate');
    const amountMatch = candidates.find(c => c.pathA === 'amount' && c.pathB === 'amount_total');
    
    expect(amountMatch).toBeDefined();
    // After fixing LatAm formatting and String/Number bucket coercion, value overlap generates a high-quality review candidate
    expect(amountMatch!.similarity!.combined).toBeGreaterThan(0.65);
  });

  it('handles Semantic Equivalence via Dictionary Ontology', async () => {
    const report = await compare(
      [{ user_first_name: "John", user_cell: "+123456" }],
      [{ given_name: "John", mobile_number: "+123456" }]
    );
    
    // Should identify rename candidates based on new Dictionary Ontology aliases
    const candidates = report.diffs.filter(d => d.kind === 'rename_candidate');
    const nameMatch = candidates.find(c => c.pathA === 'user_first_name' && c.pathB === 'given_name');
    const cellMatch = candidates.find(c => c.pathA === 'user_cell' && c.pathB === 'mobile_number');
    
    expect(nameMatch, 'Did not match user_first_name to given_name').toBeDefined();
    expect(cellMatch, 'Did not match user_cell to mobile_number').toBeDefined();
    
    expect(nameMatch!.similarity!.evidenceBreakdown?.ontology).toBeGreaterThanOrEqual(0.9);
    expect(cellMatch!.similarity!.evidenceBreakdown?.ontology).toBeGreaterThanOrEqual(0.9);
  });
});
