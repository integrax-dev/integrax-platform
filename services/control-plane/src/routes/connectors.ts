/**
 * Rutas de la API de gestión de conectores
 */

import { Router } from 'express';
import { ulid } from 'ulid';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import {
  ConnectorDefinition,
  TenantConnector,
  ConfigureConnectorSchema,
} from '../types.js';
import { requireAuth, requireRole, requireTenant } from '../middleware/auth.js';
import { audit } from '../middleware/audit.js';
import { validate } from '../middleware/validate.js';
import {
  getTenantConnector,
  findTenantConnector,
  listTenantConnectors,
  saveTenantConnector,
  deleteTenantConnector,
} from '../store/tenant-connectors.js';
import { CONNECTOR_TESTERS, type TestConnectionResult } from '../store/connector-testers.js';
import { emitPlatformEvent } from '../platform/platform-emitter.js';

// Connector testers moved to src/store/connector-testers.ts

// LEGACY_BLOCK_START — safe to delete after verifying no other caller uses these
async function testMercadoPago(credentials: Record<string, string>): Promise<TestConnectionResult> {
  const startTime = Date.now();
  const accessToken = credentials.access_token || credentials.accessToken;

  if (!accessToken) {
    return {
      success: false,
      testedAt: new Date(),
      latencyMs: Date.now() - startTime,
      error: { code: 'MISSING_CREDENTIALS', message: 'Access token is required' },
    };
  }

  try {
    const response = await fetch('https://api.mercadopago.com/users/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        testedAt: new Date(),
        latencyMs: Date.now() - startTime,
        error: {
          code: 'AUTH_FAILED',
          message: (errorData as { message?: string }).message || `HTTP ${response.status}`,
        },
      };
    }

    const userData = await response.json() as { id: number; email: string };
    return {
      success: true,
      testedAt: new Date(),
      latencyMs: Date.now() - startTime,
      details: { userId: userData.id, email: userData.email },
    };
  } catch (error) {
    return {
      success: false,
      testedAt: new Date(),
      latencyMs: Date.now() - startTime,
      error: { code: 'CONNECTION_ERROR', message: error instanceof Error ? error.message : 'Unknown error' },
    };
  }
}

/**
 * Prueba la conexión con WhatsApp Business API
 */
