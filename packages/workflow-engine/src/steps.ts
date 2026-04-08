/**
 * Definiciones de pasos de un flujo, los bloques de construccion del workflow.
 *
 * Catalogo de nodos:
 *
 * Acciones (publicos):
 *   CreateInvoice, UpdateStock, PublishProduct, UpdatePrice,
 *   CreateShipment, ChangeOrderStatus, SendEmail,
 *   WriteGoogleSheetRow, UploadDriveFile, NotifySlack
 *
 * Logica (publicos):
 *   IfElse, Delay, Retry, Switch, Branch, Approval
 *
 * Ayudantes (publicos):
 *   FindEntity, MapFields, ValidateData, ResolveIdentity, DeduplicateRecords
 *
 * Avanzados (restringidos):
 *   HTTPRequestRestricted, TransformJSON
 *
 * Internos (no expuestos a tenants):
 *   MatchEntities, ApplyPolicy, ReplaySyncEvent,
 *   SnapshotUpdate, CountryPackValidation
 */

export type StepVisibility = 'public' | 'restricted' | 'internal';

// --- Nodos de accion --------------------------------------------------------

export type PublicActionNode =
  | 'CreateInvoice'
  | 'UpdateStock'
  | 'PublishProduct'
  | 'UpdatePrice'
  | 'CreateShipment'
  | 'ChangeOrderStatus'
  | 'SendEmail'
  | 'WriteGoogleSheetRow'
  | 'UploadDriveFile'
  | 'NotifySlack';

// --- Nodos de logica --------------------------------------------------------

export type LogicNode =
  | 'IfElse'
  | 'Delay'
  | 'Retry'
  | 'Switch'
  | 'Branch'
  | 'Approval';

// --- Nodos helper -----------------------------------------------------------

export type HelperNode =
  | 'FindEntity'
  | 'MapFields'
  | 'ValidateData'
  | 'ResolveIdentity'
  | 'DeduplicateRecords';

// --- Nodos restringidos -----------------------------------------------------

export type RestrictedNode = 'HTTPRequestRestricted' | 'TransformJSON';

// --- Nodos internos ---------------------------------------------------------

export type InternalNode =
  | 'MatchEntities'
  | 'ApplyPolicy'
  | 'ReplaySyncEvent'
  | 'SnapshotUpdate'
  | 'CountryPackValidation';

export type NodeType =
  | PublicActionNode
  | LogicNode
  | HelperNode
  | RestrictedNode
  | InternalNode;

// --- Forma del paso ---------------------------------------------------------

export interface FlowStep {
  /** ID unico del paso dentro del flujo. */
  id: string;
  node: NodeType;
  /** Etiqueta legible para mostrar en la UI. */
  label?: string;
  /** Configuracion clave-valor especifica del tipo de nodo. */
  config: Record<string, unknown>;
  /** IDs de pasos a ejecutar si este paso termina bien. */
  onSuccess?: string[];
  /** IDs de pasos a ejecutar si este paso falla. */
  onFailure?: string[];
  /** Config de reintentos si el nodo lo soporta. */
  retry?: RetryConfig;
}

export interface RetryConfig {
  maxAttempts: number;
  backoffMs: number;
  backoffMultiplier?: number;
}

// --- Catalogo de metadata de nodos -----------------------------------------

export interface NodeDefinition {
  node: NodeType;
  visibility: StepVisibility;
  description: string;
  /** JSON schema del objeto config. */
  configSchema?: Record<string, unknown>;
}

export const NODE_CATALOG: NodeDefinition[] = [
  // --- Acciones ---
  { node: 'CreateInvoice', visibility: 'public', description: 'Crea una factura nueva usando el conector de billing configurado' },
  { node: 'UpdateStock', visibility: 'public', description: 'Actualiza el stock de un producto en el conector destino' },
  { node: 'PublishProduct', visibility: 'public', description: 'Publica o activa un producto en el conector destino' },
  { node: 'UpdatePrice', visibility: 'public', description: 'Actualiza el precio de un producto en el conector destino' },
  { node: 'CreateShipment', visibility: 'public', description: 'Crea un registro de envio en el conector logistico' },
  { node: 'ChangeOrderStatus', visibility: 'public', description: 'Cambia el estado de un pedido' },
  { node: 'SendEmail', visibility: 'public', description: 'Envia un email por medio del conector de email' },
  { node: 'WriteGoogleSheetRow', visibility: 'public', description: 'Escribe una fila en una planilla de Google Sheets' },
  { node: 'UploadDriveFile', visibility: 'public', description: 'Sube un archivo a Google Drive' },
  { node: 'NotifySlack', visibility: 'public', description: 'Envia un mensaje de Slack a un canal o usuario' },
  // --- Logica ---
  { node: 'IfElse', visibility: 'public', description: 'Ramifica el flujo segun una condicion' },
  { node: 'Delay', visibility: 'public', description: 'Espera un tiempo determinado antes de continuar' },
  { node: 'Retry', visibility: 'public', description: 'Reintenta un paso hasta N veces con backoff' },
  { node: 'Switch', visibility: 'public', description: 'Deriva el flujo a una de varias ramas segun un valor' },
  { node: 'Branch', visibility: 'public', description: 'Ejecuta varias ramas en paralelo' },
  { node: 'Approval', visibility: 'public', description: 'Pausa el flujo hasta que un operador apruebe o rechace' },
  // --- Ayudantes ---
  { node: 'FindEntity', visibility: 'public', description: 'Busca una entidad canonica por ID o external ID' },
  { node: 'MapFields', visibility: 'public', description: 'Mapea campos de un esquema a otro' },
  { node: 'ValidateData', visibility: 'public', description: 'Valida un payload contra un JSON schema' },
  { node: 'ResolveIdentity', visibility: 'public', description: 'Resuelve una identidad de entidad entre conectores' },
  { node: 'DeduplicateRecords', visibility: 'public', description: 'Elimina registros duplicados de una lista' },
  // --- Restringidos ---
  { node: 'HTTPRequestRestricted', visibility: 'restricted', description: 'Hace una request HTTP a un dominio allowlisted' },
  { node: 'TransformJSON', visibility: 'restricted', description: 'Transforma un payload JSON usando una expresion JMESPath' },
  // --- Internos ---
  { node: 'MatchEntities', visibility: 'internal', description: 'Ejecuta matching de identidad entre conectores (uso interno)' },
  { node: 'ApplyPolicy', visibility: 'internal', description: 'Aplica politicas de reconciliacion sobre conflictos detectados' },
  { node: 'ReplaySyncEvent', visibility: 'internal', description: 'Reprocesa un evento de sync desde la DLQ' },
  { node: 'SnapshotUpdate', visibility: 'internal', description: 'Actualiza el snapshot store de entidades' },
  { node: 'CountryPackValidation', visibility: 'internal', description: 'Ejecuta reglas de validacion de country packs sobre una entidad' },
];

/** Devuelve solo los nodos visibles para tenants (publicos + restringidos). */
export function publicNodes(): NodeDefinition[] {
  return NODE_CATALOG.filter(n => n.visibility !== 'internal');
}

/** Devuelve los nodos de una visibilidad dada. */
export function nodesByVisibility(visibility: StepVisibility): NodeDefinition[] {
  return NODE_CATALOG.filter(n => n.visibility === visibility);
}
