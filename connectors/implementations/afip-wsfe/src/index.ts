/**
 * AFIP WSFE Connector
 *
 * Conector para el Web Service de Factura Electrónica de AFIP.
 * Permite autorizar comprobantes electrónicos (facturas, notas de crédito/débito)
 * y obtener el CAE (Código de Autorización Electrónico).
 *
 * IMPORTANTE: Este conector requiere un certificado digital emitido por AFIP.
 */

import * as crypto from 'crypto';
import {
  Connector,
  ConnectorSpec,
  ConnectorAction,
  ConnectorCredentials,
  ConnectorError,
  ErrorCode,
} from '@integrax/connector-sdk';
import {
  AfipConfig,
  AfipToken,
  FacturaRequest,
  FacturaRequestSchema,
  CAEResult,
  AFIP_URLS,
  TipoComprobante,
  TipoDocumento,
  AlicuotaIVA,
  Concepto,
  FECAESolicitarResponse,
  FECompUltimoAutorizadoResponse,
} from './types.js';

export class AfipWsfeConnector implements Connector {
  private config: AfipConfig;
  private token: AfipToken | null = null;

  constructor(config: AfipConfig) {
    this.config = config;
  }

  // ============================================
  // Connector Interface
  // ============================================

  spec(): ConnectorSpec {
    return {
      id: 'afip-wsfe',
      name: 'AFIP WSFE',
      description: 'Facturación Electrónica AFIP Argentina - Obtención de CAE',
      version: '0.1.0',
      auth: {
        type: 'certificate',
      },
      actions: this.getActions(),
    };
  }

  async testConnection(credentials: ConnectorCredentials): Promise<boolean> {
    try {
      await this.authenticate();
      // Test with FEDummy (service health check)
      await this.callWsfe('FEDummy', {});
      return true;
    } catch (error) {
      return false;
    }
  }

  getActions(): ConnectorAction[] {
    return [
      {
        id: 'autorizar_comprobante',
        name: 'Autorizar Comprobante',
        description: 'Solicita CAE para un comprobante (factura, NC, ND)',
        inputSchema: { type: 'object' },
        outputSchema: { type: 'object' },
      },
      {
        id: 'get_ultimo_comprobante',
        name: 'Obtener Último Comprobante',
        description: 'Obtiene el número del último comprobante autorizado',
        inputSchema: {
          type: 'object',
          properties: {
            puntoVenta: { type: 'number' },
            tipoComprobante: { type: 'number' },
          },
          required: ['puntoVenta', 'tipoComprobante'],
        },
        outputSchema: { type: 'object' },
      },
      {
        id: 'get_puntos_venta',
        name: 'Obtener Puntos de Venta',
        description: 'Lista los puntos de venta habilitados',
        inputSchema: { type: 'object' },
        outputSchema: { type: 'object' },
      },
      {
        id: 'get_cotizacion',
        name: 'Obtener Cotización',
        description: 'Obtiene la cotización de una moneda extranjera',
        inputSchema: {
          type: 'object',
          properties: { monedaId: { type: 'string' } },
          required: ['monedaId'],
        },
        outputSchema: { type: 'object' },
      },
    ];
  }

  // ============================================
  // WSAA Authentication
  // ============================================