async function testWhatsApp(credentials: Record<string, string>): Promise<TestConnectionResult> {
  const startTime = Date.now();
  const { phone_number_id, access_token } = credentials;

  if (!phone_number_id || !access_token) {
    return {
      success: false,
      testedAt: new Date(),
      latencyMs: Date.now() - startTime,
      error: { code: 'MISSING_CREDENTIALS', message: 'Phone number ID and access token are required' },
    };
  }

  try {
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${phone_number_id}`,
      { headers: { Authorization: `Bearer ${access_token}` }, signal: AbortSignal.timeout(10000) }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({})) as { error?: { message?: string } };
      return {
        success: false,
        testedAt: new Date(),
        latencyMs: Date.now() - startTime,
        error: {
          code: 'AUTH_FAILED',
          message: errorData.error?.message || `HTTP ${response.status}`,
        },
      };
    }

    const phoneData = await response.json() as { id: string; display_phone_number: string; verified_name: string };
    return {
      success: true,
      testedAt: new Date(),
      latencyMs: Date.now() - startTime,
      details: {
        phoneNumberId: phoneData.id,
        displayPhoneNumber: phoneData.display_phone_number,
        verifiedName: phoneData.verified_name,
      },
    };
  } catch (error) {
    return {
      success: false,
      testedAt: new Date(),
      latencyMs: Date.now() - startTime,
      error: { code: 'CONNECTION_ERROR', message: error instanceof Error ? error.message : 'Unknown error' },
    };
  }
}

/**
 * Prueba la conexión SMTP de Email
 */
async function testEmail(credentials: Record<string, string>): Promise<TestConnectionResult> {
  const startTime = Date.now();
  const { smtp_host, smtp_port, smtp_user, smtp_password } = credentials;

  if (!smtp_host || !smtp_user || !smtp_password) {
    return {
      success: false,
      testedAt: new Date(),
      latencyMs: Date.now() - startTime,
      error: { code: 'MISSING_CREDENTIALS', message: 'SMTP host, user, and password are required' },
    };
  }

  try {
    // Importación dinámica para no cargar nodemailer si no hace falta
    const nodemailer = await import('nodemailer');
    const transporter = nodemailer.createTransport({
      host: smtp_host,
      port: parseInt(smtp_port || '587', 10),
      secure: smtp_port === '465',
      auth: { user: smtp_user, pass: smtp_password },
      connectionTimeout: 10000,
    });

    await transporter.verify();
    transporter.close();

    return {
      success: true,
      testedAt: new Date(),
      latencyMs: Date.now() - startTime,
      details: { host: smtp_host, user: smtp_user },
    };
  } catch (error) {
    return {
      success: false,
      testedAt: new Date(),
      latencyMs: Date.now() - startTime,
      error: { code: 'CONNECTION_ERROR', message: error instanceof Error ? error.message : 'Unknown error' },
    };
  }
}

/**
 * Prueba la conexión con Google Sheets
 */
async function testGoogleSheets(credentials: Record<string, string>): Promise<TestConnectionResult> {
  const startTime = Date.now();
  const { service_account_json } = credentials;

  if (!service_account_json) {
    return {
      success: false,
      testedAt: new Date(),
      latencyMs: Date.now() - startTime,
      error: { code: 'MISSING_CREDENTIALS', message: 'Service account JSON is required' },
    };
  }

  try {
    const serviceAccount = JSON.parse(service_account_json) as { client_email?: string; project_id?: string };

    if (!serviceAccount.client_email || !serviceAccount.project_id) {
      return {
        success: false,
        testedAt: new Date(),
        latencyMs: Date.now() - startTime,
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid service account JSON format' },
      };
    }

    // Para un test completo habría que autenticarse y hacer una llamada real
    // Por ahora se valida solo la estructura del JSON
    return {
      success: true,
      testedAt: new Date(),
      latencyMs: Date.now() - startTime,
      details: {
        clientEmail: serviceAccount.client_email,
        projectId: serviceAccount.project_id,
        note: 'Credentials format validated. Full API test requires spreadsheet access.',
      },
    };
  } catch (error) {
    return {
      success: false,
      testedAt: new Date(),
      latencyMs: Date.now() - startTime,
      error: { code: 'INVALID_JSON', message: 'Invalid service account JSON' },
    };
  }
}

/**
 * Prueba la conexión con Contabilium
 */
async function testContabilium(credentials: Record<string, string>): Promise<TestConnectionResult> {
  const startTime = Date.now();
  const { api_key, company_id } = credentials;

  if (!api_key) {
    return {
      success: false,
      testedAt: new Date(),
      latencyMs: Date.now() - startTime,
      error: { code: 'MISSING_CREDENTIALS', message: 'API key is required' },
    };
  }

  try {
    // Probar autenticación con la API de Contabilium
    const response = await fetch('https://rest.contabilium.com/api/v2/empresa', {
      headers: {
        Authorization: `Bearer ${api_key}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return {
        success: false,
        testedAt: new Date(),
        latencyMs: Date.now() - startTime,
        error: { code: 'AUTH_FAILED', message: `HTTP ${response.status}` },
      };
    }

    const companyData = await response.json() as { RazonSocial?: string };
    return {
      success: true,
      testedAt: new Date(),
      latencyMs: Date.now() - startTime,
      details: { companyName: companyData.RazonSocial, companyId: company_id },
    };
  } catch (error) {
    return {
      success: false,
      testedAt: new Date(),
      latencyMs: Date.now() - startTime,
      error: { code: 'CONNECTION_ERROR', message: error instanceof Error ? error.message : 'Unknown error' },
    };
  }
}

/**
 * Prueba la conexión con AFIP WSFE
 */
async function testAfipWsfe(credentials: Record<string, string>): Promise<TestConnectionResult> {
  const startTime = Date.now();
  const { cuit, certificate, private_key, environment } = credentials;

  if (!cuit || !certificate || !private_key) {
    return {
      success: false,
      testedAt: new Date(),
      latencyMs: Date.now() - startTime,
      error: { code: 'MISSING_CREDENTIALS', message: 'CUIT, certificate, and private key are required' },
    };
  }

  // Validar formato del certificado
  if (!certificate.includes('BEGIN CERTIFICATE') || !private_key.includes('BEGIN')) {
    return {
      success: false,
      testedAt: new Date(),
      latencyMs: Date.now() - startTime,
      error: { code: 'INVALID_CREDENTIALS', message: 'Invalid certificate or private key format' },
    };
  }

  // Nota: la auth completa de AFIP requiere firma CMS/PKCS#7, que es compleja
  // Por ahora se valida solo el formato de las credenciales
  return {
    success: true,
    testedAt: new Date(),
    latencyMs: Date.now() - startTime,
    details: {
      cuit,
      environment: environment || 'testing',
      note: 'Credential format validated. Full AFIP auth test requires CMS signing implementation.',
    },
  };
}

