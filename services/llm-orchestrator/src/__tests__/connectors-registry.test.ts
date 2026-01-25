/**
 * Connectors Registry Tests
 */

import { describe, it, expect } from 'vitest';
import {
  INTEGRAX_CONNECTORS,
  getConnector,
  getConnectorsByCategory,
  searchConnectors,
} from '../connectors-registry';

describe('INTEGRAX_CONNECTORS', () => {
  it('should have all expected connectors', () => {
    const connectorIds = INTEGRAX_CONNECTORS.map((c) => c.id);

    expect(connectorIds).toContain('mercadopago');
    expect(connectorIds).toContain('contabilium');
    expect(connectorIds).toContain('afip-wsfe');
    expect(connectorIds).toContain('whatsapp');
    expect(connectorIds).toContain('email');
    expect(connectorIds).toContain('google-sheets');
  });

  it('should have valid categories', () => {
    const validCategories = ['payment', 'erp', 'messaging', 'spreadsheet', 'invoicing', 'other'];

    for (const connector of INTEGRAX_CONNECTORS) {
      expect(validCategories).toContain(connector.category);
    }
  });

  it('should have actions for each connector', () => {
    for (const connector of INTEGRAX_CONNECTORS) {
      expect(connector.actions).toBeInstanceOf(Array);
      expect(connector.actions.length).toBeGreaterThan(0);
    }
  });

  it('should have capabilities for each connector', () => {
    for (const connector of INTEGRAX_CONNECTORS) {
      expect(connector.capabilities).toBeInstanceOf(Array);
      expect(connector.capabilities.length).toBeGreaterThan(0);
    }
  });

  describe('Connector Details', () => {
    it('MercadoPago should have payment actions', () => {
      const mp = getConnector('mercadopago');

      expect(mp).toBeDefined();
      expect(mp?.category).toBe('payment');

      const actionIds = mp?.actions.map((a) => a.id);
      expect(actionIds).toContain('create_payment');
      expect(actionIds).toContain('get_payment');
      expect(actionIds).toContain('refund_payment');
    });

    it('AFIP WSFE should have invoicing actions', () => {
      const afip = getConnector('afip-wsfe');

      expect(afip).toBeDefined();
      expect(afip?.category).toBe('invoicing');

      const actionIds = afip?.actions.map((a) => a.id);
      expect(actionIds).toContain('autorizar_comprobante');
      expect(actionIds).toContain('get_ultimo_comprobante');
    });

    it('WhatsApp should have messaging actions', () => {
      const wa = getConnector('whatsapp');

      expect(wa).toBeDefined();
      expect(wa?.category).toBe('messaging');

      const actionIds = wa?.actions.map((a) => a.id);
      expect(actionIds).toContain('send_text');
      expect(actionIds).toContain('send_template');
      expect(actionIds).toContain('send_document');
      expect(actionIds).toContain('send_buttons');
    });

    it('Email should have Argentina-specific templates', () => {
      const email = getConnector('email');

      expect(email).toBeDefined();

      const actionIds = email?.actions.map((a) => a.id);
      expect(actionIds).toContain('send_factura_email');
    });

    it('Contabilium should have ERP actions', () => {
      const ctb = getConnector('contabilium');

      expect(ctb).toBeDefined();
      expect(ctb?.category).toBe('erp');

      const actionIds = ctb?.actions.map((a) => a.id);
      expect(actionIds).toContain('get_cliente');
      expect(actionIds).toContain('create_cliente');
      expect(actionIds).toContain('create_comprobante');
      expect(actionIds).toContain('facturar_comprobante');
    });

    it('Google Sheets should have spreadsheet actions', () => {
      const gs = getConnector('google-sheets');

      expect(gs).toBeDefined();
      expect(gs?.category).toBe('spreadsheet');

      const actionIds = gs?.actions.map((a) => a.id);
      expect(actionIds).toContain('read_sheet');
      expect(actionIds).toContain('append_row');
      expect(actionIds).toContain('update_row');
    });
  });
});

