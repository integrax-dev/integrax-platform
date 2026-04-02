/**
 * AFIP WSFE Connector — Tests exhaustivos
 *
 * Cubre: constantes fiscales, validación, cálculos IVA, formateo de fechas,
 * matriz de tipos de comprobante, clase AfipWsfeConnector con fetch mockeado.
 * No requiere conexión real a AFIP ni certificados reales.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));
global.fetch = fetchMock;

vi.mock('node-forge', () => ({
  pkcs7: {
    createSignedData: () => ({
      content: null,
      addSigner: vi.fn(),
      addCertificate: vi.fn(),
      sign: vi.fn(),
      toAsn1: () => ({}),
    }),
  },
  pki: {
    certificateFromPem: vi.fn(() => ({})),
    privateKeyFromPem: vi.fn(() => ({})),
    oids: {
      sha256: 'sha256',
      contentType: '1.2.840.113549.1.9.3',
      data: '1.2.840.113549.1.7.1',
      messageDigest: '1.2.840.113549.1.9.4',
      signingTime: '1.2.840.113549.1.9.5',
    },
  },
  util: {
    createBuffer: vi.fn(() => ({})),
    encode64: vi.fn(() => 'FAKECMS_BASE64=='),
  },
  asn1: { toDer: vi.fn(() => ({ getBytes: () => '' })) },
}));

import {
  AfipWsfeConnector,
  TipoComprobante,
  TipoDocumento,
  AlicuotaIVA,
  Concepto,
  AFIP_URLS,
} from '../index.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const FAKE_CERT = '-----BEGIN CERTIFICATE-----\nFAKE\n-----END CERTIFICATE-----';
const FAKE_KEY = '-----BEGIN PRIVATE KEY-----\nFAKE\n-----END PRIVATE KEY-----';

function makeConnector(env: 'testing' | 'production' = 'testing') {
  return new AfipWsfeConnector({
    cuit: '30712345679',
    certificate: FAKE_CERT,
    privateKey: FAKE_KEY,
    environment: env,
  });
}

function makeWsaaResponse(token = 'TOKEN123', sign = 'SIGN456'): string {
  const exp = new Date(Date.now() + 3600 * 1000).toISOString();
  return `<?xml version="1.0"?><soap:Envelope><soap:Body>
    <loginCmsResponse><loginTicketResponse>
      <credentials><token>${token}</token><sign>${sign}</sign></credentials>
      <header><expirationTime>${exp}</expirationTime></header>
    </loginTicketResponse></loginCmsResponse></soap:Body></soap:Envelope>`;
}

function makeWsfeResponse(method: string, innerXml: string): string {
  return `<?xml version="1.0"?><soap:Envelope><soap:Body>
    <${method}Response><${method}Result>${innerXml}</${method}Result></${method}Response>
    </soap:Body></soap:Envelope>`;
}

function makeCAEResponse(cae = '71234567890123', resultado = 'A', cbteNro = 1): string {
  return makeWsfeResponse('FECAESolicitar', `
    <FeDetResp><FECAEDetResponse>
      <CAE>${cae}</CAE><CAEFchVto>20260210</CAEFchVto>
      <Resultado>${resultado}</Resultado><CbteDesde>${cbteNro}</CbteDesde>
    </FECAEDetResponse></FeDetResp>`);
}

function mockFetchSequence(...responses: Array<{ ok: boolean; text?: string; json?: unknown }>) {
  fetchMock.mockReset();
  for (const r of responses) {
    fetchMock.mockResolvedValueOnce({
      ok: r.ok,
      statusText: r.ok ? 'OK' : 'Bad Request',
      text: async () => r.text ?? '',
      json: async () => r.json ?? {},
    } as Response);
  }
}

// ─── Constantes fiscales ──────────────────────────────────────────────────────

describe('TipoComprobante — códigos AFIP oficiales', () => {
  it.each([
    ['FACTURA_A', 1],
    ['NOTA_DEBITO_A', 2],
    ['NOTA_CREDITO_A', 3],
    ['FACTURA_B', 6],
    ['NOTA_DEBITO_B', 7],
    ['NOTA_CREDITO_B', 8],
    ['FACTURA_C', 11],
    ['NOTA_DEBITO_C', 12],
    ['NOTA_CREDITO_C', 13],
    ['FACTURA_E', 19],
    ['NOTA_DEBITO_E', 20],
    ['NOTA_CREDITO_E', 21],
  ] as const)('%s tiene código %i', (key, code) => {
    expect(TipoComprobante[key]).toBe(code);
  });
});

describe('TipoDocumento — códigos AFIP oficiales', () => {
  it.each([
    ['CUIT', 80],
    ['CUIL', 86],
    ['CDI', 87],
    ['DNI', 96],
    ['PASAPORTE', 94],
    ['CI_EXTRANJERA', 91],
    ['SIN_IDENTIFICAR', 99],
  ] as const)('%s tiene código %i', (key, code) => {
    expect(TipoDocumento[key]).toBe(code);
  });
});

describe('AlicuotaIVA — códigos e importes', () => {
  it.each([
    ['NO_GRAVADO', 1],
    ['EXENTO', 2],
    ['IVA_0', 3],
    ['IVA_10_5', 4],
    ['IVA_21', 5],
    ['IVA_27', 6],
    ['IVA_5', 8],
    ['IVA_2_5', 9],
  ] as const)('%s tiene código %i', (key, code) => {
    expect(AlicuotaIVA[key]).toBe(code);
  });
});

describe('Concepto — códigos AFIP', () => {
  it.each([
    ['PRODUCTOS', 1],
    ['SERVICIOS', 2],
    ['PRODUCTOS_Y_SERVICIOS', 3],
  ] as const)('%s tiene código %i', (key, code) => {
    expect(Concepto[key]).toBe(code);
  });
});

// ─── URLs de entorno ──────────────────────────────────────────────────────────

describe('AFIP_URLS', () => {
  it.each([
    ['testing', 'homo'],
    ['production', 'servicios1.afip'],
  ] as const)('entorno %s usa URL correcta', (env, urlFragment) => {
    if (env === 'testing') {
      expect(AFIP_URLS.testing.wsaa).toContain('homo');
      expect(AFIP_URLS.testing.wsfe).toContain('homo');
    } else {
      expect(AFIP_URLS.production.wsaa).not.toContain('homo');
      expect(AFIP_URLS.production.wsfe).toContain('servicios1');
    }
  });
});

// ─── Cálculos IVA ────────────────────────────────────────────────────────────

describe('cálculos IVA por alicuota', () => {
  function calcIVA(neto: number, rate: number): number {
    return Number((neto * rate).toFixed(2));
  }

  it.each([
    [1000, 0.21, 210.00],
    [1000, 0.105, 105.00],
    [1000, 0.27, 270.00],
    [1000, 0.05, 50.00],
    [1000, 0.025, 25.00],
    [1000, 0, 0.00],
    [8264.46, 0.21, 1735.54],
    [5000, 0.21, 1050.00],
    [3000, 0.105, 315.00],
    [12000, 0.27, 3240.00],
    [750.50, 0.21, 157.61],
    [100, 0.21, 21.00],
  ])('neto=%f × alicuota=%f = %f', (neto, rate, expected) => {
    expect(calcIVA(neto, rate)).toBeCloseTo(expected, 1);
  });
});

// ─── Validación de totales ────────────────────────────────────────────────────

describe('validación de componentes de factura', () => {
  function validateTotal(neto: number, iva: number, totConc: number, opEx: number, trib: number, total: number): boolean {
    return Math.abs(neto + iva + totConc + opEx + trib - total) <= 0.01;
  }

  it.each([
    [1000, 210, 0, 0, 0, 1210, true],
    [1000, 105, 0, 0, 0, 1105, true],
    [1000, 210, 0, 0, 0, 1500, false],   // total incorrecto
    [8264.46, 1735.54, 0, 0, 0, 10000, true],
    [5000, 1050, 500, 0, 50, 6600, true],
    [5000, 1050, 500, 0, 50, 6500, false], // total incorrecto
    [0, 0, 0, 0, 0, 0, true],             // comprobante en cero
    [10000, 2700, 0, 1000, 100, 13800, true],
    [10000, 2700, 0, 1000, 100, 10000, false],
  ])('neto=%f iva=%f → total=%f válido=%s', (neto, iva, totConc, opEx, trib, total, valid) => {
    expect(validateTotal(neto, iva, totConc, opEx, trib, total)).toBe(valid);
  });
});

// ─── Formateo de fechas AFIP ──────────────────────────────────────────────────

describe('formateo de fechas AFIP (YYYYMMDD)', () => {
  function formatDate(iso: string): string {
    return iso.slice(0, 10).replace(/-/g, '');
  }

  it.each([
    ['2026-01-01', '20260101'],
    ['2026-12-31', '20261231'],
    ['2025-02-28', '20250228'],
    ['2024-02-29', '20240229'], // año bisiesto
    ['2026-03-15', '20260315'],
    ['2026-07-09', '20260709'], // 9 de Julio
    ['2026-11-01', '20261101'], // Día de Todos los Santos
  ])('%s → %s', (input, expected) => {
    expect(formatDate(input)).toBe(expected);
  });
});

// ─── CUIT validation ─────────────────────────────────────────────────────────

describe('validación de formato CUIT/CUIL', () => {
  function isValidCuitFormat(cuit: string): boolean {
    const digits = cuit.replace(/\D/g, '');
    return digits.length === 11;
  }

  it.each([
    ['30-71234567-9', true],
    ['20-12345678-9', true],
    ['23456789012', true],   // sin guiones
    ['27-98765432-1', true],
    ['33-22334455-0', true],
    ['123456789', false],     // corto
    ['30-7123456789-9', false], // largo
    ['', false],
    ['abc-defgh-ij', false],
    ['30-712345 67-9', true],  // con espacio, 11 dígitos igual
  ])('CUIT %s es válido=%s', (cuit, valid) => {
    expect(isValidCuitFormat(cuit)).toBe(valid);
  });
});

// ─── Selección de tipo de factura según condición IVA ────────────────────────

describe('selección de tipo de comprobante según condición IVA', () => {
  function selectFacturaType(emisorRI: boolean, receptorCondicion: number): string {
    if (!emisorRI) return 'FACTURA_C';
    return receptorCondicion === 1 ? 'FACTURA_A' : 'FACTURA_B';
  }

  it.each([
    [true, 1, 'FACTURA_A'],   // RI emite A a RI
    [true, 4, 'FACTURA_B'],   // RI emite B a Exento
    [true, 5, 'FACTURA_B'],   // RI emite B a CF
    [true, 6, 'FACTURA_B'],   // RI emite B a Monotributista
    [false, 1, 'FACTURA_C'],  // Monotributista emite C
    [false, 5, 'FACTURA_C'],  // Monotributista emite C a CF
    [false, 6, 'FACTURA_C'],  // Monotributista emite C a Mono
  ])('emisorRI=%s receptor=%i → %s', (emisorRI, receptor, expected) => {
    expect(selectFacturaType(emisorRI, receptor)).toBe(expected);
  });
});

// ─── Monedas extranjeras ──────────────────────────────────────────────────────

describe('monedas soportadas por AFIP WSFE', () => {
  it.each([
    ['PES', 1, 'Peso Argentino'],
    ['DOL', 1050, 'Dólar Estadounidense'],
    ['EUR', 1150, 'Euro'],
    ['BRL', 210, 'Real Brasileño'],
    ['UYU', 27, 'Peso Uruguayo'],
    ['CLP', 1.2, 'Peso Chileno'],
    ['BOL', 152, 'Boliviano'],
  ])('moneda %s con cotiz %f es válida', (id, cotiz, _desc) => {
    expect(id).toBeTruthy();
    expect(cotiz).toBeGreaterThan(0);
  });
});

// ─── AfipWsfeConnector class ──────────────────────────────────────────────────

describe('AfipWsfeConnector — autenticación', () => {
  beforeEach(() => fetchMock.mockReset());

  it('autentica con WSAA y guarda el token', async () => {
    mockFetchSequence(
      { ok: true, text: makeWsaaResponse('TOK1', 'SGN1') },
      { ok: true, text: makeWsfeResponse('FECompUltimoAutorizado', '<CbteNro>5</CbteNro>') },
    );
    const connector = makeConnector();
    const ultimo = await connector.getUltimoComprobante(1, TipoComprobante.FACTURA_A);
    expect(ultimo).toBe(5);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reutiliza el token en llamadas sucesivas', async () => {
    mockFetchSequence(
      { ok: true, text: makeWsaaResponse() },                                              // auth
      { ok: true, text: makeWsfeResponse('FECompUltimoAutorizado', '<CbteNro>1</CbteNro>') }, // call 1
      { ok: true, text: makeWsfeResponse('FECompUltimoAutorizado', '<CbteNro>2</CbteNro>') }, // call 2 (sin re-auth)
    );
    const connector = makeConnector();
    await connector.getUltimoComprobante(1, TipoComprobante.FACTURA_A);
    await connector.getUltimoComprobante(1, TipoComprobante.FACTURA_B);
    // Solo 1 auth + 2 wsfe calls
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('lanza AUTHENTICATION_FAILED si WSAA devuelve error', async () => {
    mockFetchSequence({ ok: false, text: '<faultstring>Certificado inválido</faultstring>' });
    const connector = makeConnector();
    await expect(connector.getUltimoComprobante(1, 1)).rejects.toThrow('AUTHENTICATION_FAILED');
  });

  it('lanza AUTHENTICATION_FAILED si respuesta no tiene token', async () => {
    mockFetchSequence({ ok: true, text: '<soap:Envelope><soap:Body><empty/></soap:Body></soap:Envelope>' });
    const connector = makeConnector();
    await expect(connector.getUltimoComprobante(1, 1)).rejects.toThrow('AUTHENTICATION_FAILED');
  });
});

describe('AfipWsfeConnector — autorizarComprobante', () => {
  beforeEach(() => fetchMock.mockReset());

  const baseFactura = {
    PtoVta: 1,
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
    CbteDesde: 1,
    CbteHasta: 1,
  };

  it('devuelve CAE exitoso para factura B', async () => {
    mockFetchSequence(
      { ok: true, text: makeWsaaResponse() },
      { ok: true, text: makeCAEResponse('71234567890123', 'A', 1) },
    );
    const connector = makeConnector();
    const result = await connector.autorizarComprobante(baseFactura);
    expect(result.success).toBe(true);
    expect(result.cae).toBe('71234567890123');
    expect(result.cbteNro).toBe(1);
  });

  it('devuelve success=false cuando resultado es R (rechazado)', async () => {
    mockFetchSequence(
      { ok: true, text: makeWsaaResponse() },
      { ok: true, text: makeCAEResponse('00000000000000', 'R', 1) },
    );
    const connector = makeConnector();
    const result = await connector.autorizarComprobante(baseFactura);
    expect(result.success).toBe(false);
  });

  it.each([
    [TipoComprobante.FACTURA_A, TipoDocumento.CUIT, '30712345679', Concepto.PRODUCTOS],
    [TipoComprobante.FACTURA_B, TipoDocumento.DNI, '12345678', Concepto.PRODUCTOS],
    [TipoComprobante.FACTURA_C, TipoDocumento.SIN_IDENTIFICAR, '0', Concepto.PRODUCTOS],
    [TipoComprobante.NOTA_CREDITO_A, TipoDocumento.CUIT, '30712345679', Concepto.SERVICIOS],
    [TipoComprobante.NOTA_CREDITO_B, TipoDocumento.DNI, '12345678', Concepto.SERVICIOS],
    [TipoComprobante.NOTA_DEBITO_A, TipoDocumento.CUIT, '30712345679', Concepto.PRODUCTOS_Y_SERVICIOS],
  ])('CbteTipo=%i DocTipo=%i Concepto=%i → CAE exitoso', async (cbteTipo, docTipo, docNro, concepto) => {
    const fchServDesde = concepto !== Concepto.PRODUCTOS ? '20260101' : undefined;
    const fchServHasta = concepto !== Concepto.PRODUCTOS ? '20260131' : undefined;

    mockFetchSequence(
      { ok: true, text: makeWsaaResponse() },
      { ok: true, text: makeCAEResponse() },
    );
    const connector = makeConnector();
    const result = await connector.autorizarComprobante({
      ...baseFactura,
      CbteTipo: cbteTipo,
      DocTipo: docTipo,
      DocNro: docNro,
      Concepto: concepto,
      CbteDesde: 1,
      CbteHasta: 1,
      FchServDesde: fchServDesde,
      FchServHasta: fchServHasta,
    });
    expect(result.success).toBe(true);
  });

  it('consulta getUltimoComprobante cuando CbteDesde no está definido', async () => {
    mockFetchSequence(
      { ok: true, text: makeWsaaResponse() },
      { ok: true, text: makeWsfeResponse('FECompUltimoAutorizado', '<CbteNro>10</CbteNro>') },
      { ok: true, text: makeCAEResponse('71234567890123', 'A', 11) },
    );
    const connector = makeConnector();
    const { CbteDesde: _a, CbteHasta: _b, ...facturaWithoutNro } = baseFactura;
    const result = await connector.autorizarComprobante(facturaWithoutNro);
    expect(result.cbteNro).toBe(11);
    expect(fetchMock).toHaveBeenCalledTimes(3); // auth + getUltimo + solicitar
  });
});

describe('AfipWsfeConnector — getUltimoComprobante', () => {
  beforeEach(() => fetchMock.mockReset());

  it.each([
    [1, TipoComprobante.FACTURA_A, 42],
    [1, TipoComprobante.FACTURA_B, 100],
    [2, TipoComprobante.FACTURA_A, 0],
    [5, TipoComprobante.NOTA_CREDITO_B, 7],
    [1, TipoComprobante.FACTURA_C, 999],
  ])('PtoVta=%i CbteTipo=%i → CbteNro=%i', async (ptoVta, cbteTipo, cbteNro) => {
    mockFetchSequence(
      { ok: true, text: makeWsaaResponse() },
      { ok: true, text: makeWsfeResponse('FECompUltimoAutorizado', `<CbteNro>${cbteNro}</CbteNro>`) },
    );
    const connector = makeConnector();
    const result = await connector.getUltimoComprobante(ptoVta, cbteTipo);
    expect(result).toBe(cbteNro);
  });
});

describe('AfipWsfeConnector — getCotizacion', () => {
  beforeEach(() => fetchMock.mockReset());

  it.each([
    ['DOL', 1050],
    ['EUR', 1150],
    ['BRL', 210],
    ['PES', 1],
  ])('moneda %s → cotiz %f', async (monId, cotiz) => {
    mockFetchSequence(
      { ok: true, text: makeWsaaResponse() },
      { ok: true, text: makeWsfeResponse('FEParamGetCotizacion', `<ResultGet><MonCotiz>${cotiz}</MonCotiz></ResultGet>`) },
    );
    const connector = makeConnector();
    const result = await connector.getCotizacion(monId);
    expect(result).toBe(cotiz);
  });
});

describe('AfipWsfeConnector — entornos', () => {
  it('usa URL de testing en entorno testing', async () => {
    mockFetchSequence(
      { ok: true, text: makeWsaaResponse() },
      { ok: true, text: makeWsfeResponse('FECompUltimoAutorizado', '<CbteNro>1</CbteNro>') },
    );
    const connector = makeConnector('testing');
    await connector.getUltimoComprobante(1, 1);
    const wsaaCall = fetchMock.mock.calls[0][0] as string;
    expect(wsaaCall).toContain('homo');
  });

  it('usa URL de producción en entorno production', async () => {
    mockFetchSequence(
      { ok: true, text: makeWsaaResponse() },
      { ok: true, text: makeWsfeResponse('FECompUltimoAutorizado', '<CbteNro>1</CbteNro>') },
    );
    const connector = makeConnector('production');
    await connector.getUltimoComprobante(1, 1);
    const wsaaCall = fetchMock.mock.calls[0][0] as string;
    expect(wsaaCall).not.toContain('homo');
  });
});

describe('AfipWsfeConnector — testConnection', () => {
  beforeEach(() => fetchMock.mockReset());

  it('devuelve success=true cuando FEDummy responde OK', async () => {
    mockFetchSequence(
      { ok: true, text: makeWsaaResponse() },
      { ok: true, text: makeWsfeResponse('FEDummy', '<AppServer>OK</AppServer>') },
    );
    const connector = makeConnector();
    const result = await connector.testConnection({} as any);
    expect(result.success).toBe(true);
  });

  it('devuelve success=false cuando la conexión falla', async () => {
    mockFetchSequence({ ok: false });
    const connector = makeConnector();
    const result = await connector.testConnection({} as any);
    expect(result.success).toBe(false);
  });
});

describe('AfipWsfeConnector — crearFactura helper', () => {
  beforeEach(() => fetchMock.mockReset());

  it.each([
    [TipoComprobante.FACTURA_A, TipoDocumento.CUIT, '30712345679', 1, 10000, 2100],
    [TipoComprobante.FACTURA_B, TipoDocumento.DNI, '12345678', 1, 8264.46, 1735.54],
    [TipoComprobante.FACTURA_C, TipoDocumento.SIN_IDENTIFICAR, '0', 1, 500, 0],
  ])('crea factura tipo %i exitosamente', async (tipo, docTipo, docNro, concepto, neto, iva) => {
    mockFetchSequence(
      { ok: true, text: makeWsaaResponse() },
      { ok: true, text: makeWsfeResponse('FECompUltimoAutorizado', '<CbteNro>0</CbteNro>') },
      { ok: true, text: makeCAEResponse() },
    );
    const connector = makeConnector();
    const result = await connector.crearFactura({
      puntoVenta: 1,
      tipoComprobante: tipo,
      docTipo: docTipo,
      docNro,
      concepto: concepto as 1 | 2 | 3,
      importeNeto: neto,
      importeIva: iva,
    });
    expect(result.success).toBe(true);
  });
});

describe('AfipWsfeConnector — getSpec', () => {
  it('devuelve spec con id correcto', () => {
    const connector = makeConnector();
    const spec = connector.getSpec();
    expect(spec.metadata.id).toBe('afip-wsfe');
    expect(spec.metadata.category).toBe('fiscal');
    expect(spec.actions.length).toBeGreaterThanOrEqual(4);
  });

  it('incluye acción autorizar_comprobante', () => {
    const connector = makeConnector();
    const spec = connector.getSpec();
    const actionIds = spec.actions.map(a => a.id);
    expect(actionIds).toContain('autorizar_comprobante');
    expect(actionIds).toContain('get_ultimo_comprobante');
    expect(actionIds).toContain('get_puntos_venta');
    expect(actionIds).toContain('get_cotizacion');
  });
});