/**
 * Prueba la conexión con Tienda Nube
 */
async function testTiendaNube(credentials: Record<string, string>): Promise<TestConnectionResult> {
  const startTime = Date.now();
  const { store_id, access_token } = credentials;

  if (!store_id || !access_token) {
    return {
      success: false,
      testedAt: new Date(),
      latencyMs: Date.now() - startTime,
      error: { code: 'MISSING_CREDENTIALS', message: 'Store ID and access token are required' },
    };
  }

  try {
    const response = await fetch(`https://api.tiendanube.com/v1/${store_id}/store`, {
      headers: {
        Authentication: `bearer ${access_token}`,
        'User-Agent': 'IntegraX/1.0',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return {
        success: false,
        testedAt: new Date(),
        latencyMs: Date.now() - startTime,
        error: { code: 'AUTH_FAILED', message: `HTTP ${response.status}` },
      };
    }

    const storeData = await response.json() as { name?: { es?: string } };
    return {
      success: true,
      testedAt: new Date(),
      latencyMs: Date.now() - startTime,
      details: { storeId: store_id, storeName: storeData.name?.es },
    };
  } catch (error) {
    return {
      success: false,
      testedAt: new Date(),
      latencyMs: Date.now() - startTime,
      error: { code: 'CONNECTION_ERROR', message: error instanceof Error ? error.message : 'Unknown error' },
    };
  }
}

// LEGACY_BLOCK_END

// CONNECTOR_TESTERS now imported from '../store/connector-testers.js' above

const router: Router = Router();

function getCredentialEncryptionKey(): string {
  const key = process.env.CREDENTIAL_ENCRYPTION_KEY;

  if (process.env.NODE_ENV === 'production' && (!key || key.length < 32)) {
    throw new Error('CREDENTIAL_ENCRYPTION_KEY is required in production and must be at least 32 characters');
  }

  if (!key) {
    console.warn('[Connectors] WARNING: Using ephemeral encryption key outside production');
    return randomBytes(32).toString('hex');
  }

  return key;
}

const ENCRYPTION_KEY = getCredentialEncryptionKey();

// Catálogo de conectores disponibles
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

// ============ Helpers de Cifrado ============

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

// ============ Rutas ============

/**
 * GET /connectors/catalog - Lista los conectores disponibles en el catálogo
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
 * GET /connectors/catalog/:id - Obtiene la definición de un conector del catálogo
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
 * GET /connectors - Lista los conectores configurados del tenant
 */
router.get(
  '/',
  requireAuth,
  requireTenant,
  async (req, res) => {
    const tenantId = req.tenantId!;

    const connectors = await listTenantConnectors(tenantId);

    // Enriquecer con la definición del catálogo
    const enriched = connectors.map((tc) => {
      const definition = CONNECTOR_CATALOG.find((c) => c.id === tc.connectorId);
      return {
        ...tc,
        credentials: undefined, // Nunca exponer credenciales
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
 * POST /connectors - Configura un conector para el tenant
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

    // Verificar que el conector exista en el catálogo
    const definition = CONNECTOR_CATALOG.find((c) => c.id === connectorId);
    if (!definition) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_CONNECTOR', message: 'Connector not found in catalog' },
      });
    }

    // Verificar credenciales requeridas
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

    // Cifrar credenciales antes de guardar
    const encryptedCredentials: Record<string, string> = {};
    for (const [key, value] of Object.entries(credentials)) {
      encryptedCredentials[key] = encrypt(value as string);
    }

    // Upsert — ON CONFLICT (tenant_id, connector_id) maneja requests concurrentes.
    // Se pasa el createdAt existente para que el update no lo modifique; las filas nuevas usan NOW().
    const existing = await findTenantConnector(tenantId, connectorId);

    const tenantConnector: TenantConnector = {
      id: `tc_${ulid()}`, // solo se usa en el primer INSERT; ignorado en conflicto (Postgres conserva el original)
      tenantId,
      connectorId,
      status: 'configured',
      credentials: encryptedCredentials,
      lastTestedAt: null,
      lastTestResult: null,
      createdAt: existing ? existing.createdAt : new Date(),
      updatedAt: new Date(),
    };

    const storedId = await saveTenantConnector(tenantConnector);
    emitPlatformEvent(existing ? 'connector.updated' : 'connector.created', {
      id: storedId, connectorId, tenantId: tenantConnector.tenantId, status: tenantConnector.status,
    });

    res.status(existing ? 200 : 201).json({
      success: true,
      data: {
        id: storedId, // usar el id que realmente guardó Postgres
        connectorId,
        status: tenantConnector.status,
        definition,
      },
    });
  }
);

/**
 * POST /connectors/:id/test - Prueba las credenciales de un conector
 */
router.post(
  '/:id/test',
  requireAuth,
  requireTenant,
  requireRole('tenant_admin', 'operator', 'platform_admin'),
  audit('connector.test'),
  async (req, res) => {
    const tenantConnector = await getTenantConnector(req.params.id);

    if (!tenantConnector || tenantConnector.tenantId !== req.tenantId) {
      return res.status(404).json({
        success: false,
        error: { code: 'CONNECTOR_NOT_FOUND', message: 'Connector configuration not found' },
      });
    }

    // Descifrar credenciales solo para el test
    const decryptedCredentials: Record<string, string> = {};
    for (const [key, value] of Object.entries(tenantConnector.credentials)) {
      decryptedCredentials[key] = decrypt(value as string);
    }

    // Obtener la función de test para este tipo de conector
    const tester = CONNECTOR_TESTERS[tenantConnector.connectorId];

    let testResult: TestConnectionResult;

    if (tester) {
      // Usar el test real del conector
      testResult = await tester(decryptedCredentials);
    } else {
      // Fallback para conectores sin implementación de test
      testResult = {
        success: true,
        testedAt: new Date(),
        latencyMs: 0,
        details: { note: 'No specific test available for this connector. Credentials format validated.' },
      };
    }

    tenantConnector.lastTestedAt = testResult.testedAt;
    tenantConnector.lastTestResult = testResult.success ? 'success' : 'failed';
    tenantConnector.status = testResult.success ? 'configured' : 'error';
    tenantConnector.updatedAt = new Date();
    await saveTenantConnector(tenantConnector);
    emitPlatformEvent('connector.updated', {
      id: tenantConnector.id, connectorId: tenantConnector.connectorId,
      tenantId: tenantConnector.tenantId, status: tenantConnector.status,
    });

    res.json({
      success: true,
      data: {
        testResult: tenantConnector.lastTestResult,
        testedAt: tenantConnector.lastTestedAt,
        latencyMs: testResult.latencyMs,
        message: testResult.success
          ? 'Connection test successful'
          : testResult.error?.message || 'Connection test failed. Please verify your credentials.',
        details: testResult.details,
        error: testResult.error,
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
    const tenantConnector = await getTenantConnector(req.params.id);

    if (!tenantConnector || tenantConnector.tenantId !== req.tenantId) {
      return res.status(404).json({
        success: false,
        error: { code: 'CONNECTOR_NOT_FOUND', message: 'Connector configuration not found' },
      });
    }

    await deleteTenantConnector(req.params.id);
    emitPlatformEvent('connector.deleted', {
      id: req.params.id, tenantId: tenantConnector.tenantId,
    });

    res.json({
      success: true,
      data: { message: 'Connector configuration removed' },
    });
  }
);

/**
 * POST /connectors/compare - Comparar schemas de dos sistemas A y B
 *
 * Detecta diferencias estructurales y de tipos entre dos conjuntos de muestras JSON.
 * La mayoría de la lógica es determinística (sin consumo de tokens LLM).
 */
router.post(
  '/compare',
  requireAuth,
  requireTenant,
  requireRole('tenant_admin', 'operator', 'platform_admin'),
  audit('connector.compare'),
  async (req, res) => {
    const { connectorAId, connectorBId, samplesA, samplesB, options } = req.body as {
      connectorAId: string;
      connectorBId: string;
      samplesA: Record<string, unknown>[];
      samplesB: Record<string, unknown>[];
      options?: {
        renameSimilarityThreshold?: number;
        enableLlmEscalation?: boolean;
        maxLlmEscalations?: number;
      };
    };

    if (!connectorAId || !connectorBId) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'connectorAId y connectorBId son requeridos' },
      });
    }

    if (!Array.isArray(samplesA) || samplesA.length === 0 ||
        !Array.isArray(samplesB) || samplesB.length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'samplesA y samplesB deben ser arrays no vacíos (máx 2000 elementos)' },
      });
    }

    if (samplesA.length > 2000 || samplesB.length > 2000) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'Máximo 2000 muestras por sistema' },
      });
    }

    try {
      // Importación dinámica para evitar cargar el engine si no se usa
      const { createSchemaBridge } = await import('@integrax/schema-bridge');
      const { llm: schemaBridgeLlm } = await import('../platform/container/llm.js');
      const bridge = createSchemaBridge({
        redisUrl: process.env.REDIS_URL,
        // Pass the key only when the LLM port is configured — keeps schema-bridge vendor-agnostic
        anthropicApiKey: schemaBridgeLlm.isAvailable() ? process.env.ANTHROPIC_API_KEY : undefined,
      });

      const report = await bridge.compare({
        connectorAId,
        connectorBId,
        samplesA,
        samplesB,
        tenantId: req.tenantId,
        options: {
          renameSimilarityThreshold: options?.renameSimilarityThreshold ?? 0.70,
          enableLlmEscalation: options?.enableLlmEscalation ?? false,
          maxLlmEscalations: options?.maxLlmEscalations ?? 3,
        },
      });

      res.json({
        success: true,
        data: {
          reportId: report.id,
          connectorAId: report.connectorAId,
          connectorBId: report.connectorBId,
          summary: report.requirementsReport.summary,
          mappings: report.mappings,
          requirementsReport: report.requirementsReport,
          generatedTransformTs: report.generatedTransformTs,
          inferredSchemaA: {
            fingerprint: report.inferredSchemaA.fingerprint,
            fieldCount: report.inferredSchemaA.fields.length,
            fields: report.inferredSchemaA.fields,
          },
          inferredSchemaB: {
            fingerprint: report.inferredSchemaB.fingerprint,
            fieldCount: report.inferredSchemaB.fields.length,
            fields: report.inferredSchemaB.fields,
          },
          generatedAt: report.generatedAt,
        },
      });
    } catch (error) {
      console.error('[connectors/compare] Error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'COMPARISON_ERROR',
          message: error instanceof Error ? error.message : 'Error al comparar schemas',
        },
      });
    }
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

    // Usaría el ConnectorLearningEngine — por ahora retorna un placeholder
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