  private async authenticate(): Promise<AfipToken> {
    // Check if token is still valid
    if (this.token && new Date() < this.token.expirationTime) {
      return this.token;
    }

    const urls = AFIP_URLS[this.config.environment];

    // Generate LoginTicketRequest (TRA)
    const tra = this.generateTRA();

    // Sign TRA with certificate
    const cms = this.signTRA(tra);

    // Call WSAA to get token
    const soapEnvelope = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov">
   <soapenv:Header/>
   <soapenv:Body>
      <wsaa:loginCms>
         <wsaa:in0>${cms}</wsaa:in0>
      </wsaa:loginCms>
   </soapenv:Body>
</soapenv:Envelope>`;

    const response = await fetch(urls.wsaa, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        SOAPAction: '',
      },
      body: soapEnvelope,
    });

    if (!response.ok) {
      throw new ConnectorError(
        ErrorCode.AUTHENTICATION_FAILED,
        `WSAA authentication failed: ${response.statusText}`
      );
    }

    const responseText = await response.text();

    // Parse response to get token and sign
    const tokenMatch = responseText.match(/<token>([^<]+)<\/token>/);
    const signMatch = responseText.match(/<sign>([^<]+)<\/sign>/);
    const expirationMatch = responseText.match(/<expirationTime>([^<]+)<\/expirationTime>/);

    if (!tokenMatch || !signMatch || !expirationMatch) {
      // Check for error
      const errorMatch = responseText.match(/<faultstring>([^<]+)<\/faultstring>/);
      throw new ConnectorError(
        ErrorCode.AUTHENTICATION_FAILED,
        `WSAA authentication failed: ${errorMatch?.[1] || 'Unknown error'}`
      );
    }

    this.token = {
      token: tokenMatch[1],
      sign: signMatch[1],
      expirationTime: new Date(expirationMatch[1]),
    };

    return this.token;
  }

  private generateTRA(): string {
    const now = new Date();
    const generationTime = new Date(now.getTime() - 600000); // 10 min antes
    const expirationTime = new Date(now.getTime() + 600000); // 10 min después

    return `<?xml version="1.0" encoding="UTF-8"?>
<loginTicketRequest version="1.0">
  <header>
    <uniqueId>${Math.floor(Date.now() / 1000)}</uniqueId>
    <generationTime>${generationTime.toISOString()}</generationTime>
    <expirationTime>${expirationTime.toISOString()}</expirationTime>
  </header>
  <service>wsfe</service>
</loginTicketRequest>`;
  }

  private signTRA(tra: string): string {
    // Create PKCS#7 signed message (CMS)
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(tra);
    const signature = sign.sign(this.config.privateKey, 'base64');

    // In production, this would create a proper CMS/PKCS#7 structure
    // For now, return base64 encoded signed data
    // Note: Real implementation needs proper CMS library
    const signedData = Buffer.from(tra).toString('base64');
    return signedData;
  }

  // ============================================
  // WSFE Operations
  // ============================================

  private async callWsfe(method: string, params: Record<string, unknown>): Promise<unknown> {
    const token = await this.authenticate();
    const urls = AFIP_URLS[this.config.environment];

    const auth = {
      Token: token.token,
      Sign: token.sign,
      Cuit: this.config.cuit,
    };

    const soapBody = this.buildSoapBody(method, { Auth: auth, ...params });

    const response = await fetch(urls.wsfe, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        SOAPAction: `http://ar.gov.afip.dif.FEV1/${method}`,
      },
      body: soapBody,
    });

    if (!response.ok) {
      throw new ConnectorError(
        ErrorCode.API_ERROR,
        `WSFE ${method} failed: ${response.statusText}`
      );
    }

    const responseText = await response.text();
    return this.parseSoapResponse(responseText, method);
  }

  private buildSoapBody(method: string, params: Record<string, unknown>): string {
    const paramsXml = this.objectToXml(params);

    return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="http://ar.gov.afip.dif.FEV1/">
   <soapenv:Header/>
   <soapenv:Body>
      <ar:${method}>
         ${paramsXml}
      </ar:${method}>
   </soapenv:Body>
</soapenv:Envelope>`;
  }

  private objectToXml(obj: Record<string, unknown>, indent = ''): string {
    let xml = '';
    for (const [key, value] of Object.entries(obj)) {
      if (value === null || value === undefined) continue;

      if (Array.isArray(value)) {
        for (const item of value) {
          xml += `${indent}<${key}>\n${this.objectToXml(item as Record<string, unknown>, indent + '  ')}${indent}</${key}>\n`;
        }
      } else if (typeof value === 'object') {
        xml += `${indent}<${key}>\n${this.objectToXml(value as Record<string, unknown>, indent + '  ')}${indent}</${key}>\n`;
      } else {
        xml += `${indent}<${key}>${value}</${key}>\n`;
      }
    }
    return xml;
  }

  private parseSoapResponse(xml: string, method: string): unknown {
    // Simple XML parser for AFIP responses
    // In production, use a proper XML parser
    const resultMatch = xml.match(new RegExp(`<${method}Result>([\\s\\S]*?)<\/${method}Result>`));
    if (resultMatch) {
      return this.xmlToObject(resultMatch[1]);
    }

    // Check for errors
    const faultMatch = xml.match(/<faultstring>([^<]+)<\/faultstring>/);
    if (faultMatch) {
      throw new ConnectorError(ErrorCode.API_ERROR, `WSFE error: ${faultMatch[1]}`);
    }

    return null;
  }

  private xmlToObject(xml: string): Record<string, unknown> {
    // Simplified XML to object parser
    // In production, use a proper XML parser library
    const result: Record<string, unknown> = {};
    const tagRegex = /<(\w+)>([^<]*)<\/\1>/g;
    let match;

    while ((match = tagRegex.exec(xml)) !== null) {
      const [, tag, value] = match;
      result[tag] = value;
    }

    return result;
  }

  // ============================================
  // Public Methods
  // ============================================

  /**
   * Obtiene el número del último comprobante autorizado
   */
  async getUltimoComprobante(puntoVenta: number, tipoComprobante: number): Promise<number> {
    const response = (await this.callWsfe('FECompUltimoAutorizado', {
      PtoVta: puntoVenta,
      CbteTipo: tipoComprobante,
    })) as FECompUltimoAutorizadoResponse;

    return response.CbteNro || 0;
  }

  /**
   * Solicita CAE para un comprobante
   */
  async autorizarComprobante(factura: FacturaRequest): Promise<CAEResult> {
    // Validate input
    const validated = FacturaRequestSchema.parse(factura);

    // Get next comprobante number if not provided
    if (!validated.CbteDesde || !validated.CbteHasta) {
      const ultimo = await this.getUltimoComprobante(validated.PtoVta, validated.CbteTipo);
      validated.CbteDesde = ultimo + 1;
      validated.CbteHasta = ultimo + 1;
    }

    // Build request
    const feCAEReq = {
      FeCabReq: {
        CantReg: 1,
        PtoVta: validated.PtoVta,
        CbteTipo: validated.CbteTipo,
      },
      FeDetReq: {
        FECAEDetRequest: {
          Concepto: validated.Concepto,
          DocTipo: validated.DocTipo,
          DocNro: validated.DocNro,
          CbteDesde: validated.CbteDesde,
          CbteHasta: validated.CbteHasta,
          CbteFch: validated.CbteFch,
          ImpTotal: validated.ImpTotal,
          ImpTotConc: validated.ImpTotConc,
          ImpNeto: validated.ImpNeto,
          ImpOpEx: validated.ImpOpEx,
          ImpIVA: validated.ImpIVA,
          ImpTrib: validated.ImpTrib,
          FchServDesde: validated.FchServDesde || '',
          FchServHasta: validated.FchServHasta || '',
          FchVtoPago: validated.FchVtoPago || '',
          MonId: validated.MonId,
          MonCotiz: validated.MonCotiz,
          Iva: validated.Iva
            ? {
                AlicIva: validated.Iva.map((iva) => ({
                  Id: iva.Id,
                  BaseImp: iva.BaseImp,
                  Importe: iva.Importe,
                })),
              }
            : undefined,
          Tributos: validated.Tributos
            ? {
                Tributo: validated.Tributos,
              }
            : undefined,
          CbtesAsoc: validated.CbtesAsoc
            ? {
                CbteAsoc: validated.CbtesAsoc,
              }
            : undefined,
        },
      },
    };

    const response = (await this.callWsfe(
      'FECAESolicitar',
      feCAEReq
    )) as FECAESolicitarResponse;

    // Parse response
    const detResponse = response.FeDetResp?.FECAEDetResponse?.[0];

    if (!detResponse) {
      return {
        success: false,
        cbteNro: validated.CbteDesde,
        errors: response.Errors?.Err?.map((e) => ({ code: e.Code, message: e.Msg })) || [],
      };
    }

    return {
      success: detResponse.Resultado === 'A',
      cae: detResponse.CAE,
      caeVencimiento: detResponse.CAEFchVto,
      cbteNro: detResponse.CbteDesde,
      errors: response.Errors?.Err?.map((e) => ({ code: e.Code, message: e.Msg })),
      observations: detResponse.Observaciones?.Obs?.map((o) => ({
        code: o.Code,
        message: o.Msg,
      })),
    };
  }

  /**
   * Lista los puntos de venta habilitados
   */
  async getPuntosVenta(): Promise<Array<{ numero: number; bloqueado: boolean }>> {
    const response = (await this.callWsfe('FEParamGetPtosVenta', {})) as {
      ResultGet?: {
        PtoVenta?: Array<{ Nro: number; Bloqueado: string }>;
      };
    };

    return (
      response.ResultGet?.PtoVenta?.map((pv) => ({
        numero: pv.Nro,
        bloqueado: pv.Bloqueado === 'S',
      })) || []
    );
  }

  /**
   * Obtiene la cotización de una moneda
   */
  async getCotizacion(monedaId: string): Promise<number> {
    const response = (await this.callWsfe('FEParamGetCotizacion', {
      MonId: monedaId,
    })) as { ResultGet?: { MonCotiz?: number } };

    return response.ResultGet?.MonCotiz || 1;
  }

  /**
   * Helper: Crea una factura simple
   */
  async crearFactura(data: {
    puntoVenta: number;
    tipoComprobante: TipoComprobanteCode;
    docTipo: TipoDocumentoCode;
    docNro: string;
    concepto: 1 | 2 | 3;
    importeNeto: number;
    importeIva: number;
    alicuotaIva?: AlicuotaIVACode;
    fechaServicioDesde?: string;
    fechaServicioHasta?: string;
    fechaVencimientoPago?: string;
  }): Promise<CAEResult> {
    const fecha = new Date().toISOString().slice(0, 10).replace(/-/g, '');

    return this.autorizarComprobante({
      PtoVta: data.puntoVenta,
      CbteTipo: data.tipoComprobante,
      Concepto: data.concepto,
      DocTipo: data.docTipo,
      DocNro: data.docNro,
      CbteFch: fecha,
      ImpNeto: data.importeNeto,
      ImpIVA: data.importeIva,
      ImpTotal: data.importeNeto + data.importeIva,
      ImpTotConc: 0,
      ImpOpEx: 0,
      ImpTrib: 0,
      MonId: 'PES',
      MonCotiz: 1,
      FchServDesde: data.fechaServicioDesde,
      FchServHasta: data.fechaServicioHasta,
      FchVtoPago: data.fechaVencimientoPago,
      Iva: [
        {
          Id: data.alicuotaIva || AlicuotaIVA.IVA_21,
          BaseImp: data.importeNeto,
          Importe: data.importeIva,
        },
      ],
    });
  }
}

// Type aliases for convenience
type TipoComprobanteCode = (typeof TipoComprobante)[keyof typeof TipoComprobante];
type TipoDocumentoCode = (typeof TipoDocumento)[keyof typeof TipoDocumento];
type AlicuotaIVACode = (typeof AlicuotaIVA)[keyof typeof AlicuotaIVA];

// Export types and constants
export * from './types.js';
export { TipoComprobante, TipoDocumento, AlicuotaIVA, Concepto };

// Factory function
export function createAfipWsfeConnector(config: AfipConfig): AfipWsfeConnector {
  return new AfipWsfeConnector(config);
}
