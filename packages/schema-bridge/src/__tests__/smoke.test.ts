import { describe, it, expect } from 'vitest';
import { createSimilarityEngine } from '../similarity-engine.js';
import type { FieldDiff, SchemaNode } from '../types.js';

describe('SimilarityEngine - Level 2 ERP Smoke Test', () => {
  it('correctly maps deep nested arrays, SAP synonyms, and unambiguous formats', () => {
    const engine = createSimilarityEngine();

    const oldNodes: FieldDiff[] = [
      {
        kind: 'field_removed',
        pathA: 'order.lineItems[*].materialNum',
        pathB: null,
        nodeA: {
          type: 'string',
          examples: ['MTR-001', 'MTR-002', 'MTR-003'],
          nullable: false,
          evidence: {
            sampleCount: 100,
            nonNullCount: 100,
            nullCount: 0,
            uniqueCount: 3,
            coverageRatio: 1,
            placeholderCount: 0,
            placeholderRatio: 0,
            evidenceQuality: 0.9,
          },
        },
        nodeB: null,
        breakingScore: 1.0,
      },
      {
        kind: 'field_removed',
        pathA: 'customer.auth.contactEmail',
        pathB: null,
        nodeA: {
          type: 'string',
          format: 'email',
          examples: ['admin@erp.com', 'buyer@erp.com'],
          nullable: false,
          evidence: {
            sampleCount: 100,
            nonNullCount: 100,
            nullCount: 0,
            uniqueCount: 2,
            coverageRatio: 1,
            placeholderCount: 0,
            placeholderRatio: 0,
            evidenceQuality: 0.8,
          },
        },
        nodeB: null,
        breakingScore: 1.0,
      },
      {
        kind: 'field_removed',
        pathA: 'transaction.partner.company',
        pathB: null,
        nodeA: {
          type: 'string',
          examples: ['AR01', 'US02', 'BR01'],
          nullable: false,
          evidence: {
            sampleCount: 100,
            nonNullCount: 100,
            nullCount: 0,
            uniqueCount: 3,
            coverageRatio: 1,
            placeholderCount: 0,
            placeholderRatio: 0,
            evidenceQuality: 0.9,
          },
        },
        nodeB: null,
        breakingScore: 1.0,
      },
    ];

    const newNodes: FieldDiff[] = [
      {
        kind: 'field_added',
        pathA: null,
        pathB: 'order.items[*].sub_items[*].matnr',
        nodeA: null,
        nodeB: {
          type: 'string',
          examples: ['MTR-001', 'MTR-002', 'MTR-003'],
          nullable: false,
          evidence: {
            sampleCount: 100,
            nonNullCount: 100,
            nullCount: 0,
            uniqueCount: 3,
            coverageRatio: 1,
            placeholderCount: 0,
            placeholderRatio: 0,
            evidenceQuality: 0.9,
          },
        },
        breakingScore: 0.0,
      },
      {
        kind: 'field_added',
        pathA: null,
        pathB: 'customer.auth.electronic_mail',
        nodeA: null,
        nodeB: {
          type: 'string',
          format: 'email',
          examples: ['admin@erp.com', 'buyer@erp.com'],
          nullable: false,
          evidence: {
            sampleCount: 100,
            nonNullCount: 100,
            nullCount: 0,
            uniqueCount: 2,
            coverageRatio: 1,
            placeholderCount: 0,
            placeholderRatio: 0,
            evidenceQuality: 0.8,
          },
        },
        breakingScore: 0.0,
      },
      {
        kind: 'field_added',
        pathA: null,
        pathB: 'transaction.partner.bukrs',
        nodeA: null,
        nodeB: {
          type: 'string',
          examples: ['AR01', 'US02', 'BR01'],
          nullable: false,
          evidence: {
            sampleCount: 100,
            nonNullCount: 100,
            nullCount: 0,
            uniqueCount: 3,
            coverageRatio: 1,
            placeholderCount: 0,
            placeholderRatio: 0,
            evidenceQuality: 0.9,
          },
        },
        breakingScore: 0.0,
      },
    ];

    const candidates = engine.findRenameCandidates(oldNodes, newNodes);

    const emailMapping = candidates.find(c => c.pathA === 'customer.auth.contactEmail');
    expect(emailMapping).toBeDefined();
    expect(emailMapping!.pathB).toBe('customer.auth.electronic_mail');
    // Ensure smart type multiplier boosted confidence sufficiently to auto-accept despite lexical mismatch
    expect(emailMapping!.similarity?.decision).toBe('auto_accept');

    const materialMapping = candidates.find(c => c.pathA === 'order.lineItems[*].materialNum');
    expect(materialMapping).toBeDefined();
    expect(materialMapping!.pathB).toBe('order.items[*].sub_items[*].matnr');
    expect(materialMapping!.similarity?.decision).toBe('auto_accept');

    const companyCodeMapping = candidates.find(c => c.pathA === 'transaction.partner.company');
    expect(companyCodeMapping).toBeDefined();
    expect(companyCodeMapping!.pathB).toBe('transaction.partner.bukrs');
    // Ensure SAP synonyms are working
    expect(companyCodeMapping!.similarity?.decision).toBe('auto_accept');
  });
});
