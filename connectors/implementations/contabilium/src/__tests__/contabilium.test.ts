/**
 * Contabilium Connector — Tests exhaustivos
 *
 * Cubre: tipos, validación, cálculos de comprobantes, clase ContabiliumConnector
 * con fetch mockeado. No requiere credenciales reales de Contabilium.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));
global.fetch = fetchMock;

import { ContabiliumConnector, ClienteSchema, ProductoSchema, ComprobanteSchema, PagoSchema } from '../index.js';
import type { Cliente, Producto, Comprobante, Pago } from '../index.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeConnector() {
  return new ContabiliumConnector({
    clientId: 'client_id_test',
    clientSecret: 'client_secret_test',
    defaultPuntoVenta: 1,
  });
}

function mockTokenResponse(expiresIn = 3600) {
  return {
    ok: true,
    json: async () => ({
      access_token: 'ACCESS_TOKEN_123',
      token_type: 'bearer',
      expires_in: expiresIn,
      refresh_token: 'REFRESH_TOKEN_456',
    }),
  } as Response;
}

function mockJsonResponse(data: unknown, ok = true) {
  return {
    ok,
    statusText: ok ? 'OK' : 'Not Found',
    json: async () => data,
    text: async () => JSON.stringify(data),
  } as Response;
}

function mockFetchSequence(...responses: Response[]) {
  fetchMock.mockReset();
  for (const r of responses) {
    fetchMock.mockResolvedValueOnce(r);
  }
}

const makeCliente = (overrides: Partial<Cliente> = {}): Cliente => ({
  RazonSocial: 'Empresa Test SRL',
  NumeroDocumento: '30-71234567-9',
  TipoDocumento: 'CUIT',
  CondicionIVA: 'ResponsableInscripto',
  Activo: true,
  ...overrides,
});

const makeClienteResponse = (id: number, overrides: Partial<Cliente> = {}) => ({
  Id: id,
  RazonSocial: 'Empresa Test SRL',
  NumeroDocumento: '30-71234567-9',
  TipoDocumento: 'CUIT',
  CondicionIVA: 'ResponsableInscripto',
  Activo: true,
  FechaCreacion: '2026-01-01T00:00:00',
  FechaModificacion: '2026-01-01T00:00:00',
  ...overrides,
});

const makeComprobanteItem = (overrides = {}) => ({
  ConceptoId: 1,
  Descripcion: 'Servicio de consultoría',
  Cantidad: 1,
  PrecioUnitario: 10000,
  AlicuotaIVA: 21,
  ...overrides,
});

// ─── ClienteSchema validation ─────────────────────────────────────────────────

describe('ClienteSchema — validación Zod', () => {
  it.each([
    ['ResponsableInscripto', 'CUIT', '30-71234567-9'],
    ['Monotributista', 'CUIT', '27-12345678-9'],
    ['ConsumidorFinal', 'DNI', '12345678'],
    ['Exento', 'CUIT', '30-99999999-9'],
    ['NoResponsable', 'CUIT', '20-33333333-3'],
  ])('condición IVA %s es válida', (condicion, tipoDoc, doc) => {
    const result = ClienteSchema.safeParse(makeCliente({
      CondicionIVA: condicion as Cliente['CondicionIVA'],
      TipoDocumento: tipoDoc as Cliente['TipoDocumento'],
      NumeroDocumento: doc,
    }));
    expect(result.success).toBe(true);
  });

  it.each([
    ['CUIT', '30-71234567-9'],
    ['CUIL', '27-12345678-9'],
    ['DNI', '12345678'],
    ['PASAPORTE', 'AB123456'],
    ['CI', 'CI123456'],
  ])('TipoDocumento %s es válido', (tipoDoc, doc) => {
    const result = ClienteSchema.safeParse(makeCliente({
      TipoDocumento: tipoDoc as Cliente['TipoDocumento'],
      NumeroDocumento: doc,
    }));
    expect(result.success).toBe(true);
  });

  it('rechaza condición IVA desconocida', () => {
    const result = ClienteSchema.safeParse(makeCliente({ CondicionIVA: 'Invalido' as any }));
    expect(result.success).toBe(false);
  });

  it('rechaza email inválido', () => {
    const result = ClienteSchema.safeParse(makeCliente({ Email: 'not-an-email' }));
    expect(result.success).toBe(false);
  });

  it('acepta email válido', () => {
    const result = ClienteSchema.safeParse(makeCliente({ Email: 'contacto@empresa.com.ar' }));
    expect(result.success).toBe(true);
  });
});

// ─── Cálculo de totales de comprobante ───────────────────────────────────────

describe('cálculo de totales de comprobante', () => {
  function calculateTotal(items: Array<{ Cantidad: number; PrecioUnitario: number; AlicuotaIVA: number; BonificacionPorcentaje?: number }>): number {
    return items.reduce((sum, item) => {
      const subtotal = item.Cantidad * item.PrecioUnitario;
      const bonif = subtotal * (item.BonificacionPorcentaje ?? 0) / 100;
      const neto = subtotal - bonif;
      const iva = neto * item.AlicuotaIVA / 100;
      return sum + neto + iva;
    }, 0);
  }

  it.each([
    // [items, expectedTotal]
    [[{ Cantidad: 1, PrecioUnitario: 1000, AlicuotaIVA: 21 }], 1210],
    [[{ Cantidad: 2, PrecioUnitario: 500, AlicuotaIVA: 21 }], 1210],
    [[{ Cantidad: 1, PrecioUnitario: 1000, AlicuotaIVA: 10.5 }], 1105],
    [[{ Cantidad: 1, PrecioUnitario: 1000, AlicuotaIVA: 27 }], 1270],
    [[{ Cantidad: 1, PrecioUnitario: 1000, AlicuotaIVA: 0 }], 1000],
    [[{ Cantidad: 1, PrecioUnitario: 1000, AlicuotaIVA: 21, BonificacionPorcentaje: 10 }], 1089],
    [[{ Cantidad: 1, PrecioUnitario: 1000, AlicuotaIVA: 21, BonificacionPorcentaje: 50 }], 605],
    [[
      { Cantidad: 1, PrecioUnitario: 1000, AlicuotaIVA: 21 },
      { Cantidad: 2, PrecioUnitario: 500, AlicuotaIVA: 21 },
    ], 2420],
    [[
      { Cantidad: 1, PrecioUnitario: 5000, AlicuotaIVA: 21 },
      { Cantidad: 1, PrecioUnitario: 3000, AlicuotaIVA: 10.5 },
    ], 5000 * 1.21 + 3000 * 1.105],
  ])('items %# → total %f', (items, expected) => {
    expect(calculateTotal(items)).toBeCloseTo(expected as number, 1);
  });
});

// ─── Selección de tipo de factura ────────────────────────────────────────────

describe('selección de tipo comprobante por condición IVA', () => {
  function selectTipo(emisor: 'ResponsableInscripto' | 'Monotributista', receptor: string): string {
    if (emisor === 'Monotributista') return 'FacturaC';
    return receptor === 'ResponsableInscripto' ? 'FacturaA' : 'FacturaB';
  }

  it.each([
    ['ResponsableInscripto', 'ResponsableInscripto', 'FacturaA'],
    ['ResponsableInscripto', 'ConsumidorFinal', 'FacturaB'],
    ['ResponsableInscripto', 'Monotributista', 'FacturaB'],
    ['ResponsableInscripto', 'Exento', 'FacturaB'],
    ['Monotributista', 'ResponsableInscripto', 'FacturaC'],
    ['Monotributista', 'ConsumidorFinal', 'FacturaC'],
    ['Monotributista', 'Monotributista', 'FacturaC'],
  ] as const)('emisor=%s receptor=%s → %s', (emisor, receptor, expected) => {
    expect(selectTipo(emisor, receptor)).toBe(expected);
  });
});

// ─── CUIT format validation ───────────────────────────────────────────────────

describe('validación de CUIT en LatAm Argentina', () => {
  function isValidCuit(cuit: string): boolean {
    const digits = cuit.replace(/[-\s]/g, '');
    if (digits.length !== 11) return false;
    if (!/^\d+$/.test(digits)) return false;

    // Verificación dígito verificador CUIT
    const factors = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < 10; i++) sum += parseInt(digits[i]) * factors[i];
    const remainder = sum % 11;
    const check = remainder === 0 ? 0 : remainder === 1 ? 9 : 11 - remainder;
    return check === parseInt(digits[10]);
  }

  it.each([
    ['30-71234567-9', true],   // empresa
    ['20-12345678-9', true],   // persona
    ['27-98765432-1', false],  // dígito verificador incorrecto
    ['30-00000000-4', true],   // CUIT con ceros
    ['12345678', false],       // muy corto
    ['', false],               // vacío
  ])('CUIT %s válido=%s', (cuit, valid) => {
    expect(isValidCuit(cuit)).toBe(valid);
  });
});

// ─── Medios de pago ───────────────────────────────────────────────────────────

describe('medios de pago soportados', () => {
  const mediosPago = [
    { codigo: 'EF', nombre: 'Efectivo' },
    { codigo: 'TC', nombre: 'Tarjeta Crédito' },
    { codigo: 'TD', nombre: 'Tarjeta Débito' },
    { codigo: 'TB', nombre: 'Transferencia Bancaria' },
    { codigo: 'MP', nombre: 'MercadoPago' },
    { codigo: 'CH', nombre: 'Cheque' },
    { codigo: 'DEB', nombre: 'Débito Automático' },
    { codigo: 'OT', nombre: 'Otro' },
  ];

  it.each(mediosPago)('medio de pago $codigo ($nombre) está definido', ({ codigo, nombre }) => {
    expect(codigo).toBeTruthy();
    expect(nombre).toBeTruthy();
  });

  it('todos los medios de pago tienen código único', () => {
    const codes = mediosPago.map(m => m.codigo);
    expect(new Set(codes).size).toBe(codes.length);
  });
});

// ─── Provincias argentinas ────────────────────────────────────────────────────

describe('provincias argentinas (Contabilium)', () => {
  const provincias = [
    'Buenos Aires', 'CABA', 'Catamarca', 'Chaco', 'Chubut',
    'Córdoba', 'Corrientes', 'Entre Ríos', 'Formosa', 'Jujuy',
    'La Pampa', 'La Rioja', 'Mendoza', 'Misiones', 'Neuquén',
    'Río Negro', 'Salta', 'San Juan', 'San Luis', 'Santa Cruz',
    'Santa Fe', 'Santiago del Estero', 'Tierra del Fuego', 'Tucumán',
  ];

  it('hay 24 jurisdicciones', () => {
    expect(provincias).toHaveLength(24);
  });

  it.each(['Buenos Aires', 'CABA', 'Córdoba', 'Santa Fe', 'Mendoza'])(
    'provincia %s está en la lista',
    (prov) => {
      expect(provincias).toContain(prov);
    }
  );
});

// ─── ContabiliumConnector — autenticación ────────────────────────────────────

describe('ContabiliumConnector — autenticación OAuth2', () => {
  beforeEach(() => fetchMock.mockReset());

  it('obtiene access token con client_credentials', async () => {
    mockFetchSequence(
      mockTokenResponse(),
      mockJsonResponse({ Id: 1, RazonSocial: 'Empresa Test SRL', NumeroDocumento: '30-71234567-9', TipoDocumento: 'CUIT', CondicionIVA: 'ResponsableInscripto', Activo: true, FechaCreacion: '2026-01-01', FechaModificacion: '2026-01-01' }),
    );
    const connector = makeConnector();
    const cliente = await connector.getCliente(1);
    expect(cliente.Id).toBe(1);

    const tokenCall = fetchMock.mock.calls[0];
    expect(tokenCall[0]).toContain('token');
    const body = tokenCall[1]?.body as string;
    expect(body).toContain('client_credentials');
  });

  it('reutiliza token válido sin re-autenticar', async () => {
    mockFetchSequence(
      mockTokenResponse(3600),
      mockJsonResponse(makeClienteResponse(1)),
      mockJsonResponse(makeClienteResponse(2)),
    );
    const connector = makeConnector();
    await connector.getCliente(1);
    await connector.getCliente(2);
    // Solo 1 auth + 2 API calls
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('lanza AUTHENTICATION_FAILED cuando auth devuelve error', async () => {
    mockFetchSequence({ ok: false, statusText: 'Unauthorized', json: async () => ({ error: 'invalid_client' }), text: async () => 'Unauthorized' } as Response);
    const connector = makeConnector();
    await expect(connector.getCliente(1)).rejects.toThrow('AUTHENTICATION_FAILED');
  });
});

// ─── ContabiliumConnector — getCliente ───────────────────────────────────────

describe('ContabiliumConnector — getCliente', () => {
  beforeEach(() => fetchMock.mockReset());

  it.each([1, 10, 100, 999, 5000])('getCliente(%i) llama al endpoint correcto', async (id) => {
    mockFetchSequence(mockTokenResponse(), mockJsonResponse(makeClienteResponse(id)));
    const connector = makeConnector();
    const cliente = await connector.getCliente(id);
    expect(cliente.Id).toBe(id);
    const apiCall = fetchMock.mock.calls[1][0] as string;
    expect(apiCall).toContain(`/clientes/${id}`);
  });

  it('lanza NOT_FOUND cuando el cliente no existe', async () => {
    mockFetchSequence(
      mockTokenResponse(),
      { ok: false, statusText: 'Not Found', json: async () => ({ Message: 'Cliente not found' }), text: async () => '' } as Response,
    );
    const connector = makeConnector();
    await expect(connector.getCliente(99999)).rejects.toThrow('NOT_FOUND');
  });
});

// ─── ContabiliumConnector — searchClientes ────────────────────────────────────

describe('ContabiliumConnector — searchClientes', () => {
  beforeEach(() => fetchMock.mockReset());

  it.each([
    ['30-71234567-9', 1, 10],
    ['Empresa Test', 1, 20],
    ['', 1, 50],
    ['Acme SA', 2, 5],
  ])('busca "%s" página %i tamaño %i', async (query, page, pageSize) => {
    const items = Array.from({ length: pageSize }, (_, i) => makeClienteResponse(i + 1));
    mockFetchSequence(mockTokenResponse(), mockJsonResponse({ Items: items, TotalCount: 50, Page: page, PageSize: pageSize }));
    const connector = makeConnector();
    const result = await connector.searchClientes(query || undefined, page, pageSize);
    expect(result.Items).toHaveLength(pageSize);
    const apiUrl = fetchMock.mock.calls[1][0] as string;
    expect(apiUrl).toContain(`page=${page}`);
    expect(apiUrl).toContain(`pageSize=${pageSize}`);
    if (query) expect(apiUrl).toContain('filtro=');
  });
});

// ─── ContabiliumConnector — createCliente ────────────────────────────────────

describe('ContabiliumConnector — createCliente', () => {
  beforeEach(() => fetchMock.mockReset());

  const clientes: Cliente[] = [
    { RazonSocial: 'Empresa A SRL', NumeroDocumento: '30-71234567-9', TipoDocumento: 'CUIT', CondicionIVA: 'ResponsableInscripto', Activo: true },
    { RazonSocial: 'Juan Pérez', NumeroDocumento: '20-12345678-9', TipoDocumento: 'CUIT', CondicionIVA: 'ConsumidorFinal', Activo: true },
    { RazonSocial: 'María García', NumeroDocumento: '27-98765432-1', TipoDocumento: 'CUIL', CondicionIVA: 'Monotributista', Email: 'maria@example.com', Activo: true },
    { RazonSocial: 'Proveedor Exento SA', NumeroDocumento: '30-55555555-5', TipoDocumento: 'CUIT', CondicionIVA: 'Exento', Activo: true },
    { RazonSocial: 'Turista', NumeroDocumento: 'AA123456', TipoDocumento: 'PASAPORTE', CondicionIVA: 'ConsumidorFinal', Activo: true },
  ];

  it.each(clientes)('crea cliente $RazonSocial con CondicionIVA $CondicionIVA', async (cliente) => {
    mockFetchSequence(
      mockTokenResponse(),
      mockJsonResponse({ ...makeClienteResponse(99), ...cliente }),
    );
    const connector = makeConnector();
    const result = await connector.createCliente(cliente);
    expect(result.RazonSocial).toBe(cliente.RazonSocial);
  });
});

// ─── ContabiliumConnector — Productos ────────────────────────────────────────

describe('ContabiliumConnector — getProducto', () => {
  beforeEach(() => fetchMock.mockReset());

  it.each([1, 5, 100])('getProducto(%i) llama a /conceptos/%i', async (id) => {
    mockFetchSequence(
      mockTokenResponse(),
      mockJsonResponse({ Id: id, Codigo: `PROD-${id}`, Nombre: `Producto ${id}`, Precio: id * 1000, AlicuotaIVA: 21, Tipo: 'Producto', Activo: true, FechaCreacion: '2026-01-01', FechaModificacion: '2026-01-01' }),
    );
    const connector = makeConnector();
    const prod = await connector.getProducto(id);
    expect(prod.Id).toBe(id);
    const apiCall = fetchMock.mock.calls[1][0] as string;
    expect(apiCall).toContain(`/conceptos/${id}`);
  });
});

// ─── ContabiliumConnector — createComprobante ────────────────────────────────

describe('ContabiliumConnector — createComprobante', () => {
  beforeEach(() => fetchMock.mockReset());

  const tiposComprobante = ['FacturaA', 'FacturaB', 'FacturaC', 'NotaCreditoA', 'NotaCreditoB', 'Presupuesto', 'Remito'] as const;

  it.each(tiposComprobante)('crea comprobante tipo %s', async (tipo) => {
    const comprobanteResponse = {
      Id: 1,
      ClienteId: 1,
      Tipo: tipo,
      PuntoVenta: 1,
      Numero: 1,
      Fecha: '2026-01-25',
      Items: [makeComprobanteItem()],
      Total: 12100,
      Estado: 'Pendiente',
      FechaCreacion: '2026-01-25T10:00:00',
    };
    mockFetchSequence(mockTokenResponse(), mockJsonResponse(comprobanteResponse));

    const connector = makeConnector();
    const comprobante: Comprobante = {
      ClienteId: 1,
      Tipo: tipo,
      PuntoVenta: 1,
      Fecha: '2026-01-25',
      Items: [makeComprobanteItem()],
      Moneda: 'ARS',
      Cotizacion: 1,
      Pagado: false,
    };
    const result = await connector.createComprobante(comprobante);
    expect(result.Tipo).toBe(tipo);
    expect(result.Estado).toBe('Pendiente');
  });
});

// ─── ContabiliumConnector — facturarComprobante ───────────────────────────────

describe('ContabiliumConnector — facturarComprobante', () => {
  beforeEach(() => fetchMock.mockReset());

  it.each([1, 5, 100])('factura comprobante %i → obtiene CAE', async (id) => {
    const facturadoResponse = {
      Id: id,
      Estado: 'Facturado',
      CAE: '71234567890123',
      CAEVencimiento: '2026-02-10',
      Numero: `A-0001-${String(id).padStart(8, '0')}`,
    };
    mockFetchSequence(mockTokenResponse(), mockJsonResponse(facturadoResponse));
    const connector = makeConnector();
    const result = await connector.facturarComprobante(id);
    expect(result.Estado).toBe('Facturado');
    expect(result.CAE).toBe('71234567890123');
  });

  it('propaga error cuando AFIP rechaza', async () => {
    mockFetchSequence(
      mockTokenResponse(),
      { ok: false, statusText: 'Bad Request', json: async () => ({ Message: 'AFIP rechazó: DocNro inválido' }), text: async () => '' } as Response,
    );
    const connector = makeConnector();
    await expect(connector.facturarComprobante(1)).rejects.toThrow('API_ERROR');
  });
});

// ─── ContabiliumConnector — registrarPago ────────────────────────────────────

describe('ContabiliumConnector — registrarPago', () => {
  beforeEach(() => fetchMock.mockReset());

  it.each([
    ['EF', 2420],
    ['TC', 5000],
    ['MP', 10000],
    ['TB', 15000],
    ['TD', 3000],
  ])('pago con medio %s por $%f', async (medioPago, monto) => {
    const pagoResponse = {
      Id: 1,
      ComprobanteId: 1,
      Monto: monto,
      MedioPago: medioPago,
      Fecha: '2026-01-25',
      FechaCreacion: '2026-01-25T10:00:00',
    };
    mockFetchSequence(mockTokenResponse(), mockJsonResponse(pagoResponse));

    const connector = makeConnector();
    const pago: Pago = {
      ComprobanteId: 1,
      Monto: monto,
      MedioPago: medioPago,
      Fecha: '2026-01-25',
    };
    const result = await connector.registrarPago(pago);
    expect(result.Monto).toBe(monto);
    expect(result.MedioPago).toBe(medioPago);
  });
});

// ─── ContabiliumConnector — crearFacturaCompleta ─────────────────────────────

describe('ContabiliumConnector — crearFacturaCompleta', () => {
  beforeEach(() => fetchMock.mockReset());

  it('flujo completo con cliente existente (by CUIT)', async () => {
    const clienteResponse = makeClienteResponse(5);
    mockFetchSequence(
      mockTokenResponse(),
      // searchClientes para getClienteByCuit
      mockJsonResponse({ Items: [clienteResponse], TotalCount: 1, Page: 1, PageSize: 20 }),
      // createComprobante
      mockJsonResponse({ Id: 10, ClienteId: 5, Tipo: 'FacturaA', Estado: 'Pendiente', Total: 12100 }),
      // facturarComprobante (es FacturaA)
      mockJsonResponse({ Id: 10, Estado: 'Facturado', CAE: '71234567890123', CAEVencimiento: '2026-02-10' }),
    );
    const connector = makeConnector();
    const result = await connector.crearFacturaCompleta({
      cliente: makeCliente(),
      items: [makeComprobanteItem()],
      tipo: 'FacturaA',
    });
    expect(result.Estado).toBe('Facturado');
  });

  it('flujo con cliente nuevo (crea cliente primero)', async () => {
    mockFetchSequence(
      mockTokenResponse(),
      // searchClientes: no encuentra
      mockJsonResponse({ Items: [], TotalCount: 0, Page: 1, PageSize: 20 }),
      // createCliente
      mockJsonResponse(makeClienteResponse(99)),
      // createComprobante
      mockJsonResponse({ Id: 20, ClienteId: 99, Tipo: 'FacturaB', Estado: 'Pendiente', Total: 1210 }),
      // facturarComprobante
      mockJsonResponse({ Id: 20, Estado: 'Facturado', CAE: '71234567890124', CAEVencimiento: '2026-02-10' }),
    );
    const connector = makeConnector();
    const result = await connector.crearFacturaCompleta({
      cliente: makeCliente({ RazonSocial: 'Nuevo Cliente SAS' }),
      items: [makeComprobanteItem({ PrecioUnitario: 1000 })],
      tipo: 'FacturaB',
    });
    expect(result.Estado).toBe('Facturado');
    expect(fetchMock).toHaveBeenCalledTimes(5); // auth + search + create cliente + comprobante + facturar
  });

  it('no llama a facturar para Presupuesto', async () => {
    mockFetchSequence(
      mockTokenResponse(),
      mockJsonResponse({ Items: [makeClienteResponse(1)], TotalCount: 1, Page: 1, PageSize: 20 }),
      mockJsonResponse({ Id: 30, ClienteId: 1, Tipo: 'Presupuesto', Estado: 'Pendiente', Total: 5000 }),
    );
    const connector = makeConnector();
    const result = await connector.crearFacturaCompleta({
      cliente: makeCliente(),
      items: [makeComprobanteItem({ PrecioUnitario: 5000, AlicuotaIVA: 0 })],
      tipo: 'Presupuesto',
    });
    expect(result.Estado).toBe('Pendiente');
    expect(fetchMock).toHaveBeenCalledTimes(3); // auth + search + comprobante (sin facturar)
  });

  it('flujo con clienteId numérico directo (sin búsqueda)', async () => {
    mockFetchSequence(
      mockTokenResponse(),
      mockJsonResponse({ Id: 50, ClienteId: 42, Tipo: 'FacturaA', Estado: 'Pendiente', Total: 12100 }),
      mockJsonResponse({ Id: 50, Estado: 'Facturado', CAE: '71234567890125', CAEVencimiento: '2026-02-10' }),
    );
    const connector = makeConnector();
    const result = await connector.crearFacturaCompleta({
      cliente: 42, // ID directo
      items: [makeComprobanteItem()],
      tipo: 'FacturaA',
    });
    expect(result.Estado).toBe('Facturado');
    expect(fetchMock).toHaveBeenCalledTimes(3); // auth + comprobante + facturar (sin búsqueda)
  });
});

// ─── ContabiliumConnector — searchComprobantes ───────────────────────────────

describe('ContabiliumConnector — searchComprobantes', () => {
  beforeEach(() => fetchMock.mockReset());

  it.each([
    [{ clienteId: 1, tipo: 'FacturaA' }, 'clienteId=1'],
    [{ tipo: 'NotaCreditoB' }, 'tipo=NotaCreditoB'],
    [{ desde: '2026-01-01', hasta: '2026-01-31' }, 'desde=2026-01-01'],
    [{ estado: 'Facturado' }, 'estado=Facturado'],
  ])('filtra por %o → URL contiene %s', async (filters, expectedParam) => {
    mockFetchSequence(mockTokenResponse(), mockJsonResponse({ Items: [], TotalCount: 0, Page: 1, PageSize: 20 }));
    const connector = makeConnector();
    await connector.searchComprobantes(filters);
    const apiUrl = fetchMock.mock.calls[1][0] as string;
    expect(apiUrl).toContain(expectedParam);
  });
});

// ─── ContabiliumConnector — getSpec ──────────────────────────────────────────

describe('ContabiliumConnector — getSpec', () => {
  it('devuelve spec con id correcto', () => {
    const connector = makeConnector();
    const spec = connector.getSpec();
    expect(spec.metadata.id).toBe('contabilium');
    expect(spec.metadata.category).toBe('erp');
    expect(spec.authType).toBe('oauth2');
  });

  it('incluye todas las acciones esperadas', () => {
    const connector = makeConnector();
    const spec = connector.getSpec();
    const actionIds = spec.actions.map((a) => a.id);
    const required = ['get_cliente', 'create_cliente', 'search_clientes', 'get_comprobante', 'create_comprobante', 'facturar_comprobante', 'registrar_pago'];
    for (const id of required) {
      expect(actionIds).toContain(id);
    }
  });
});

// ─── ContabiliumConnector — testConnection ────────────────────────────────────

describe('ContabiliumConnector — testConnection', () => {
  beforeEach(() => fetchMock.mockReset());

  it('devuelve success=true cuando /usuarios/me responde OK', async () => {
    mockFetchSequence(
      mockTokenResponse(),
      mockJsonResponse({ Id: 1, Email: 'admin@empresa.com', Nombre: 'Administrador' }),
    );
    const connector = makeConnector();
    const result = await connector.testConnection({} as any);
    expect(result.success).toBe(true);
  });

  it('devuelve success=false cuando falla autenticación', async () => {
    mockFetchSequence({ ok: false, statusText: 'Unauthorized', json: async () => ({ error: 'invalid_client' }), text: async () => '' } as Response);
    const connector = makeConnector();
    const result = await connector.testConnection({} as any);
    expect(result.success).toBe(false);
  });
});
