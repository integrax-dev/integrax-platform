import type { EventBus, IntegraxEvent } from '@integrax/event-bus';
import type { PollingConfig, PollingCursor, PollingResult } from './types.js';
import { InMemoryCursorStore } from './cursor-store.js';

/** Interfaz mínima del cursor store — aceptada por InMemoryCursorStore y PostgresCursorStore. */
export interface ICursorStore {
  get(tenantId: string, jobId: string): Promise<PollingCursor | null>;
  set(cursor: PollingCursor): Promise<void>;
}

const MIN_INTERVAL_MS = 10_000; // 10 segundos

/**
 * Scheduler de polling basado en cursores.
 *
 * Cada job registrado consulta la facade del conector en un intervalo fijo,
 * trae solo los registros actualizados desde el ultimo cursor, emite eventos
 * sinteticos por cada cambio detectado y luego avanza el cursor.
 *
 * Uso:
 * ```ts
 * const scheduler = new PollingScheduler(bus);
 * scheduler.register({ jobId: 'mp-products', ... });
 * scheduler.start();
 * // ...
 * scheduler.stop();
 * ```
 */
export class PollingScheduler {
  private readonly jobs = new Map<string, PollingConfig>();
  private readonly timers = new Map<string, ReturnType<typeof setInterval>>();
  private readonly cursors: ICursorStore;
  private readonly bus: EventBus;
  private running = false;
  /**
   * Mutex por job: evita que un poll nuevo arranque si el anterior todavia
   * no termino (doble-poll por interval drift o lentitud de la API externa).
   */
  private readonly activePoll = new Set<string>();

  /**
   * @param bus        Bus de eventos donde se publican los cambios detectados
   * @param cursorStore Implementación del cursor store.
   *                   - Desarrollo: omitir (usa InMemoryCursorStore)
   *                   - Producción: pasar PostgresCursorStore para sobrevivir reinicios
   */
  constructor(bus: EventBus, cursorStore?: ICursorStore) {
    this.bus = bus;
    this.cursors = cursorStore ?? new InMemoryCursorStore();
  }

  register(config: PollingConfig): void {
    if (config.pollingIntervalMs < MIN_INTERVAL_MS) {
      throw new Error(
        `pollingIntervalMs debe ser al menos ${MIN_INTERVAL_MS}ms (recibido ${config.pollingIntervalMs})`,
      );
    }
    // Capability guard: facade must actually support listEntities.
    // Notification-only facades (email, whatsapp) always return [] — registering
    // them as polling jobs is a misconfiguration, not a runtime error we silently swallow.
    if (typeof config.facade.listEntities !== 'function') {
      throw new Error(
        `PollingScheduler: la facade del job '${config.jobId}' no implementa listEntities. ` +
        `Verificar que el conector tenga polling_supported: true en su manifest.`,
      );
    }
    this.jobs.set(this.jobKey(config.tenantId, config.jobId), config);
    if (this.running) {
      this.scheduleJob(config);
    }
  }

  unregister(tenantId: string, jobId: string): void {
    const key = this.jobKey(tenantId, jobId);
    this.jobs.delete(key);
    const timer = this.timers.get(key);
    if (timer) {
      clearInterval(timer);
      this.timers.delete(key);
    }
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    for (const config of this.jobs.values()) {
      this.scheduleJob(config);
    }
  }

  stop(): void {
    this.running = false;
    for (const timer of this.timers.values()) {
      clearInterval(timer);
    }
    this.timers.clear();
  }

  /** Dispara manualmente un ciclo de polling, util para tests. */
  async poll(tenantId: string, jobId: string): Promise<PollingResult> {
    const config = this.jobs.get(this.jobKey(tenantId, jobId));
    if (!config) throw new Error(`Job no encontrado: ${jobId}`);
    return this.runPoll(config);
  }

  // --- Interno --------------------------------------------------------------

  private jobKey(tenantId: string, jobId: string): string {
    return `${tenantId}:${jobId}`;
  }

  private scheduleJob(config: PollingConfig): void {
    const key = this.jobKey(config.tenantId, config.jobId);
    const existing = this.timers.get(key);
    if (existing) clearInterval(existing);

    // Corre una vez inmediatamente y despues sigue por intervalo.
    void this.runPoll(config);
    const timer = setInterval(() => {
      void this.runPoll(config);
    }, config.pollingIntervalMs);
    this.timers.set(key, timer);
  }

  private async runPoll(config: PollingConfig): Promise<PollingResult> {
    const key = this.jobKey(config.tenantId, config.jobId);

    const defaultCursor = (): PollingCursor => ({
      jobId: config.jobId,
      tenantId: config.tenantId,
      lastValue: null,
      lastPolledAt: new Date(0),
      itemsSeen: 0,
    });

    // Mutex: skip this cycle if the previous poll is still running.
    if (this.activePoll.has(key)) {
      const stored = await this.cursors.get(config.tenantId, config.jobId);
      return {
        jobId: config.jobId,
        polledAt: new Date(),
        itemsFetched: 0,
        eventsEmitted: 0,
        cursor: stored ?? defaultCursor(),
        error: 'skipped: previous poll still running',
      };
    }

    this.activePoll.add(key);
    const polledAt = new Date();
    const existing = await this.cursors.get(config.tenantId, config.jobId);
    const cursor: PollingCursor = existing ?? {
      jobId: config.jobId,
      tenantId: config.tenantId,
      lastValue: null,
      lastPolledAt: new Date(0),
      itemsSeen: 0,
    };

    try {
      const params: Record<string, unknown> = {
        ...(config.extraParams ?? {}),
        ...(cursor.lastValue != null
          ? { [`${config.cursorField}_gt`]: cursor.lastValue }
          : {}),
      };

      const items = await config.facade.listEntities(config.entityType, params);
      let eventsEmitted = 0;
      let newCursorValue: string | number | null = cursor.lastValue;

      for (const item of items) {
        const record = item as Record<string, unknown>;
        const cursorFieldValue = record[config.cursorField];
        if (cursorFieldValue != null) {
          const cv = cursorFieldValue as string | number;
          if (newCursorValue === null || cv > newCursorValue) {
            newCursorValue = cv;
          }
        }

        const event: IntegraxEvent<unknown> = {
          id: `poll-${Date.now()}-${eventsEmitted}`,
          type: config.eventTypeOnChange ?? 'webhook.received',
          tenantId: config.tenantId,
          sourceSystem: config.connectorId,
          entityType: config.entityType,
          entityId: typeof record['id'] === 'string' ? record['id'] : undefined,
          payload: record,
          occurredAt: polledAt,
          correlationId: `poll:${config.jobId}`,
        };
        await this.bus.publish(event);
        eventsEmitted++;
      }

      const updatedCursor: PollingCursor = {
        ...cursor,
        lastValue: newCursorValue,
        lastPolledAt: polledAt,
        itemsSeen: cursor.itemsSeen + items.length,
      };
      await this.cursors.set(updatedCursor);

      this.activePoll.delete(key);
      return {
        jobId: config.jobId,
        polledAt,
        itemsFetched: items.length,
        eventsEmitted,
        cursor: updatedCursor,
      };
    } catch (err) {
      this.activePoll.delete(key);
      return {
        jobId: config.jobId,
        polledAt,
        itemsFetched: 0,
        eventsEmitted: 0,
        cursor,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
