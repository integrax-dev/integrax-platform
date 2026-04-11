import type { IntegraxEventType } from '@integrax/event-bus';

/**
 * Subconjunto de ConnectorFacade requerido para polling.
 * Es compatible estructuralmente con `@integrax/connector-sdk` ConnectorFacade.
 */
export interface PollableFacade {
  listEntities(entity: string, params?: Record<string, unknown>): Promise<unknown[]>;
}

export interface PollingConfig {
  /** Identificador unico de este job de polling. */
  jobId: string;
  tenantId: string;
  connectorId: string;
  entityType: string;
  /**
   * Nombre del campo que funciona como cursor en la API externa.
   * Por ejemplo 'updated_at', 'modified_at' o 'last_modified'.
   */
  cursorField: string;
  /**
   * Intervalo de polling en milisegundos.
   * Minimo 10 segundos para no castigar la API externa.
   */
  pollingIntervalMs: number;
  /** Facade a usar para traer entidades. */
  facade: PollableFacade;
  /**
   * Mapea cambios de entidad a tipos de evento.
   * Si no se define, usa 'webhook.received' como valor generico.
   */
  eventTypeOnChange?: IntegraxEventType;
  /**
   * Filtros opcionales que se pasan a `facade.listEntities()` junto con el cursor.
   */
  extraParams?: Record<string, unknown>;
}

export interface PollingCursor {
  jobId: string;
  tenantId: string;
  lastValue: string | number | null;
  lastPolledAt: Date;
  itemsSeen: number;
}

export interface PollingResult {
  jobId: string;
  polledAt: Date;
  itemsFetched: number;
  eventsEmitted: number;
  cursor: PollingCursor;
  error?: string;
}
