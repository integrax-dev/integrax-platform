/**
 * Tipos de manifest de conectores
 *
 * Esquema declarativo para los archivos `connector.manifest.ts`.
 * Cada conector declara sus capacidades, mapeos de entidades y puntos de
 * integracion. En estos manifests no debe haber logica procedural: solo datos.
 */

/**
 * Capacidades de alto nivel que un conector puede publicar.
 * La plataforma las usa para decidir que componentes del pipeline activar.
 */
export type ConnectorCapability =
  | 'read'             // puede leer entidades por polling o bajo demanda
  | 'write'            // puede crear o actualizar entidades
  | 'webhook_inbound'  // recibe eventos push desde el servicio externo
  | 'webhook_outbound' // puede suscribirse a webhooks del servicio externo
  | 'polling'          // soporta lectura incremental basada en cursor
  | 'notification'     // canal de notificacion solo saliente (email, whatsapp)
  | 'fiscal'           // emite documentos fiscales autorizados por organismos
  | 'spreadsheet'      // almacena datos tabulares estructurados
  | 'payments';        // PSP: puede procesar pagos, refunds, suscripciones, etc.

/**
 * Capacidades de pago granulares que un conector PSP puede declarar.
 * Las claves coinciden exactamente con OperationCapability del operation-engine.
 */
export type PaymentCapability =
  | 'create_payment'
  | 'authorize_payment'
  | 'capture_payment'
  | 'refund_payment'
  | 'cancel_payment'
  | 'tokenize_payment_method'
  | 'create_subscription'
  | 'cancel_subscription'
  | 'create_checkout_link'
  | 'generate_qr_payment'
  | 'create_split_payment'
  | 'reconcile_payment'
  | 'send_payment_reminder';

/**
 * Archivo unico requerido por conector.
 * Vive en `connectors/implementations/<service>/connector.manifest.ts`.
 */
export interface ConnectorManifest {
  /** Identificador unico del servicio, por ejemplo 'mercadopago', 'contabilium' o 'afip-wsfe'. */
  service: string;

  /** Ruta al spec OpenAPI / Swagger / Postman para generacion de codigo, relativa al manifest. */
  spec?: string;

  /** Configuracion de autenticacion. */
  auth: {
    type: 'api_key' | 'oauth2' | 'basic' | 'custom';
  };

  /**
   * Flags de capacidades de alto nivel.
   * `polling-scheduler` evalua `polling`; `webhook-ingestion` evalua `webhook_inbound`.
   * Si se omite, la plataforma trata al conector como solo `read + write`.
   */
  capabilities?: ConnectorCapability[];

  /**
   * Indica si el servicio externo empuja eventos hacia la plataforma por webhook.
   * Si es true, `webhook-ingestion` registra una ruta para este conector.
   */
  webhooks_supported?: boolean;

  /**
   * Indica si el conector soporta polling incremental basado en cursores.
   * Si es true, `polling-scheduler` puede registrar un job para este conector.
   */
  polling_supported?: boolean;

  /**
   * Campos que `polling-scheduler` puede usar como cursor para lectura incremental.
   * La primera entrada es el cursor preferido; las siguientes funcionan como respaldo.
   * Ejemplo: ['updated_at', 'date_last_updated']
   */
  cursor_fields?: string[];

  /**
   * Tipos de entidad canonica que este conector puede proveer.
   * Sirve para seleccionar entidades en `snapshot-store` y en el motor de reconciliacion.
   * Ejemplo: ['product', 'order', 'customer']
   */
  entities_supported?: string[];

  /**
   * Operaciones de API expuestas via facade.
   * Las claves deben coincidir con nombres de operacion reales del spec o del conector.
   * true = exponer, false = ocultar.
   */
  operations?: Record<string, boolean>;

  /**
   * Mapeos de entidades para el motor de reconciliacion.
   * Las claves son nombres canonicos ('product', 'order', 'customer', 'invoice').
   */
  entities?: Record<string, EntityManifest>;

  /**
   * Configuracion de monitoreo de drift de API.
   * Los endpoints listados aca se registran automaticamente en `connector-watchdog`.
   */
  drift?: {
    endpoints: string[];
  };

  /**
   * Hooks opcionales de ciclo de vida por entidad.
   * Las claves son nombres de entidad y los valores son rutas relativas al manifest.
   * Los hooks se ejecutan antes o despues de las acciones de reconciliacion.
   */
  hooks?: Record<string, string>;

  /**
   * Capacidades de pago granulares soportadas por este conector.
   * Solo relevante si `capabilities` incluye 'payments'.
   *
   * Ejemplo (MercadoPago):
   *   payment_capabilities: ['create_payment','refund_payment','create_subscription',
   *                          'create_checkout_link','generate_qr_payment']
   */
  payment_capabilities?: PaymentCapability[];
}

/**
 * Configuracion de una entidad dentro del manifest.
 * Le indica al motor de reconciliacion como extraer campos canonicos desde la
 * respuesta cruda de este servicio.
 */
export interface EntityManifest {
  /** Nombre del recurso de API, por ejemplo 'products', 'items' o 'comprobantes'. */
  source: string;

  /** Senales de identidad usadas para matchear entidades entre sistemas. */
  identity: {
    /** Campos primarios de identidad, en orden de prioridad. Soporta dot paths y arrays. */
    primary: string[];
    /** Campos de respaldo cuando la identidad primaria no alcanza para un match confiable. */
    fallback?: string[];
  };

  /**
   * Mapea nombres de campo canonicos a paths del payload origen.
   * Nombres canonicos: externalId, sku, title, price, currency, stock, status, updatedAt.
   * Paths: notacion con puntos, por ejemplo 'variants[0].price' o 'updated_at'.
   */
  fields: Record<string, string>;
}
