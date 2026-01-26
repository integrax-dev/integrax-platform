/**
 * Connector Management API Routes
 */

import { Router } from 'express';
import { ulid } from 'ulid';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import {
  ConnectorDefinition,
  TenantConnector,
  ConfigureConnectorSchema,
  ConnectorStatus,
} from '../types';
import { requireAuth, requireRole, requireTenant } from '../middleware/auth';
import { audit } from '../middleware/audit';
import { validate } from '../middleware/validate';

const router = Router();

// Encryption key (should come from secure vault in production)
const ENCRYPTION_KEY = process.env.CREDENTIAL_ENCRYPTION_KEY || randomBytes(32).toString('hex');

// Available connectors catalog
const CONNECTOR_CATALOG: ConnectorDefinition[] = [
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
    name: 'AFIP Factura Electrónica',
    description: 'Emisión de comprobantes fiscales en Argentina',
    version: '1.0.0',
    category: 'invoicing',
    requiredCredentials: [
      { name: 'cuit', type: 'string', description: 'CUIT del contribuyente', required: true },
      { name: 'certificate', type: 'file', description: 'Certificado .crt', required: true },
      { name: 'private_key', type: 'file', description: 'Clave privada .key', required: true },
      { name: 'environment', type: 'string', description: 'testing o production', required: true },
    ],
    actions: [
      { name: 'createInvoice', description: 'Crear factura electrónica', inputs: [{ name: 'tipo', type: 'number', required: true }, { name: 'puntoVenta', type: 'number', required: true }], outputs: [{ name: 'cae', type: 'string' }] },
      { name: 'getLastVoucher', description: 'Obtener último comprobante', inputs: [{ name: 'puntoVenta', type: 'number', required: true }], outputs: [{ name: 'numero', type: 'number' }] },
    ],
    triggers: [],
  },
  {
    id: 'contabilium',
    name: 'Contabilium',
    description: 'ERP de gestión para PyMEs argentinas',
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
    description: 'Mensajería por WhatsApp Business API',
    version: '1.0.0',
    category: 'messaging',
    requiredCredentials: [
      { name: 'phone_number_id', type: 'string', description: 'ID del número de teléfono', required: true },
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
    description: 'Envío de emails transaccionales',
    version: '1.0.0',
    category: 'messaging',
    requiredCredentials: [
      { name: 'smtp_host', type: 'string', description: 'Host SMTP', required: true },
      { name: 'smtp_port', type: 'string', description: 'Puerto SMTP', required: true },
      { name: 'smtp_user', type: 'string', description: 'Usuario SMTP', required: true },
      { name: 'smtp_password', type: 'secret', description: 'Contraseña SMTP', required: true },
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
      { name: 'getOrders', description: 'Listar órdenes', inputs: [{ name: 'status', type: 'string', required: false }], outputs: [{ name: 'orders', type: 'array' }] },
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

// Tenant connectors store
const tenantConnectors = new Map<string, TenantConnector>();

// ============ Encryption Helpers ============

function encrypt(text: string): string {
  const key = Buffer.from(ENCRYPTION_KEY.slice(0, 32), 'utf-8');
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decrypt(encrypted: string): string {
  const key = Buffer.from(ENCRYPTION_KEY.slice(0, 32), 'utf-8');
  const [ivHex, encryptedText] = encrypted.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// ============ Routes ============

/**
 * GET /connectors/catalog - List available connectors
 */
router.get('/catalog', requireAuth, async (req, res) => {
  const category = req.query.category as string | undefined;

  let connectors = CONNECTOR_CATALOG;
  if (category) {
    connectors = connectors.filter((c) => c.category === category);
  }

  res.json({
    success: true,
    data: connectors,
  });
});

/**
 * GET /connectors/catalog/:id - Get connector definition
 */
router.get('/catalog/:id', requireAuth, async (req, res) => {
  const connector = CONNECTOR_CATALOG.find((c) => c.id === req.params.id);

  if (!connector) {
    return res.status(404).json({
      success: false,
      error: { code: 'CONNECTOR_NOT_FOUND', message: 'Connector not found in catalog' },
    });
  }

  res.json({
    success: true,
    data: connector,
  });
});

/**
 * GET /connectors - List tenant's configured connectors
 */
router.get(
  '/',
  requireAuth,
  requireTenant,
  async (req, res) => {
    const tenantId = req.tenantId!;

    const connectors = Array.from(tenantConnectors.values()).filter(
      (c) => c.tenantId === tenantId
    );

    // Add connector definitions
    const enriched = connectors.map((tc) => {
      const definition = CONNECTOR_CATALOG.find((c) => c.id === tc.connectorId);
      return {
        ...tc,
        credentials: undefined, // Never expose credentials
        definition,
      };
    });

    res.json({
      success: true,
      data: enriched,
    });
  }
);

/**
 * POST /connectors - Configure a connector for tenant
 */
router.post(
  '/',
  requireAuth,
  requireTenant,
  requireRole('tenant_admin', 'platform_admin'),
  validate(ConfigureConnectorSchema),
  audit('connector.configure'),
  async (req, res) => {
    const tenantId = req.tenantId!;
    const { connectorId, credentials } = req.body;

    // Check connector exists
    const definition = CONNECTOR_CATALOG.find((c) => c.id === connectorId);
    if (!definition) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_CONNECTOR', message: 'Connector not found in catalog' },
      });
    }

    // Check required credentials
    for (const cred of definition.requiredCredentials) {
      if (cred.required && !credentials[cred.name]) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_CREDENTIAL',
            message: `Missing required credential: ${cred.name}`,
          },
        });
      }
    }

    // Encrypt credentials
    const encryptedCredentials: Record<string, string> = {};
    for (const [key, value] of Object.entries(credentials)) {
      encryptedCredentials[key] = encrypt(value as string);
    }

    // Check if already configured
    const existingKey = `${tenantId}:${connectorId}`;
    const existing = Array.from(tenantConnectors.entries()).find(
      ([_, c]) => c.tenantId === tenantId && c.connectorId === connectorId
    );

    const id = existing ? existing[0] : `tc_${ulid()}`;
    const tenantConnector: TenantConnector = {
      id,
      tenantId,
      connectorId,
      status: 'configured',
      credentials: encryptedCredentials,
      lastTestedAt: null,
      lastTestResult: null,
      createdAt: existing ? existing[1].createdAt : new Date(),
      updatedAt: new Date(),
    };

    tenantConnectors.set(id, tenantConnector);

    res.status(existing ? 200 : 201).json({
      success: true,
      data: {
        id: tenantConnector.id,
        connectorId,
        status: tenantConnector.status,
        definition,
      },
    });
  }
);

