/**
 * Connectors Registry
 *
 * Registro de todos los conectores disponibles en IntegraX
 */

import type { ConnectorInfo } from './types';

export const INTEGRAX_CONNECTORS: ConnectorInfo[] = [
  // Payment Connectors
  {
    id: 'mercadopago',
    name: 'MercadoPago',
    description: 'Procesamiento de pagos, suscripciones y QR en Argentina',
    category: 'payment',
    capabilities: [
      'crear pagos',
      'consultar pagos',
      'reembolsos',
      'suscripciones',
      'generar QR',
      'webhooks',
    ],
    actions: [
      {
        id: 'create_payment',
        name: 'Crear Pago',
        description: 'Crea un nuevo pago o preferencia de pago',
        inputSchema: {
          type: 'object',
          properties: {
            amount: { type: 'number', description: 'Monto del pago' },
            currency: { type: 'string', enum: ['ARS', 'USD'] },
            description: { type: 'string' },
            payer_email: { type: 'string' },
          },
          required: ['amount', 'description'],
        },
      },
      {
        id: 'get_payment',
        name: 'Obtener Pago',
        description: 'Consulta el estado de un pago',
        inputSchema: {
          type: 'object',
          properties: {
            payment_id: { type: 'string' },
          },
          required: ['payment_id'],
        },
      },
      {
        id: 'refund_payment',
        name: 'Reembolsar Pago',
        description: 'Realiza un reembolso total o parcial',
        inputSchema: {
          type: 'object',
          properties: {
            payment_id: { type: 'string' },
            amount: { type: 'number', description: 'Monto a reembolsar (opcional para total)' },
          },
          required: ['payment_id'],
        },
      },
      {
        id: 'search_payments',
        name: 'Buscar Pagos',
        description: 'Busca pagos con filtros',
        inputSchema: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['approved', 'pending', 'rejected'] },
            date_from: { type: 'string', format: 'date' },
            date_to: { type: 'string', format: 'date' },
          },
        },
      },
    ],
  },

  // ERP Connectors
  {
    id: 'contabilium',
    name: 'Contabilium',
    description: 'ERP y sistema contable para PyMEs argentinas',
    category: 'erp',
    capabilities: [
      'gestión de clientes',
      'gestión de productos',
      'facturación',
      'pagos',
      'reportes',
    ],
    actions: [
      {
        id: 'get_cliente',
        name: 'Obtener Cliente',
        description: 'Obtiene datos de un cliente por ID o CUIT',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'number' },
            cuit: { type: 'string' },
          },
        },
      },
      {
        id: 'create_cliente',
        name: 'Crear Cliente',
        description: 'Crea un nuevo cliente',
        inputSchema: {
          type: 'object',
          properties: {
            razon_social: { type: 'string' },
            cuit: { type: 'string' },
            condicion_iva: { type: 'number' },
            email: { type: 'string' },
          },
          required: ['razon_social', 'cuit', 'condicion_iva'],
        },
      },
      {
        id: 'create_comprobante',
        name: 'Crear Comprobante',
        description: 'Crea una factura, nota de crédito o débito',
        inputSchema: {
          type: 'object',
          properties: {
            cliente_id: { type: 'number' },
            tipo: {
              type: 'string',
              enum: ['FacturaA', 'FacturaB', 'FacturaC', 'NotaCreditoA', 'NotaCreditoB'],
            },
            items: { type: 'array' },
          },
          required: ['cliente_id', 'tipo', 'items'],
        },
      },
      {
        id: 'facturar_comprobante',
        name: 'Facturar Comprobante',
        description: 'Solicita CAE a AFIP para un comprobante',
        inputSchema: {
          type: 'object',
          properties: {
            comprobante_id: { type: 'number' },
          },
          required: ['comprobante_id'],
        },
      },
    ],
  },

  // Invoicing Connectors
  {
    id: 'afip-wsfe',
    name: 'AFIP WSFE',
    description: 'Facturación electrónica AFIP - Obtención de CAE',
    category: 'invoicing',
    capabilities: [
      'autorizar facturas',
      'consultar último comprobante',
      'obtener puntos de venta',
      'consultar cotizaciones',
    ],
    actions: [
      {
        id: 'autorizar_comprobante',
        name: 'Autorizar Comprobante',
        description: 'Solicita CAE para un comprobante',
        inputSchema: {
          type: 'object',
          properties: {
            punto_venta: { type: 'number' },
            tipo_comprobante: { type: 'number' },
            concepto: { type: 'number', enum: [1, 2, 3] },
            doc_tipo: { type: 'number' },
            doc_nro: { type: 'string' },
            importe_neto: { type: 'number' },
            importe_iva: { type: 'number' },
            importe_total: { type: 'number' },
          },
          required: ['punto_venta', 'tipo_comprobante', 'doc_tipo', 'doc_nro', 'importe_total'],
        },
      },
      {
        id: 'get_ultimo_comprobante',
        name: 'Último Comprobante',
        description: 'Obtiene el número del último comprobante autorizado',
        inputSchema: {
          type: 'object',
          properties: {
            punto_venta: { type: 'number' },
            tipo_comprobante: { type: 'number' },
          },
          required: ['punto_venta', 'tipo_comprobante'],
        },
      },
      {
        id: 'get_cotizacion',
        name: 'Obtener Cotización',
        description: 'Obtiene la cotización de una moneda',
        inputSchema: {
          type: 'object',
          properties: {
            moneda: { type: 'string', enum: ['DOL', 'EUR'] },
          },
          required: ['moneda'],
        },
      },
    ],
  },

  // Messaging Connectors
  {
    id: 'whatsapp',
    name: 'WhatsApp Business',
    description: 'Envío de mensajes via WhatsApp Business Cloud API',
    category: 'messaging',
    capabilities: [
      'enviar texto',
      'enviar templates',
      'enviar imágenes',
      'enviar documentos',
      'botones interactivos',
      'listas',
    ],
    actions: [
      {
        id: 'send_text',
        name: 'Enviar Texto',
        description: 'Envía un mensaje de texto simple',
        inputSchema: {
          type: 'object',
          properties: {
            to: { type: 'string', description: 'Número con código de país' },
            text: { type: 'string' },
          },
          required: ['to', 'text'],
        },
      },
      {
        id: 'send_template',
        name: 'Enviar Template',
        description: 'Envía un mensaje usando un template pre-aprobado',
        inputSchema: {
          type: 'object',
          properties: {
            to: { type: 'string' },
            template_name: { type: 'string' },
            language: { type: 'string', default: 'es_AR' },
            parameters: { type: 'array' },
          },
          required: ['to', 'template_name'],
        },
      },
      {
        id: 'send_document',
        name: 'Enviar Documento',
        description: 'Envía un documento (PDF, etc)',
        inputSchema: {
          type: 'object',
          properties: {
            to: { type: 'string' },
            document_url: { type: 'string' },
            filename: { type: 'string' },
            caption: { type: 'string' },
          },
          required: ['to', 'document_url'],
        },
      },
      {
        id: 'send_buttons',
        name: 'Enviar Botones',
        description: 'Envía un mensaje con botones interactivos',
        inputSchema: {
          type: 'object',
          properties: {
            to: { type: 'string' },
            body: { type: 'string' },
            buttons: {
              type: 'array',
              items: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' } } },
            },
          },
          required: ['to', 'body', 'buttons'],
        },
      },
    ],
  },

  {
    id: 'email',
    name: 'Email/SMTP',
    description: 'Envío de emails transaccionales y masivos',
    category: 'messaging',
    capabilities: [
      'enviar emails',
      'templates',
      'adjuntos',
      'envío masivo',
      'tracking',
    ],
    actions: [
      {
        id: 'send_email',
        name: 'Enviar Email',
        description: 'Envía un email',
        inputSchema: {
          type: 'object',
          properties: {
            from: { type: 'string' },
            to: { type: 'string' },
            subject: { type: 'string' },
            text: { type: 'string' },
            html: { type: 'string' },
          },
          required: ['to', 'subject'],
        },
      },
      {
        id: 'send_template_email',
        name: 'Enviar Template',
        description: 'Envía un email usando un template',
        inputSchema: {
          type: 'object',
          properties: {
            to: { type: 'string' },
            template_id: { type: 'string' },
            template_data: { type: 'object' },
          },
          required: ['to', 'template_id', 'template_data'],
        },
      },
      {
        id: 'send_factura_email',
        name: 'Enviar Factura',
        description: 'Envía email de factura argentina con datos de CAE',
        inputSchema: {
          type: 'object',
          properties: {
            to: { type: 'string' },
            numero_factura: { type: 'string' },
            cae: { type: 'string' },
            total: { type: 'number' },
            pdf_url: { type: 'string' },
          },
          required: ['to', 'numero_factura', 'cae', 'total'],
        },
      },
    ],
  },

  // Spreadsheet Connectors
  {
    id: 'google-sheets',
    name: 'Google Sheets',
    description: 'Sincronización con hojas de cálculo de Google',
    category: 'spreadsheet',
    capabilities: [
      'leer datos',
      'escribir datos',
      'agregar filas',
      'actualizar filas',
      'crear hojas',
    ],
    actions: [
      {
        id: 'read_sheet',
        name: 'Leer Hoja',
        description: 'Lee datos de una hoja de cálculo',
        inputSchema: {
          type: 'object',
          properties: {
            spreadsheet_id: { type: 'string' },
            range: { type: 'string' },
          },
          required: ['spreadsheet_id', 'range'],
        },
      },
      {
        id: 'append_row',
        name: 'Agregar Fila',
        description: 'Agrega una nueva fila a la hoja',
        inputSchema: {
          type: 'object',
          properties: {
            spreadsheet_id: { type: 'string' },
            sheet_name: { type: 'string' },
            values: { type: 'array' },
          },
          required: ['spreadsheet_id', 'values'],
        },
      },
      {
        id: 'update_row',
        name: 'Actualizar Fila',
        description: 'Actualiza una fila existente',
        inputSchema: {
          type: 'object',
          properties: {
            spreadsheet_id: { type: 'string' },
            range: { type: 'string' },
            values: { type: 'array' },
          },
          required: ['spreadsheet_id', 'range', 'values'],
        },
      },
    ],
  },
];

// Get connector by ID
export function getConnector(id: string): ConnectorInfo | undefined {
  return INTEGRAX_CONNECTORS.find((c) => c.id === id);
}

// Get connectors by category
export function getConnectorsByCategory(category: ConnectorInfo['category']): ConnectorInfo[] {
  return INTEGRAX_CONNECTORS.filter((c) => c.category === category);
}

// Search connectors
export function searchConnectors(query: string): ConnectorInfo[] {
  const lowerQuery = query.toLowerCase();
  return INTEGRAX_CONNECTORS.filter(
    (c) =>
      c.name.toLowerCase().includes(lowerQuery) ||
      c.description.toLowerCase().includes(lowerQuery) ||
      c.capabilities.some((cap) => cap.toLowerCase().includes(lowerQuery))
  );
}
