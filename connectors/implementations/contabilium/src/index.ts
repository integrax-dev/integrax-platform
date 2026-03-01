/**
 * Contabilium Connector
 *
 * Conector para el ERP Contabilium, muy usado en Argentina para PyMEs.
 * Permite gestionar clientes, productos, comprobantes (facturas) y pagos.
 */

import {
  BaseConnector,
  ConnectorSpec,
  ActionDefinition,
  ResolvedCredentials,
  HttpClient,
  ConnectorError,
} from '@integrax/connector-sdk';
import { z } from 'zod';
import {
  ContabiliumConfig,
  ContabiliumCredentials,
  ContabiliumTokenResponse,
  Cliente,
  ClienteResponse,
  ClienteSchema,
  Producto,
  ProductoResponse,
  ProductoSchema,
  Comprobante,
  ComprobanteResponse,
  ComprobanteSchema,
  Pago,
  PagoResponse,
  PagoSchema,
  ContabiliumListResponse,
} from './types.js';

const CONTABILIUM_API_URL = 'https://rest.contabilium.com/api';
const CONTABILIUM_AUTH_URL = 'https://rest.contabilium.com/token';

export class ContabiliumConnector extends BaseConnector {
  private config: ContabiliumConfig;
  private credentials: ContabiliumCredentials;
  private httpClient: HttpClient;

  constructor(config: ContabiliumConfig) {
    super();
    this.config = config;
    this.credentials = {
      clientId: config.clientId,
      clientSecret: config.clientSecret,
    };
    this.httpClient = new HttpClient({
      baseUrl: CONTABILIUM_API_URL,
      timeout: 30000,
    });
  }

  // ============================================
  // BaseConnector Implementations
  // ============================================

  protected registerActions(): void {
    // Actions are registered automatically via getActions or we can register them here.
    const actions = this.getActions();
    for (const action of actions) {
      this.registerAction(action.id, async (input: any) => {
        // Simple dispatcher since the old code didn't use registerAction
        const method = action.id as keyof this;
        if (typeof this[method] === 'function') {
          return (this as any)[method](input);
        }
        throw new ConnectorError('NOT_IMPLEMENTED', 'Action not implemented');
      });
    }
  }

  getSpec(): ConnectorSpec {
    return {
      metadata: {
        id: 'contabilium',
        name: 'Contabilium',
        description: 'ERP y sistema contable para PyMEs en Argentina',
        version: '0.1.0',
        category: 'erp',
        status: 'active',
      },
      authType: 'oauth2',
      authSchema: z.any(),
      actions: this.getActions(),
    };
  }

  async testConnection(credentials: ResolvedCredentials): Promise<import('@integrax/connector-sdk').TestConnectionResult> {
    try {
      await this.authenticate();
      // Try to get user info or make a simple API call
      await this.request('GET', '/v2/usuarios/me');
      return { success: true, testedAt: new Date(), latencyMs: 0 };
    } catch (error) {
      return { success: false, testedAt: new Date(), latencyMs: 0, error: { code: 'FAIL', message: String(error) } };
    }
  }

  getActions(): ActionDefinition[] {
    return [
      // Clientes
      {
        id: 'get_cliente',
        name: 'Obtener Cliente',
        description: 'Obtiene un cliente por ID',
        inputSchema: z.object({ id: z.number() }),
        outputSchema: z.any(),
      },
      {
        id: 'search_clientes',
        name: 'Buscar Clientes',
        description: 'Busca clientes por CUIT/CUIL o razón social',
        inputSchema: z.object({
          query: z.string().optional(),
          page: z.number().optional(),
          pageSize: z.number().optional(),
        }).passthrough(),
        outputSchema: z.any(),
      },
      {
        id: 'create_cliente',
        name: 'Crear Cliente',
        description: 'Crea un nuevo cliente',
        inputSchema: z.any(),
        outputSchema: z.any(),
      },
      {
        id: 'update_cliente',
        name: 'Actualizar Cliente',
        description: 'Actualiza un cliente existente',
        inputSchema: z.any(),
        outputSchema: z.any(),
      },
      // Productos
      {
        id: 'get_producto',
        name: 'Obtener Producto',
        description: 'Obtiene un producto por ID',
        inputSchema: z.object({ id: z.number() }),
        outputSchema: z.any(),
      },
      {
        id: 'search_productos',
        name: 'Buscar Productos',
        description: 'Busca productos por código o nombre',
        inputSchema: z.object({
          query: z.string().optional(),
          page: z.number().optional(),
          pageSize: z.number().optional(),
        }).passthrough(),
        outputSchema: z.any(),
      },
      {
        id: 'create_producto',
        name: 'Crear Producto',
        description: 'Crea un nuevo producto',
        inputSchema: z.any(),
        outputSchema: z.any(),
      },
      // Comprobantes
      {
        id: 'get_comprobante',
        name: 'Obtener Comprobante',
        description: 'Obtiene un comprobante por ID',
        inputSchema: z.object({ id: z.number() }),
        outputSchema: z.any(),
      },
      {
        id: 'create_comprobante',
        name: 'Crear Comprobante',
        description: 'Crea un nuevo comprobante (factura, nota de crédito, etc.)',
        inputSchema: z.any(),
        outputSchema: z.any(),
      },
      {
        id: 'facturar_comprobante',
        name: 'Facturar Comprobante',
        description: 'Solicita CAE a AFIP para un comprobante',
        inputSchema: z.object({ id: z.number() }),
        outputSchema: z.any(),
      },
      // Pagos
      {
        id: 'registrar_pago',
        name: 'Registrar Pago',
        description: 'Registra un pago para un comprobante',
        inputSchema: z.any(),
        outputSchema: z.any(),
      },
    ];
  }