describe('getConnector', () => {
  it('should return connector by ID', () => {
    const connector = getConnector('mercadopago');

    expect(connector).toBeDefined();
    expect(connector?.id).toBe('mercadopago');
    expect(connector?.name).toBe('MercadoPago');
  });

  it('should return undefined for non-existent connector', () => {
    const connector = getConnector('nonexistent');

    expect(connector).toBeUndefined();
  });
});

describe('getConnectorsByCategory', () => {
  it('should return all payment connectors', () => {
    const paymentConnectors = getConnectorsByCategory('payment');

    expect(paymentConnectors.length).toBeGreaterThan(0);
    expect(paymentConnectors.every((c) => c.category === 'payment')).toBe(true);
    expect(paymentConnectors.some((c) => c.id === 'mercadopago')).toBe(true);
  });

  it('should return all messaging connectors', () => {
    const messagingConnectors = getConnectorsByCategory('messaging');

    expect(messagingConnectors.length).toBeGreaterThan(0);
    expect(messagingConnectors.every((c) => c.category === 'messaging')).toBe(true);
    expect(messagingConnectors.some((c) => c.id === 'whatsapp')).toBe(true);
    expect(messagingConnectors.some((c) => c.id === 'email')).toBe(true);
  });

  it('should return empty array for category with no connectors', () => {
    const otherConnectors = getConnectorsByCategory('other');

    expect(otherConnectors).toBeInstanceOf(Array);
  });
});

describe('searchConnectors', () => {
  it('should find connector by name', () => {
    const results = searchConnectors('MercadoPago');

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].id).toBe('mercadopago');
  });

  it('should find connector by description', () => {
    const results = searchConnectors('facturación electrónica');

    expect(results.length).toBeGreaterThan(0);
    expect(results.some((c) => c.id === 'afip-wsfe')).toBe(true);
  });

  it('should find connector by capability', () => {
    const results = searchConnectors('webhooks');

    expect(results.length).toBeGreaterThan(0);
    expect(results.some((c) => c.capabilities.includes('webhooks'))).toBe(true);
  });

  it('should be case insensitive', () => {
    const results1 = searchConnectors('WHATSAPP');
    const results2 = searchConnectors('whatsapp');

    expect(results1.length).toBe(results2.length);
    expect(results1[0].id).toBe(results2[0].id);
  });

  it('should return empty array for no matches', () => {
    const results = searchConnectors('xyznonexistent');

    expect(results).toEqual([]);
  });
});

describe('Action Input Schemas', () => {
  it('should have required fields defined', () => {
    for (const connector of INTEGRAX_CONNECTORS) {
      for (const action of connector.actions) {
        expect(action.inputSchema).toBeDefined();
        expect(action.inputSchema.type).toBe('object');
        expect(action.inputSchema.properties).toBeDefined();
      }
    }
  });

  it('MercadoPago create_payment should require amount and description', () => {
    const mp = getConnector('mercadopago');
    const createPayment = mp?.actions.find((a) => a.id === 'create_payment');

    expect(createPayment?.inputSchema.required).toContain('amount');
    expect(createPayment?.inputSchema.required).toContain('description');
  });

  it('WhatsApp send_text should require to and text', () => {
    const wa = getConnector('whatsapp');
    const sendText = wa?.actions.find((a) => a.id === 'send_text');

    expect(sendText?.inputSchema.required).toContain('to');
    expect(sendText?.inputSchema.required).toContain('text');
  });

  it('AFIP autorizar_comprobante should have punto_venta required', () => {
    const afip = getConnector('afip-wsfe');
    const autorizar = afip?.actions.find((a) => a.id === 'autorizar_comprobante');

    expect(autorizar?.inputSchema.required).toContain('punto_venta');
    expect(autorizar?.inputSchema.required).toContain('tipo_comprobante');
  });
});
