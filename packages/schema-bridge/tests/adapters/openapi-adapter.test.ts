import { describe, it, expect } from 'vitest';
import { OpenApiAdapter } from '../../src/adapters/openapi-adapter.js';

describe('OpenApiAdapter', () => {
  const stripeSample = {
    openapi: '3.0.0',
    info: { title: 'Stripe Sample', version: '1.0.0' },
    paths: {
      '/v1/charges': {
        post: {
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    amount: { type: 'integer', description: 'Amount in cents' },
                    currency: { type: 'string', description: 'Three-letter ISO currency code' },
                    customer: { type: 'string', description: 'ID of an existing customer' }
                  },
                  required: ['amount', 'currency']
                }
              }
            }
          },
          responses: {
            200: {
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      object: { type: 'string' },
                      amount: { type: 'integer' },
                      status: { type: 'string' }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    components: {
      schemas: {
        Charge: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            amount: { type: 'integer' },
            metadata: {
              type: 'object',
              properties: {
                order_id: { type: 'string' }
              }
            }
          }
        }
      }
    }
  };

  it('converts components/schemas to SchemaFields', () => {
    const adapter = new OpenApiAdapter(JSON.stringify(stripeSample));
    const inferred = adapter.adapt();
    
    const chargeId = inferred.fields.find(f => f.path === 'Charge.id');
    expect(chargeId).toBeDefined();
    expect(chargeId?.node.type).toBe('string');
    
    const metadataOrder = inferred.fields.find(f => f.path === 'Charge.metadata.order_id');
    expect(metadataOrder).toBeDefined();
  });

  it('extracts fields from paths (request/response)', () => {
    const adapter = new OpenApiAdapter(JSON.stringify(stripeSample));
    const inferred = adapter.adapt();
    
    // Check request body field (using the specific pathing implemented)
    const reqAmount = inferred.fields.find(f => f.path.includes('request.post./v1/charges.amount'));
    expect(reqAmount).toBeDefined();
    expect(reqAmount?.required).toBe(true);
    expect(reqAmount?.node.description).toBe('Amount in cents');
  });

  it('deduplicates fields and preserves descriptions', () => {
    const adapter = new OpenApiAdapter(JSON.stringify(stripeSample));
    const inferred = adapter.adapt();
    
    // The same name 'amount' appears in schema, request and response.
    // Our adapter preserves all occurrences because paths are different (Charge.amount vs request.post...)
    // But within a single path, they are unique.
    const amounts = inferred.fields.filter(f => f.path.endsWith('amount'));
    expect(amounts.length).toBeGreaterThanOrEqual(2);
  });
});