  // ============================================
  // Authentication
  // ============================================

  private async authenticate(): Promise<string> {
    // Check if we have a valid token
    if (this.credentials.accessToken && this.credentials.expiresAt) {
      if (Date.now() < this.credentials.expiresAt - 60000) {
        return this.credentials.accessToken;
      }
    }

    // Try to refresh token
    if (this.credentials.refreshToken) {
      try {
        return await this.refreshAccessToken();
      } catch (error) {
        // Refresh failed, get new token
      }
    }

    // Get new token
    return await this.getAccessToken();
  }

  private async getAccessToken(): Promise<string> {
    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', this.credentials.clientId);
    params.append('client_secret', this.credentials.clientSecret);

    const response = await fetch(CONTABILIUM_AUTH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new ConnectorError(
        'AUTHENTICATION_FAILED',
        `Contabilium authentication failed: ${error}`
      );
    }

    const data = (await response.json()) as ContabiliumTokenResponse;
    this.credentials.accessToken = data.access_token;
    this.credentials.refreshToken = data.refresh_token;
    this.credentials.expiresAt = Date.now() + data.expires_in * 1000;

    return data.access_token;
  }

  private async refreshAccessToken(): Promise<string> {
    const params = new URLSearchParams();
    params.append('grant_type', 'refresh_token');
    params.append('refresh_token', this.credentials.refreshToken!);

    const response = await fetch(CONTABILIUM_AUTH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      throw new Error('Token refresh failed');
    }

    const data = (await response.json()) as ContabiliumTokenResponse;
    this.credentials.accessToken = data.access_token;
    this.credentials.refreshToken = data.refresh_token;
    this.credentials.expiresAt = Date.now() + data.expires_in * 1000;

    return data.access_token;
  }

  // ============================================
  // API Request Helper
  // ============================================