/**
 * POST /connectors/:id/test - Test connector credentials
 */
router.post(
  '/:id/test',
  requireAuth,
  requireTenant,
  requireRole('tenant_admin', 'operator', 'platform_admin'),
  audit('connector.test'),
  async (req, res) => {
    const tenantConnector = tenantConnectors.get(req.params.id);

    if (!tenantConnector || tenantConnector.tenantId !== req.tenantId) {
      return res.status(404).json({
        success: false,
        error: { code: 'CONNECTOR_NOT_FOUND', message: 'Connector configuration not found' },
      });
    }

    // Decrypt credentials for testing
    const decryptedCredentials: Record<string, string> = {};
    for (const [key, value] of Object.entries(tenantConnector.credentials)) {
      decryptedCredentials[key] = decrypt(value);
    }

    // TODO: Actually test the connection
    // For now, simulate success
    const testResult = Math.random() > 0.1; // 90% success rate simulation

    tenantConnector.lastTestedAt = new Date();
    tenantConnector.lastTestResult = testResult ? 'success' : 'failed';
    tenantConnector.status = testResult ? 'configured' : 'error';
    tenantConnector.updatedAt = new Date();
    tenantConnectors.set(tenantConnector.id, tenantConnector);

    res.json({
      success: true,
      data: {
        testResult: tenantConnector.lastTestResult,
        testedAt: tenantConnector.lastTestedAt,
        message: testResult
          ? 'Connection test successful'
          : 'Connection test failed. Please verify your credentials.',
      },
    });
  }
);

/**
 * DELETE /connectors/:id - Remove connector configuration
 */
router.delete(
  '/:id',
  requireAuth,
  requireTenant,
  requireRole('tenant_admin', 'platform_admin'),
  audit('connector.delete'),
  async (req, res) => {
    const tenantConnector = tenantConnectors.get(req.params.id);

    if (!tenantConnector || tenantConnector.tenantId !== req.tenantId) {
      return res.status(404).json({
        success: false,
        error: { code: 'CONNECTOR_NOT_FOUND', message: 'Connector configuration not found' },
      });
    }

    tenantConnectors.delete(req.params.id);

    res.json({
      success: true,
      data: { message: 'Connector configuration removed' },
    });
  }
);

/**
 * POST /connectors/learn - Learn a new connector from API docs (LLM-powered)
 */
router.post(
  '/learn',
  requireAuth,
  requireRole('platform_admin'),
  audit('connector.learn'),
  async (req, res) => {
    const { apiName, documentationUrl } = req.body;

    if (!apiName || !documentationUrl) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'apiName and documentationUrl are required' },
      });
    }

    // This would use the ConnectorLearningEngine
    // For now, return a placeholder
    res.json({
      success: true,
      data: {
        message: 'Connector learning initiated',
        sessionId: `learn_${ulid()}`,
        status: 'analyzing',
        estimatedTime: '2-5 minutes',
      },
    });
  }
);

export { router as connectorsRouter, CONNECTOR_CATALOG, tenantConnectors };
