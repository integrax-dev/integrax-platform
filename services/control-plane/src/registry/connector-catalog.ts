import type { ConnectorDefinition } from '../types.js';

export const CONNECTOR_CATALOG: ConnectorDefinition[] = [
  {
    id: 'mercadopago',
    name: 'MercadoPago',
    description: 'Pagos online en Argentina y LatAm',
    version: '1.0.0',
    category: 'payments',
    requiredCredentials: [
      { name: 'access_token', type: 'secret', description: 'Access Token de MercadoPago', required: true },
      { name: 'public_key', type: 'string', description: 'Public Key', required: false },
    ],
    actions: [
      { name: 'createPayment', description: 'Crear un pago', inputs: [{ name: 'amount', type: 'number', required: true }], outputs: [{ name: 'paymentId', type: 'string' }] },
      { name: 'getPayment', description: 'Obtener estado de pago', inputs: [{ name: 'paymentId', type: 'string', required: true }], outputs: [{ name: 'status', type: 'string' }] },
      { name: 'refundPayment', description: 'Reembolsar pago', inputs: [{ name: 'paymentId', type: 'string', required: true }], outputs: [{ name: 'refundId', type: 'string' }] },
    ],
    triggers: [
      { name: 'payment.approved', description: 'Pago aprobado', eventType: 'payment.approved' },
      { name: 'payment.rejected', description: 'Pago rechazado', eventType: 'payment.rejected' },
    ],
  },
  {
    id: 'afip-wsfe',
    name: 'AFIP Factura Electronica',
    description: 'Emision de comprobantes fiscales en Argentina',
    version: '1.0.0',
    category: 'invoicing',
    requiredCredentials: [
      { name: 'cuit', type: 'string', description: 'CUIT del contribuyente', required: true },
      { name: 'certificate', type: 'file', description: 'Certificado .crt', required: true },
      { name: 'private_key', type: 'file', description: 'Clave privada .key', required: true },
      { name: 'environment', type: 'string', description: 'testing o production', required: true },
    ],
    actions: [
      { name: 'createInvoice', description: 'Crear factura electronica', inputs: [{ name: 'tipo', type: 'number', required: true }, { name: 'puntoVenta', type: 'number', required: true }], outputs: [{ name: 'cae', type: 'string' }] },
      { name: 'getLastVoucher', description: 'Obtener ultimo comprobante', inputs: [{ name: 'puntoVenta', type: 'number', required: true }], outputs: [{ name: 'numero', type: 'number' }] },
    ],
    triggers: [],
  },
  {
    id: 'contabilium',
    name: 'Contabilium',
    description: 'ERP de gestion para PyMEs argentinas',
    version: '1.0.0',
    category: 'erp',
    requiredCredentials: [
      { name: 'api_key', type: 'secret', description: 'API Key de Contabilium', required: true },
      { name: 'company_id', type: 'string', description: 'ID de la empresa', required: true },
    ],
    actions: [
      { name: 'createClient', description: 'Crear cliente', inputs: [{ name: 'name', type: 'string', required: true }], outputs: [{ name: 'clientId', type: 'string' }] },
      { name: 'createInvoice', description: 'Crear factura', inputs: [{ name: 'clientId', type: 'string', required: true }], outputs: [{ name: 'invoiceId', type: 'string' }] },
      { name: 'getProducts', description: 'Listar productos', inputs: [], outputs: [{ name: 'products', type: 'array' }] },
    ],
    triggers: [],
  },
  {
    id: 'whatsapp',
    name: 'WhatsApp Business',
    description: 'Mensajeria por WhatsApp Business API',
    version: '1.0.0',
    category: 'messaging',
    requiredCredentials: [
      { name: 'phone_number_id', type: 'string', description: 'ID del numero de telefono', required: true },
      { name: 'access_token', type: 'secret', description: 'Access Token de Meta', required: true },
    ],
    actions: [
      { name: 'sendMessage', description: 'Enviar mensaje de texto', inputs: [{ name: 'to', type: 'string', required: true }, { name: 'text', type: 'string', required: true }], outputs: [{ name: 'messageId', type: 'string' }] },
      { name: 'sendTemplate', description: 'Enviar template', inputs: [{ name: 'to', type: 'string', required: true }, { name: 'template', type: 'string', required: true }], outputs: [{ name: 'messageId', type: 'string' }] },
      { name: 'sendDocument', description: 'Enviar documento', inputs: [{ name: 'to', type: 'string', required: true }, { name: 'documentUrl', type: 'string', required: true }], outputs: [{ name: 'messageId', type: 'string' }] },
    ],
    triggers: [
      { name: 'message.received', description: 'Mensaje recibido', eventType: 'message.received' },
    ],
  },
  {
    id: 'email',
    name: 'Email (SMTP)',
    description: 'Envio de emails transaccionales',
    version: '1.0.0',
    category: 'messaging',
    requiredCredentials: [
      { name: 'smtp_host', type: 'string', description: 'Host SMTP', required: true },
      { name: 'smtp_port', type: 'string', description: 'Puerto SMTP', required: true },
      { name: 'smtp_user', type: 'string', description: 'Usuario SMTP', required: true },
      { name: 'smtp_password', type: 'secret', description: 'Contrasena SMTP', required: true },
      { name: 'from_email', type: 'string', description: 'Email remitente', required: true },
    ],
    actions: [
      { name: 'sendEmail', description: 'Enviar email', inputs: [{ name: 'to', type: 'string', required: true }, { name: 'subject', type: 'string', required: true }, { name: 'body', type: 'string', required: true }], outputs: [{ name: 'messageId', type: 'string' }] },
      { name: 'sendWithAttachment', description: 'Enviar email con adjunto', inputs: [{ name: 'to', type: 'string', required: true }, { name: 'attachmentUrl', type: 'string', required: true }], outputs: [{ name: 'messageId', type: 'string' }] },
    ],
    triggers: [],
  },
  {
    id: 'google-sheets',
    name: 'Google Sheets',
    description: 'Lectura y escritura en Google Sheets',
    version: '1.0.0',
    category: 'spreadsheets',
    requiredCredentials: [
      { name: 'service_account_json', type: 'file', description: 'JSON de cuenta de servicio', required: true },
    ],
    actions: [
      { name: 'readSheet', description: 'Leer datos de hoja', inputs: [{ name: 'spreadsheetId', type: 'string', required: true }, { name: 'range', type: 'string', required: true }], outputs: [{ name: 'values', type: 'array' }] },
      { name: 'appendRow', description: 'Agregar fila', inputs: [{ name: 'spreadsheetId', type: 'string', required: true }, { name: 'values', type: 'array', required: true }], outputs: [{ name: 'updatedRange', type: 'string' }] },
      { name: 'updateCell', description: 'Actualizar celda', inputs: [{ name: 'spreadsheetId', type: 'string', required: true }, { name: 'cell', type: 'string', required: true }, { name: 'value', type: 'string', required: true }], outputs: [] },
    ],
    triggers: [],
  },
  {
    id: 'tiendanube',
    name: 'Tienda Nube',
    description: 'E-commerce platform para LatAm',
    version: '1.0.0',
    category: 'ecommerce',
    requiredCredentials: [
      { name: 'store_id', type: 'string', description: 'ID de la tienda', required: true },
      { name: 'access_token', type: 'secret', description: 'Access Token', required: true },
    ],
    actions: [
      { name: 'getProducts', description: 'Listar productos', inputs: [], outputs: [{ name: 'products', type: 'array' }] },
      { name: 'getOrders', description: 'Listar ordenes', inputs: [{ name: 'status', type: 'string', required: false }], outputs: [{ name: 'orders', type: 'array' }] },
      { name: 'updateStock', description: 'Actualizar stock', inputs: [{ name: 'productId', type: 'string', required: true }, { name: 'quantity', type: 'number', required: true }], outputs: [] },
      { name: 'createProduct', description: 'Crear producto', inputs: [{ name: 'name', type: 'string', required: true }, { name: 'price', type: 'number', required: true }], outputs: [{ name: 'productId', type: 'string' }] },
    ],
    triggers: [
      { name: 'order.created', description: 'Orden creada', eventType: 'order/created' },
      { name: 'order.paid', description: 'Orden pagada', eventType: 'order/paid' },
      { name: 'order.fulfilled', description: 'Orden enviada', eventType: 'order/fulfilled' },
    ],
  },
];

export function listConnectorCatalog(category?: string): ConnectorDefinition[] {
  if (!category) return CONNECTOR_CATALOG;
  return CONNECTOR_CATALOG.filter(connector => connector.category === category);
}

export function getConnectorDefinition(connectorId: string): ConnectorDefinition | undefined {
  return CONNECTOR_CATALOG.find(connector => connector.id === connectorId);
}