  private async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    endpoint: string,
    body?: unknown
  ): Promise<T> {
    const accessToken = await this.authenticate();

    const response = await fetch(`${CONTABILIUM_API_URL}${endpoint}`, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = (await response.json().catch(() => ({ Message: response.statusText }))) as any;
      throw new ConnectorError(
        response.status === 404 ? 'NOT_FOUND' : 'API_ERROR',
        `Contabilium API error: ${error.Message || response.statusText}`,
        false,
        { status: response.status, error }
      );
    }

    return (await response.json()) as T;
  }

  // ============================================
  // Clientes (Customers)
  // ============================================

  async getCliente(id: number): Promise<ClienteResponse> {
    return this.request<ClienteResponse>('GET', `/v2/clientes/${id}`);
  }

  async searchClientes(
    query?: string,
    page = 1,
    pageSize = 20
  ): Promise<ContabiliumListResponse<ClienteResponse>> {
    const params = new URLSearchParams({
      page: page.toString(),
      pageSize: pageSize.toString(),
    });
    if (query) params.append('filtro', query);

    return this.request<ContabiliumListResponse<ClienteResponse>>(
      'GET',
      `/v2/clientes?${params.toString()}`
    );
  }

  async createCliente(cliente: Cliente): Promise<ClienteResponse> {
    const validated = ClienteSchema.parse(cliente);
    return this.request<ClienteResponse>('POST', '/v2/clientes', validated);
  }

  async updateCliente(id: number, cliente: Partial<Cliente>): Promise<ClienteResponse> {
    return this.request<ClienteResponse>('PUT', `/v2/clientes/${id}`, cliente);
  }

  async getClienteByCuit(cuit: string): Promise<ClienteResponse | null> {
    const result = await this.searchClientes(cuit);
    return result.Items.find((c) => c.NumeroDocumento === cuit) || null;
  }

  // ============================================
  // Productos (Products)
  // ============================================

  async getProducto(id: number): Promise<ProductoResponse> {
    return this.request<ProductoResponse>('GET', `/v2/conceptos/${id}`);
  }

  async searchProductos(
    query?: string,
    page = 1,
    pageSize = 20
  ): Promise<ContabiliumListResponse<ProductoResponse>> {
    const params = new URLSearchParams({
      page: page.toString(),
      pageSize: pageSize.toString(),
    });
    if (query) params.append('filtro', query);

    return this.request<ContabiliumListResponse<ProductoResponse>>(
      'GET',
      `/v2/conceptos?${params.toString()}`
    );
  }

  async createProducto(producto: Producto): Promise<ProductoResponse> {
    const validated = ProductoSchema.parse(producto);
    return this.request<ProductoResponse>('POST', '/v2/conceptos', validated);
  }

  async updateProducto(id: number, producto: Partial<Producto>): Promise<ProductoResponse> {
    return this.request<ProductoResponse>('PUT', `/v2/conceptos/${id}`, producto);
  }

  // ============================================
  // Comprobantes (Invoices)
  // ============================================

  async getComprobante(id: number): Promise<ComprobanteResponse> {
    return this.request<ComprobanteResponse>('GET', `/v2/comprobantes/${id}`);
  }

  async searchComprobantes(
    filters?: {
      clienteId?: number;
      tipo?: string;
      estado?: string;
      desde?: string;
      hasta?: string;
    },
    page = 1,
    pageSize = 20
  ): Promise<ContabiliumListResponse<ComprobanteResponse>> {
    const params = new URLSearchParams({
      page: page.toString(),
      pageSize: pageSize.toString(),
    });
    if (filters?.clienteId) params.append('clienteId', filters.clienteId.toString());
    if (filters?.tipo) params.append('tipo', filters.tipo);
    if (filters?.estado) params.append('estado', filters.estado);
    if (filters?.desde) params.append('desde', filters.desde);
    if (filters?.hasta) params.append('hasta', filters.hasta);

    return this.request<ContabiliumListResponse<ComprobanteResponse>>(
      'GET',
      `/v2/comprobantes?${params.toString()}`
    );
  }

  async createComprobante(comprobante: Comprobante): Promise<ComprobanteResponse> {
    const validated = ComprobanteSchema.parse(comprobante);

    // Use default punto de venta if not specified
    if (!validated.PuntoVenta && this.config.defaultPuntoVenta) {
      validated.PuntoVenta = this.config.defaultPuntoVenta;
    }

    return this.request<ComprobanteResponse>('POST', '/v2/comprobantes', validated);
  }

  async facturarComprobante(id: number): Promise<ComprobanteResponse> {
    // This sends the comprobante to AFIP and gets the CAE
    return this.request<ComprobanteResponse>('POST', `/v2/comprobantes/${id}/facturar`, {});
  }

  async anularComprobante(id: number, motivo: string): Promise<ComprobanteResponse> {
    return this.request<ComprobanteResponse>('POST', `/v2/comprobantes/${id}/anular`, {
      Motivo: motivo,
    });
  }

  // ============================================
  // Pagos (Payments)
  // ============================================

  async registrarPago(pago: Pago): Promise<PagoResponse> {
    const validated = PagoSchema.parse(pago);
    return this.request<PagoResponse>('POST', '/v2/pagos', validated);
  }

  async getPagosComprobante(comprobanteId: number): Promise<PagoResponse[]> {
    const result = await this.request<ContabiliumListResponse<PagoResponse>>(
      'GET',
      `/v2/pagos?comprobanteId=${comprobanteId}`
    );
    return result.Items;
  }

  // ============================================
  // Utility Methods
  // ============================================

  /**
   * Crea una factura completa: cliente + items + facturación AFIP
   */
  async crearFacturaCompleta(data: {
    cliente: Cliente | number; // Cliente data or existing ID
    items: Comprobante['Items'];
    tipo: Comprobante['Tipo'];
    observaciones?: string;
  }): Promise<ComprobanteResponse> {
    // 1. Get or create cliente
    let clienteId: number;
    if (typeof data.cliente === 'number') {
      clienteId = data.cliente;
    } else {
      // Check if cliente exists by CUIT
      const existing = await this.getClienteByCuit(data.cliente.NumeroDocumento);
      if (existing) {
        clienteId = existing.Id;
      } else {
        const created = await this.createCliente(data.cliente);
        clienteId = created.Id;
      }
    }

    // 2. Create comprobante
    const comprobante = await this.createComprobante({
      ClienteId: clienteId,
      Tipo: data.tipo,
      PuntoVenta: this.config.defaultPuntoVenta || 1,
      Fecha: new Date().toISOString().split('T')[0],
      Items: data.items,
      Observaciones: data.observaciones,
      Moneda: 'ARS',
      Cotizacion: 1,
      Pagado: false,
    });

    // 3. Facturar (get CAE from AFIP)
    if (['FacturaA', 'FacturaB', 'FacturaC'].includes(data.tipo)) {
      return await this.facturarComprobante(comprobante.Id);
    }

    return comprobante;
  }
}

// Export types
export * from './types.js';

// Factory function
export function createContabiliumConnector(config: ContabiliumConfig): ContabiliumConnector {
  return new ContabiliumConnector(config);
}