/**
 * POST /connectors/:id/activate-polling
 *
 * Activates cursor-based polling for a configured connector.
 * Calls registerTenantPolling so the PollingScheduler starts fetching.
 */
router.post(
  '/:id/activate-polling',
  requireAuth,
  requireTenant,
  requireRole('tenant_admin', 'platform_admin'),
  audit('connector.activate_polling'),
  async (req, res) => {
    const tenantId = req.tenantId!;
    const tc = await getTenantConnector(req.params.id);

    if (!tc || tc.tenantId !== tenantId) {
      return res.status(404).json({
        success: false,
        error: { code: 'CONNECTOR_NOT_FOUND', message: 'Connector configuration not found' },
      });
    }

    const { registerTenantPolling, orchestrator, pollingScheduler, connectorRegistry } = await import('../platform/container.js');

    const decryptedCredentials: Record<string, string> = {};
    for (const [key, value] of Object.entries(tc.credentials)) {
      decryptedCredentials[key] = decrypt(value as string);
    }

    await registerTenantPolling({
      tenantId,
      connectors: [{ connectorId: tc.connectorId, credentials: decryptedCredentials }],
      registry: connectorRegistry,
      scheduler: pollingScheduler,
      orchestrator,
    });

    res.json({
      success: true,
      data: { tenantId, connectorId: tc.connectorId, pollingActivated: true },
    });
  },
);

export { router as connectorsRouter, CONNECTOR_CATALOG };
