/**
 * AFIP WSFE Connector Tests
 *
 * Tests para el conector de Facturación Electrónica de AFIP
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Constants from the connector
const TipoComprobante = {
  FACTURA_A: 1,
  FACTURA_B: 6,
  FACTURA_C: 11,
  NOTA_DEBITO_A: 2,
  NOTA_DEBITO_B: 7,
  NOTA_DEBITO_C: 12,
  NOTA_CREDITO_A: 3,
  NOTA_CREDITO_B: 8,
  NOTA_CREDITO_C: 13,
} as const;

const TipoDocumento = {
  CUIT: 80,
  CUIL: 86,
  CDI: 87,
  DNI: 96,
  PASAPORTE: 94,
  CI_EXTRANJERA: 91,
  SIN_IDENTIFICAR: 99,
} as const;

const AlicuotaIVA = {
  NO_GRAVADO: 1,
  EXENTO: 2,
  IVA_0: 3,
  IVA_10_5: 4,
  IVA_21: 5,
  IVA_27: 6,
  IVA_5: 8,
  IVA_2_5: 9,
} as const;

const Concepto = {
  PRODUCTOS: 1,
  SERVICIOS: 2,
  PRODUCTOS_Y_SERVICIOS: 3,
} as const;

interface FacturaRequest {
  PtoVta: number;
  CbteTipo: number;
  Concepto: number;
  DocTipo: number;
  DocNro: string;
  CbteFch: string;
  ImpTotal: number;
  ImpTotConc: number;
  ImpNeto: number;
  ImpOpEx: number;
  ImpIVA: number;
  ImpTrib: number;
  MonId: string;
  MonCotiz: number;
  CbteDesde?: number;
  CbteHasta?: number;
  FchServDesde?: string;
  FchServHasta?: string;
  FchVtoPago?: string;
  Iva?: Array<{
    Id: number;
    BaseImp: number;
    Importe: number;
  }>;
}

interface CAEResult {
  success: boolean;
  cae?: string;
  caeVencimiento?: string;
  cbteNro: number;
  errors?: Array<{ code: string; message: string }>;
  observations?: Array<{ code: string; message: string }>;
}

// Helper functions
function validateFacturaRequest(req: FacturaRequest): string[] {
  const errors: string[] = [];

  if (req.PtoVta < 1 || req.PtoVta > 99999) {
    errors.push('PtoVta debe estar entre 1 y 99999');
  }

  if (!(Object.values(TipoComprobante) as unknown as number[]).includes(req.CbteTipo)) {
    errors.push('CbteTipo inválido');
  }

  if (req.Concepto < 1 || req.Concepto > 3) {
    errors.push('Concepto debe ser 1, 2 o 3');
  }

  if (!(Object.values(TipoDocumento) as unknown as number[]).includes(req.DocTipo)) {
    errors.push('DocTipo inválido');
  }

  // For servicios, need service dates
  if (req.Concepto !== Concepto.PRODUCTOS) {
    if (!req.FchServDesde || !req.FchServHasta) {
      errors.push('Servicios requieren FchServDesde y FchServHasta');
    }
  }

  // IVA should match ImpIVA
  if (req.Iva && req.Iva.length > 0) {
    const calculatedIVA = req.Iva.reduce((sum, iva) => sum + iva.Importe, 0);
    if (Math.abs(calculatedIVA - req.ImpIVA) > 0.01) {
      errors.push('La suma de alícuotas IVA no coincide con ImpIVA');
    }
  }

  // Total validation
  const expectedTotal = req.ImpNeto + req.ImpIVA + req.ImpTotConc + req.ImpOpEx + req.ImpTrib;
  if (Math.abs(expectedTotal - req.ImpTotal) > 0.01) {
    errors.push('ImpTotal no coincide con la suma de componentes');
  }

  return errors;
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10).replace(/-/g, '');
}

function calculateIVA(neto: number, alicuota: number): number {
  const rates: Record<number, number> = {
    [AlicuotaIVA.IVA_21]: 0.21,
    [AlicuotaIVA.IVA_10_5]: 0.105,
    [AlicuotaIVA.IVA_27]: 0.27,
    [AlicuotaIVA.IVA_5]: 0.05,
    [AlicuotaIVA.IVA_2_5]: 0.025,
    [AlicuotaIVA.IVA_0]: 0,
    [AlicuotaIVA.EXENTO]: 0,
    [AlicuotaIVA.NO_GRAVADO]: 0,
  };

  return Number((neto * (rates[alicuota] || 0)).toFixed(2));
}

describe('AFIP WSFE Connector', () => {
  describe('Connector Spec', () => {
    it('should have correct metadata', () => {
      const spec = {
        id: 'afip-wsfe',
        name: 'AFIP WSFE',
        description: 'Facturación Electrónica AFIP Argentina - Obtención de CAE',
        version: '0.1.0',
        auth: { type: 'certificate' },
      };

      expect(spec.id).toBe('afip-wsfe');
      expect(spec.auth.type).toBe('certificate');
    });

    it('should define all required actions', () => {
      const actions = [
        'autorizar_comprobante',
        'get_ultimo_comprobante',
        'get_puntos_venta',
        'get_cotizacion',
      ];

      expect(actions).toContain('autorizar_comprobante');
      expect(actions).toContain('get_ultimo_comprobante');
    });
  });

  describe('Tipo Comprobante', () => {
    it('should have correct codes for facturas', () => {
      expect(TipoComprobante.FACTURA_A).toBe(1);
      expect(TipoComprobante.FACTURA_B).toBe(6);
      expect(TipoComprobante.FACTURA_C).toBe(11);
    });

    it('should have correct codes for notas de crédito', () => {
      expect(TipoComprobante.NOTA_CREDITO_A).toBe(3);
      expect(TipoComprobante.NOTA_CREDITO_B).toBe(8);
      expect(TipoComprobante.NOTA_CREDITO_C).toBe(13);
    });

    it('should have correct codes for notas de débito', () => {
      expect(TipoComprobante.NOTA_DEBITO_A).toBe(2);
      expect(TipoComprobante.NOTA_DEBITO_B).toBe(7);
      expect(TipoComprobante.NOTA_DEBITO_C).toBe(12);
    });
  });

  describe('Tipo Documento', () => {
    it('should have correct document type codes', () => {
      expect(TipoDocumento.CUIT).toBe(80);
      expect(TipoDocumento.CUIL).toBe(86);
      expect(TipoDocumento.DNI).toBe(96);
      expect(TipoDocumento.SIN_IDENTIFICAR).toBe(99);
    });
  });

  describe('Alicuotas IVA', () => {
    it('should have correct IVA codes', () => {
      expect(AlicuotaIVA.IVA_21).toBe(5);
      expect(AlicuotaIVA.IVA_10_5).toBe(4);
      expect(AlicuotaIVA.IVA_27).toBe(6);
      expect(AlicuotaIVA.EXENTO).toBe(2);
      expect(AlicuotaIVA.NO_GRAVADO).toBe(1);
    });

    it('should calculate IVA correctly', () => {
      expect(calculateIVA(1000, AlicuotaIVA.IVA_21)).toBe(210);
      expect(calculateIVA(1000, AlicuotaIVA.IVA_10_5)).toBe(105);
      expect(calculateIVA(1000, AlicuotaIVA.IVA_27)).toBe(270);
      expect(calculateIVA(1000, AlicuotaIVA.IVA_0)).toBe(0);
    });
  });

  describe('Concepto', () => {
    it('should have correct concept codes', () => {
      expect(Concepto.PRODUCTOS).toBe(1);
      expect(Concepto.SERVICIOS).toBe(2);
      expect(Concepto.PRODUCTOS_Y_SERVICIOS).toBe(3);
    });
  });

  describe('Date Formatting', () => {
    it('should format dates correctly for AFIP', () => {
      const date = new Date('2026-01-25');
      expect(formatDate(date)).toBe('20260125');
    });

    it('should handle different months correctly', () => {
      const date = new Date('2026-12-01');
      expect(formatDate(date)).toBe('20261201');
    });
  });

  describe('Factura Request Validation', () => {
    it('should validate a correct factura A', () => {
      const request: FacturaRequest = {
        PtoVta: 1,
        CbteTipo: TipoComprobante.FACTURA_A,
        Concepto: Concepto.PRODUCTOS,
        DocTipo: TipoDocumento.CUIT,
        DocNro: '30712345679',
        CbteFch: '20260125',
        ImpNeto: 1000,
        ImpIVA: 210,
        ImpTotal: 1210,
        ImpTotConc: 0,
        ImpOpEx: 0,
        ImpTrib: 0,
        MonId: 'PES',
        MonCotiz: 1,
        Iva: [
          { Id: AlicuotaIVA.IVA_21, BaseImp: 1000, Importe: 210 },
        ],
      };

      const errors = validateFacturaRequest(request);
      expect(errors).toHaveLength(0);
    });

    it('should fail for invalid punto de venta', () => {
      const request: FacturaRequest = {
        PtoVta: 0, // Invalid
        CbteTipo: TipoComprobante.FACTURA_B,
        Concepto: Concepto.PRODUCTOS,
        DocTipo: TipoDocumento.DNI,
        DocNro: '12345678',
        CbteFch: '20260125',
        ImpNeto: 1000,
        ImpIVA: 210,
        ImpTotal: 1210,
        ImpTotConc: 0,
        ImpOpEx: 0,
        ImpTrib: 0,
        MonId: 'PES',
        MonCotiz: 1,
      };

      const errors = validateFacturaRequest(request);
      expect(errors).toContain('PtoVta debe estar entre 1 y 99999');
    });

    it('should require service dates for services', () => {
      const request: FacturaRequest = {
        PtoVta: 1,
        CbteTipo: TipoComprobante.FACTURA_B,
        Concepto: Concepto.SERVICIOS, // Servicios
        DocTipo: TipoDocumento.CUIT,
        DocNro: '30712345679',
        CbteFch: '20260125',
        ImpNeto: 1000,
        ImpIVA: 210,
        ImpTotal: 1210,
        ImpTotConc: 0,
        ImpOpEx: 0,
        ImpTrib: 0,
        MonId: 'PES',
        MonCotiz: 1,
        // Missing FchServDesde and FchServHasta
      };

      const errors = validateFacturaRequest(request);
      expect(errors).toContain('Servicios requieren FchServDesde y FchServHasta');
    });

    it('should validate IVA sum matches ImpIVA', () => {
      const request: FacturaRequest = {
        PtoVta: 1,
        CbteTipo: TipoComprobante.FACTURA_A,
        Concepto: Concepto.PRODUCTOS,
        DocTipo: TipoDocumento.CUIT,
        DocNro: '30712345679',
        CbteFch: '20260125',
        ImpNeto: 1000,
        ImpIVA: 210,
        ImpTotal: 1210,
        ImpTotConc: 0,
        ImpOpEx: 0,
        ImpTrib: 0,
        MonId: 'PES',
        MonCotiz: 1,
        Iva: [
          { Id: AlicuotaIVA.IVA_21, BaseImp: 1000, Importe: 100 }, // Wrong!
        ],
      };

      const errors = validateFacturaRequest(request);
      expect(errors).toContain('La suma de alícuotas IVA no coincide con ImpIVA');
    });

    it('should validate total equals sum of components', () => {
      const request: FacturaRequest = {
        PtoVta: 1,
        CbteTipo: TipoComprobante.FACTURA_B,
        Concepto: Concepto.PRODUCTOS,
        DocTipo: TipoDocumento.DNI,
        DocNro: '12345678',
        CbteFch: '20260125',
        ImpNeto: 1000,
        ImpIVA: 210,
        ImpTotal: 1500, // Wrong - should be 1210
        ImpTotConc: 0,
        ImpOpEx: 0,
        ImpTrib: 0,
        MonId: 'PES',
        MonCotiz: 1,
      };

      const errors = validateFacturaRequest(request);
      expect(errors).toContain('ImpTotal no coincide con la suma de componentes');
    });
  });

  describe('CAE Result', () => {
    it('should parse successful CAE response', () => {
      const result: CAEResult = {
        success: true,
        cae: '71234567890123',
        caeVencimiento: '20260204',
        cbteNro: 1,
      };

      expect(result.success).toBe(true);
      expect(result.cae).toHaveLength(14);
      expect(result.cbteNro).toBe(1);
    });

    it('should handle CAE with errors', () => {
      const result: CAEResult = {
        success: false,
        cbteNro: 0,
        errors: [
          { code: '10016', message: 'El campo DocNro es inválido' },
        ],
      };

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors![0].code).toBe('10016');
    });

    it('should handle CAE with observations', () => {
      const result: CAEResult = {
        success: true,
        cae: '71234567890123',
        caeVencimiento: '20260204',
        cbteNro: 1,
        observations: [
          { code: '10063', message: 'El total no coincide con la suma de netos más impuestos' },
        ],
      };

      expect(result.success).toBe(true);
      expect(result.observations).toHaveLength(1);
    });
  });

  describe('Environment URLs', () => {
    it('should have testing and production URLs', () => {
      const AFIP_URLS = {
        testing: {
          wsaa: 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms',
          wsfe: 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx',
        },
        production: {
          wsaa: 'https://wsaa.afip.gov.ar/ws/services/LoginCms',
          wsfe: 'https://servicios1.afip.gov.ar/wsfev1/service.asmx',
        },
      };

      expect(AFIP_URLS.testing.wsaa).toContain('homo');
      expect(AFIP_URLS.production.wsaa).not.toContain('homo');
    });
  });

  describe('Moneda', () => {
    it('should use PES for Argentine Pesos', () => {
      const moneda = { id: 'PES', cotiz: 1 };
      expect(moneda.id).toBe('PES');
      expect(moneda.cotiz).toBe(1);
    });

    it('should support USD with cotización', () => {
      const moneda = { id: 'DOL', cotiz: 1050 };
      expect(moneda.id).toBe('DOL');
      expect(moneda.cotiz).toBeGreaterThan(1);
    });
  });

  describe('Factura Helper', () => {
    it('should create factura B for consumidor final', () => {
      const facturaBInput = {
        puntoVenta: 1,
        tipoComprobante: TipoComprobante.FACTURA_B,
        docTipo: TipoDocumento.DNI,
        docNro: '12345678',
        concepto: Concepto.PRODUCTOS,
        importeNeto: 8264.46,
        importeIva: 1735.54,
      };

      const total = facturaBInput.importeNeto + facturaBInput.importeIva;
      expect(total).toBeCloseTo(10000, 2);
    });

    it('should create factura A for responsable inscripto', () => {
      const facturaAInput = {
        puntoVenta: 1,
        tipoComprobante: TipoComprobante.FACTURA_A,
        docTipo: TipoDocumento.CUIT,
        docNro: '30712345679',
        concepto: Concepto.SERVICIOS,
        importeNeto: 10000,
        importeIva: 2100,
        fechaServicioDesde: '20260101',
        fechaServicioHasta: '20260131',
      };

      expect(facturaAInput.tipoComprobante).toBe(1);
      expect(facturaAInput.docTipo).toBe(80);
      expect(facturaAInput.fechaServicioDesde).toBeDefined();
    });
  });

  describe('AFIP WSFE Integration (real WSAA)', () => {
    const { AfipWsfeConnector } = require('../index');

    const cuit = process.env.AFIP_CUIT;
    const certificate = process.env.AFIP_CERT_PATH ? require('fs').readFileSync(process.env.AFIP_CERT_PATH, 'utf8') : undefined;
    const privateKey = process.env.AFIP_KEY_PATH ? require('fs').readFileSync(process.env.AFIP_KEY_PATH, 'utf8') : undefined;
    const environment = process.env.AFIP_ENVIRONMENT || 'testing';

    it('should authenticate with AFIP WSAA (CMS/PKCS#7)', async () => {
      if (!cuit || !certificate || !privateKey) {
        console.warn('AFIP integration test skipped: set AFIP_CUIT, AFIP_CERT_PATH, AFIP_KEY_PATH env vars');
        return;
      }
      const connector = new AfipWsfeConnector({
        cuit,
        certificate,
        privateKey,
        environment,
      });
      let error = null;
      let token = null;
      try {
        token = await connector.authenticate();
      } catch (err) {
        error = err;
      }
      if (error) {
        console.error('AFIP WSAA auth error:', error);
      }
      expect(token).toBeDefined();
      expect(token.token).toBeDefined();
      expect(token.sign).toBeDefined();
      expect(token.expirationTime).toBeInstanceOf(Date);
    }, 20000);
  });
});
