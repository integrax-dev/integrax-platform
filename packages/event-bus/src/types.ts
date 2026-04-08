import type { IntegraxEventType } from './event-types.js';

export interface IntegraxEvent<T = unknown> {
  /** ID unico del evento (se recomienda ulid). */
  id: string;
  type: IntegraxEventType;
  tenantId: string;
  /** Conector o servicio que produjo este evento. */
  sourceSystem: string;
  /** Tipo de entidad canonica (por ejemplo 'product', 'order' o 'invoice'). */
  entityType: string;
  /** ID canonico de la entidad, si ya fue resuelto. */
  entityId?: string;
  payload: T;
  occurredAt: Date;
  /** Vincula este evento con una traza o cadena de correlacion mas amplia. */
  correlationId?: string;
  /** Cantidad de reintentos si el evento se esta reprocesando desde la DLQ. */
  retryCount?: number;
}

export type EventHandler<T = unknown> = (event: IntegraxEvent<T>) => Promise<void> | void;

export type Unsubscribe = () => void;

export interface DeadLetterEntry<T = unknown> {
  event: IntegraxEvent<T>;
  error: unknown;
  failedAt: Date;
  handlerName?: string;
}

export interface EventBus {
  publish(event: IntegraxEvent): Promise<void>;
  /**
   * Se suscribe a uno o varios tipos de evento puntuales.
   * Devuelve una funcion para cancelar la suscripcion.
   */
  subscribe(
    type: IntegraxEventType | IntegraxEventType[],
    handler: EventHandler,
    options?: SubscribeOptions,
  ): Unsubscribe;
  /** Se suscribe a todos los tipos de evento. */
  subscribeAll(handler: EventHandler, options?: SubscribeOptions): Unsubscribe;
  /** Devuelve todas las entradas pendientes de la dead-letter queue. */
  deadLetterQueue(): DeadLetterEntry[];
  /** Reprocesa entradas de la DLQ, opcionalmente filtradas por tipo. */
  replayDlq(type?: IntegraxEventType): Promise<void>;
}

export interface SubscribeOptions {
  /** Nombre opcional del handler; se usa en entradas de DLQ y logs. */
  name?: string;
  /** Si es true, los errores del handler van a la DLQ en vez de lanzarse. Por defecto: true. */
  catchErrors?: boolean;
}
