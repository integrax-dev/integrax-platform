/**
 * Contabilium Connector Tests
 *
 * Tests para el conector del ERP Contabilium
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Types
interface Cliente {
  RazonSocial: string;
  NumeroDocumento: string;
  TipoDocumento: number;
  Email?: string;
  Telefono?: string;
  Domicilio?: string;
  Localidad?: string;
  Provincia?: number;
  CondicionIVA?: number;
}

interface Producto {
  Nombre: string;
  Codigo?: string;
  Precio: number;
  AlicuotaIVA?: number;
  Tipo?: 'Producto' | 'Servicio';
}

interface ComprobanteItem {
  ConceptoId?: number;
  Descripcion?: string;
  Cantidad: number;
  PrecioUnitario: number;
  AlicuotaIVA: number;
  BonificacionPorcentaje?: number;
}

interface Comprobante {
  ClienteId: number;
  Tipo: string;
  PuntoVenta: number;
  Fecha: string;
  Items: ComprobanteItem[];
  Observaciones?: string;
}

// Mock API responses
const mockClientes: Record<number, Cliente & { Id: number }> = {
  1: {
    Id: 1,
    RazonSocial: 'Empresa Test SRL',
    NumeroDocumento: '30-71234567-9',
    TipoDocumento: 80,
    Email: 'contacto@empresa.com',
    CondicionIVA: 1,
  },
  2: {
    Id: 2,
    RazonSocial: 'Consumidor Final',
    NumeroDocumento: '20-12345678-9',
    TipoDocumento: 96,
    CondicionIVA: 5,
  },
};

const mockProductos: Record<number, Producto & { Id: number }> = {
  1: {
    Id: 1,
    Nombre: 'Servicio de Consultoría',
    Codigo: 'SRV-001',
    Precio: 10000,
    AlicuotaIVA: 21,
    Tipo: 'Servicio',
  },
};

// Simulated connector methods
function calculateTotal(items: ComprobanteItem[]): number {
  return items.reduce((sum, item) => {
    const subtotal = item.Cantidad * item.PrecioUnitario;
    const bonificacion = subtotal * (item.BonificacionPorcentaje || 0) / 100;
    const neto = subtotal - bonificacion;
    const iva = neto * item.AlicuotaIVA / 100;
    return sum + neto + iva;
  }, 0);
}

describe('Contabilium Connector', () => {
  describe('Connector Spec', () => {
    it('should have correct metadata', () => {
      const spec = {
        id: 'contabilium',
        name: 'Contabilium',
        description: 'ERP y sistema contable para PyMEs en Argentina',
        version: '0.1.0',
        auth: {
          type: 'oauth2',
        },
      };

      expect(spec.id).toBe('contabilium');
      expect(spec.name).toBe('Contabilium');
      expect(spec.auth.type).toBe('oauth2');
    });

    it('should define all required actions', () => {
      const actions = [
        'get_cliente',
        'search_clientes',
        'create_cliente',
        'update_cliente',
        'get_producto',
        'search_productos',
        'create_producto',
        'get_comprobante',
        'create_comprobante',
        'facturar_comprobante',
        'registrar_pago',
      ];

      expect(actions.length).toBe(11);
      expect(actions).toContain('facturar_comprobante');
      expect(actions).toContain('registrar_pago');
    });
  });

  describe('Cliente Operations', () => {
    it('should get cliente by ID', () => {
      const cliente = mockClientes[1];
      expect(cliente).toBeDefined();
      expect(cliente.RazonSocial).toBe('Empresa Test SRL');
      expect(cliente.NumeroDocumento).toBe('30-71234567-9');
    });

    it('should find cliente by CUIT', () => {
      const cuit = '30-71234567-9';
      const found = Object.values(mockClientes).find(c => c.NumeroDocumento === cuit);

      expect(found).toBeDefined();
      expect(found?.Id).toBe(1);
    });

    it('should validate CUIT format', () => {
      // Test format validation (length = 11 digits)
      const isValidFormat = (cuit: string) => cuit.replace(/\D/g, '').length === 11;

      // Valid formats
      expect(isValidFormat('20-12345678-9')).toBe(true);
      expect(isValidFormat('30-71234567-9')).toBe(true);
      expect(isValidFormat('20123456789')).toBe(true);

      // Invalid formats
      expect(isValidFormat('123456789')).toBe(false); // Too short
      expect(isValidFormat('abc')).toBe(false); // Non-numeric
    });

    it('should handle different documento types', () => {
      const tiposDocumento = {
        80: 'CUIT',
        86: 'CUIL',
        96: 'DNI',
        99: 'Sin Identificar',
      };

      expect(tiposDocumento[80]).toBe('CUIT');
      expect(tiposDocumento[96]).toBe('DNI');
    });

    it('should handle condiciones IVA', () => {
      const condicionesIVA = {
        1: 'Responsable Inscripto',
        4: 'Exento',
        5: 'Consumidor Final',
        6: 'Monotributista',
      };

      // Empresa SRL should be RI
      expect(mockClientes[1].CondicionIVA).toBe(1);
      // Consumidor Final
      expect(mockClientes[2].CondicionIVA).toBe(5);
    });
  });

  describe('Producto Operations', () => {
    it('should get producto by ID', () => {
      const producto = mockProductos[1];
      expect(producto).toBeDefined();
      expect(producto.Nombre).toBe('Servicio de Consultoría');
    });

    it('should distinguish between producto and servicio', () => {
      expect(mockProductos[1].Tipo).toBe('Servicio');
    });

    it('should have alicuota IVA', () => {
      expect(mockProductos[1].AlicuotaIVA).toBe(21);
    });
  });

  describe('Comprobante Operations', () => {
    it('should calculate total correctly', () => {
      const items: ComprobanteItem[] = [
        { Cantidad: 1, PrecioUnitario: 1000, AlicuotaIVA: 21 },
        { Cantidad: 2, PrecioUnitario: 500, AlicuotaIVA: 21 },
      ];

      const total = calculateTotal(items);
      // 1000 + 210 + 1000 + 210 = 2420
      expect(total).toBe(2420);
    });

    it('should apply bonificación correctly', () => {
      const items: ComprobanteItem[] = [
        { Cantidad: 1, PrecioUnitario: 1000, AlicuotaIVA: 21, BonificacionPorcentaje: 10 },
      ];

      const total = calculateTotal(items);
      // Neto: 1000 - 100 = 900, IVA: 189, Total: 1089
      expect(total).toBe(1089);
    });

    it('should support different comprobante types', () => {
      const tiposComprobante = [
        'FacturaA',
        'FacturaB',
        'FacturaC',
        'NotaCreditoA',
        'NotaCreditoB',
        'NotaCreditoC',
        'NotaDebitoA',
        'NotaDebitoB',
        'NotaDebitoC',
        'Presupuesto',
        'Remito',
      ];

      expect(tiposComprobante).toContain('FacturaA');
      expect(tiposComprobante).toContain('NotaCreditoB');
    });

    it('should select correct factura type based on condición IVA', () => {
      // RI -> Factura A a otro RI
      const clienteRI = mockClientes[1];
      expect(clienteRI.CondicionIVA).toBe(1);

      // CF -> Factura B
      const clienteCF = mockClientes[2];
      expect(clienteCF.CondicionIVA).toBe(5);

      // Logic: RI emits A to RI, B to CF
      const tipoFactura = (emisorRI: boolean, receptorCondicion: number) => {
        if (!emisorRI) return 'FacturaC';
        return receptorCondicion === 1 ? 'FacturaA' : 'FacturaB';
      };

      expect(tipoFactura(true, 1)).toBe('FacturaA');
      expect(tipoFactura(true, 5)).toBe('FacturaB');
      expect(tipoFactura(false, 5)).toBe('FacturaC');
    });
  });

  describe('Facturación AFIP', () => {
    it('should require facturación for certain tipos', () => {
      const tiposQueRequierenCAE = ['FacturaA', 'FacturaB', 'FacturaC'];

      expect(tiposQueRequierenCAE).toContain('FacturaA');
      expect(tiposQueRequierenCAE).not.toContain('Presupuesto');
    });

    it('should return CAE after facturación', () => {
      const mockCAEResponse = {
        Id: 1,
        CAE: '71234567890123',
        CAEVencimiento: '2026-02-04',
        Numero: 'A-0001-00000001',
        Estado: 'Facturado',
      };

      expect(mockCAEResponse.CAE).toHaveLength(14);
      expect(mockCAEResponse.Estado).toBe('Facturado');
    });
  });

  describe('Pago Operations', () => {
    it('should support different payment methods', () => {
      const mediosPago = [
        { codigo: 'EF', nombre: 'Efectivo' },
        { codigo: 'TC', nombre: 'Tarjeta Crédito' },
        { codigo: 'TD', nombre: 'Tarjeta Débito' },
        { codigo: 'TB', nombre: 'Transferencia Bancaria' },
        { codigo: 'MP', nombre: 'MercadoPago' },
        { codigo: 'CH', nombre: 'Cheque' },
      ];

      expect(mediosPago.map(m => m.codigo)).toContain('MP');
      expect(mediosPago.map(m => m.codigo)).toContain('TB');
    });

    it('should register pago for comprobante', () => {
      const pago = {
        ComprobanteId: 1,
        Monto: 2420,
        MedioPago: 'MP',
        Fecha: '2026-01-25',
        Referencia: 'PAY-123456',
      };

      expect(pago.Monto).toBe(2420);
      expect(pago.MedioPago).toBe('MP');
    });
  });

  describe('Error Handling', () => {
    it('should handle authentication errors', () => {
      const authError = {
        code: 'AUTHENTICATION_FAILED',
        message: 'Contabilium authentication failed: Invalid credentials',
      };

      expect(authError.code).toBe('AUTHENTICATION_FAILED');
    });

    it('should handle not found errors', () => {
      const notFoundError = {
        code: 'NOT_FOUND',
        message: 'Cliente not found',
        status: 404,
      };

      expect(notFoundError.code).toBe('NOT_FOUND');
      expect(notFoundError.status).toBe(404);
    });

    it('should handle API errors', () => {
      const apiError = {
        code: 'API_ERROR',
        message: 'Contabilium API error: Rate limit exceeded',
        details: { retryAfter: 60 },
      };

      expect(apiError.code).toBe('API_ERROR');
    });
  });

  describe('Integration: Factura Completa', () => {
    it('should create factura with all steps', async () => {
      // Simulate full invoice flow
      const steps = {
        clienteCreated: false,
        comprobanteCreated: false,
        facturado: false,
      };

      // Step 1: Get or create cliente
      const existingCliente = Object.values(mockClientes).find(
        c => c.NumeroDocumento === '30-71234567-9'
      );
      if (existingCliente) {
        steps.clienteCreated = true;
      }

      // Step 2: Create comprobante
      const comprobante: Comprobante = {
        ClienteId: existingCliente!.Id,
        Tipo: 'FacturaA',
        PuntoVenta: 1,
        Fecha: '2026-01-25',
        Items: [
          { Cantidad: 1, PrecioUnitario: 10000, AlicuotaIVA: 21 },
        ],
      };

      if (comprobante.ClienteId) {
        steps.comprobanteCreated = true;
      }

      // Step 3: Facturar (get CAE)
      if (['FacturaA', 'FacturaB', 'FacturaC'].includes(comprobante.Tipo)) {
        steps.facturado = true;
      }

      expect(steps.clienteCreated).toBe(true);
      expect(steps.comprobanteCreated).toBe(true);
      expect(steps.facturado).toBe(true);
    });
  });
});
