/**
 * LLM Orchestrator Tools Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ToolExecutor, INTEGRATION_TOOLS } from '../tools';
import { INTEGRAX_CONNECTORS } from '../connectors-registry';

describe('ToolExecutor', () => {
  let executor: ToolExecutor;

  beforeEach(() => {
    executor = new ToolExecutor(INTEGRAX_CONNECTORS);
  });

  describe('search_connectors', () => {
    it('should find connectors by name', async () => {
      const result = await executor.execute('search_connectors', { query: 'mercadopago' });

      expect(result.success).toBe(true);
      expect(result.data).toBeInstanceOf(Array);
      expect((result.data as any[]).length).toBeGreaterThan(0);
      expect((result.data as any[])[0].id).toBe('mercadopago');
    });

    it('should find connectors by capability', async () => {
      const result = await executor.execute('search_connectors', { query: 'facturación' });

      expect(result.success).toBe(true);
      const connectors = result.data as any[];
      expect(connectors.some((c) => c.id === 'afip-wsfe' || c.id === 'contabilium')).toBe(true);
    });

    it('should filter by category', async () => {
      const result = await executor.execute('search_connectors', {
        query: 'enviar',
        category: 'messaging',
      });

      expect(result.success).toBe(true);
      const connectors = result.data as any[];
      expect(connectors.every((c) => c.category === 'messaging')).toBe(true);
    });

    it('should return empty array for no matches', async () => {
      const result = await executor.execute('search_connectors', { query: 'xyznonexistent' });

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });
  });

  describe('get_connector_actions', () => {
    it('should return actions for valid connector', async () => {
      const result = await executor.execute('get_connector_actions', { connectorId: 'whatsapp' });

      expect(result.success).toBe(true);
      expect((result.data as any).connector).toBe('WhatsApp Business');
      expect((result.data as any).actions).toBeInstanceOf(Array);
      expect((result.data as any).actions.length).toBeGreaterThan(0);
    });

    it('should fail for invalid connector', async () => {
      const result = await executor.execute('get_connector_actions', { connectorId: 'invalid' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('validate_workflow', () => {
    it('should validate correct workflow', async () => {
      const steps = [
        {
          connectorId: 'mercadopago',
          actionId: 'create_payment',
          parameters: { amount: 1000, description: 'Test payment' },
        },
        {
          connectorId: 'whatsapp',
          actionId: 'send_text',
          parameters: { to: '5491145551234', text: 'Pago confirmado' },
        },
      ];

      const result = await executor.execute('validate_workflow', { steps });

      expect(result.success).toBe(true);
      expect((result.data as any).valid).toBe(true);
      expect((result.data as any).errors).toHaveLength(0);
    });

    it('should detect invalid connector', async () => {
      const steps = [
        {
          connectorId: 'invalid-connector',
          actionId: 'some_action',
          parameters: {},
        },
      ];

      const result = await executor.execute('validate_workflow', { steps });

      expect(result.success).toBe(false);
      expect((result.data as any).errors.length).toBeGreaterThan(0);
    });

    it('should detect invalid action', async () => {
      const steps = [
        {
          connectorId: 'mercadopago',
          actionId: 'invalid_action',
          parameters: {},
        },
      ];

      const result = await executor.execute('validate_workflow', { steps });

      expect(result.success).toBe(false);
      expect((result.data as any).errors.some((e: string) => e.includes('not found'))).toBe(true);
    });
  });

  describe('get_afip_comprobante_types', () => {
    it('should return types for RI emitting to RI', async () => {
      const result = await executor.execute('get_afip_comprobante_types', {
        condicionIVA: 'responsable_inscripto',
        receptorCondicionIVA: 'responsable_inscripto',
      });

      expect(result.success).toBe(true);
      expect((result.data as any).tipos).toContain('Factura A');
    });

    it('should return types for RI emitting to CF', async () => {
      const result = await executor.execute('get_afip_comprobante_types', {
        condicionIVA: 'responsable_inscripto',
        receptorCondicionIVA: 'consumidor_final',
      });

      expect(result.success).toBe(true);
      expect((result.data as any).tipos).toContain('Factura B');
    });

    it('should return types for Monotributista', async () => {
      const result = await executor.execute('get_afip_comprobante_types', {
        condicionIVA: 'monotributo',
      });

      expect(result.success).toBe(true);
      expect((result.data as any).tiposPorReceptor).toBeDefined();
      // Monotributo always emits C
      expect((result.data as any).tiposPorReceptor.consumidor_final).toContain('Factura C');
    });

    it('should fail for invalid condicion IVA', async () => {
      const result = await executor.execute('get_afip_comprobante_types', {
        condicionIVA: 'invalid',
      });

      expect(result.success).toBe(false);
    });
  });

  describe('calculate_iva', () => {
    it('should calculate IVA 21%', async () => {
      const result = await executor.execute('calculate_iva', {
        monto: 1000,
        alicuota: 21,
      });

      expect(result.success).toBe(true);
      expect((result.data as any).neto).toBe(1000);
      expect((result.data as any).iva).toBe(210);
      expect((result.data as any).total).toBe(1210);
    });

    it('should calculate IVA 10.5%', async () => {
      const result = await executor.execute('calculate_iva', {
        monto: 1000,
        alicuota: 10.5,
      });

      expect(result.success).toBe(true);
      expect((result.data as any).iva).toBe(105);
      expect((result.data as any).total).toBe(1105);
    });

    it('should handle IVA 0%', async () => {
      const result = await executor.execute('calculate_iva', {
        monto: 1000,
        alicuota: 0,
      });

      expect(result.success).toBe(true);
      expect((result.data as any).iva).toBe(0);
      expect((result.data as any).total).toBe(1000);
    });
  });

  describe('format_cuit', () => {
    it('should format valid CUIT with dashes', async () => {
      const result = await executor.execute('format_cuit', { cuit: '30-71234567-9' });

      expect(result.success).toBe(true);
      expect((result.data as any).formatted).toBe('30-71234567-9');
      expect((result.data as any).digits).toBe('30712345679');
    });

    it('should format CUIT without dashes', async () => {
      const result = await executor.execute('format_cuit', { cuit: '30712345679' });

      expect(result.success).toBe(true);
      expect((result.data as any).formatted).toBe('30-71234567-9');
    });

    it('should fail for invalid length', async () => {
      const result = await executor.execute('format_cuit', { cuit: '123456789' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('11 dígitos');
    });
  });

  describe('format_phone_argentina', () => {
    it('should format Buenos Aires mobile', async () => {
      const result = await executor.execute('format_phone_argentina', { phone: '01145551234' });

      expect(result.success).toBe(true);
      expect((result.data as any).whatsapp).toBe('5491145551234');
    });

    it('should format number with country code', async () => {
      const result = await executor.execute('format_phone_argentina', { phone: '5491145551234' });

      expect(result.success).toBe(true);
      expect((result.data as any).whatsapp).toBe('5491145551234');
    });

    it('should add 9 for mobile', async () => {
      const result = await executor.execute('format_phone_argentina', { phone: '541145551234' });

      expect(result.success).toBe(true);
      expect((result.data as any).whatsapp).toBe('5491145551234');
    });
  });

  describe('get_error_solutions', () => {
    it('should identify authentication errors', async () => {
      const result = await executor.execute('get_error_solutions', {
        errorMessage: 'Unauthorized: Invalid access token',
      });

      expect(result.success).toBe(true);
      expect((result.data as any).category).toBe('authentication');
      expect((result.data as any).solutions.length).toBeGreaterThan(0);
    });

    it('should identify AFIP errors', async () => {
      const result = await executor.execute('get_error_solutions', {
        errorMessage: 'AFIP CAE error: El campo DocNro es inválido',
        connectorId: 'afip-wsfe',
      });

      expect(result.success).toBe(true);
      expect((result.data as any).category).toBe('afip');
      expect((result.data as any).tip).toContain('afip.gob.ar');
    });

    it('should identify rate limit errors', async () => {
      const result = await executor.execute('get_error_solutions', {
        errorMessage: 'Error 429: Too many requests',
      });

      expect(result.success).toBe(true);
      expect((result.data as any).category).toBe('rate_limit');
    });

    it('should handle unknown errors', async () => {
      const result = await executor.execute('get_error_solutions', {
        errorMessage: 'Some random error that does not match patterns',
      });

      expect(result.success).toBe(true);
      expect((result.data as any).category).toBe('unknown');
      expect((result.data as any).solutions.length).toBeGreaterThan(0);
    });
  });
});

describe('INTEGRATION_TOOLS', () => {
  it('should have all required tools defined', () => {
    const toolNames = INTEGRATION_TOOLS.map((t) => t.name);

    expect(toolNames).toContain('search_connectors');
    expect(toolNames).toContain('get_connector_actions');
    expect(toolNames).toContain('validate_workflow');
    expect(toolNames).toContain('get_afip_comprobante_types');
    expect(toolNames).toContain('calculate_iva');
    expect(toolNames).toContain('format_cuit');
    expect(toolNames).toContain('format_phone_argentina');
    expect(toolNames).toContain('get_error_solutions');
  });

  it('should have valid input schemas', () => {
    for (const tool of INTEGRATION_TOOLS) {
      expect(tool.input_schema).toBeDefined();
      expect(tool.input_schema.type).toBe('object');
      expect(tool.input_schema.properties).toBeDefined();
    }
  });
});
