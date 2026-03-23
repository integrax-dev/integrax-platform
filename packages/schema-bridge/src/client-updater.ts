/**
 * Client Updater
 *
 * Notifica a clientes conectados cuando se detectan cambios de schema.
 * Dos canales:
 *   1. Redis pub/sub → fanout al servicio realtime (WebSocket)
 *   2. Callbacks locales para suscriptores programáticos
 *
 * Si Redis no está configurado, degrada graciosamente a callbacks locales.
 */

import type { BridgeReport, ChangeSeverity, ClientUpdateNotification } from './types.js';

type Logger = {
  info: (...a: unknown[]) => void;
  warn: (...a: unknown[]) => void;
  error: (...a: unknown[]) => void;
};

type Subscriber = (notification: ClientUpdateNotification) => void;
type UnsubscribeFn = () => void;

// Canal Redis compatible con services/realtime (integrax:realtime:*)
const DEFAULT_CHANNEL = 'integrax:realtime:connectors';

function computeSeverity(report: BridgeReport): ChangeSeverity {
  const { breakingCount, nonBreakingCount } = report.requirementsReport.summary;
  if (breakingCount > 0) return 'major';
  if (nonBreakingCount > 0) return 'minor';
  return 'info';
}

// ─── ClientUpdater ────────────────────────────────────────────────────────────

export class ClientUpdater {
  private readonly channel: string;
  private readonly logger: Logger;
  private readonly subscribers = new Map<string, Set<Subscriber>>();
  private redis: unknown = null; // ioredis.Redis — cargado dinámicamente

  constructor(options: {
    redisUrl?: string;
    realtimeChannel?: string;
    logger?: Logger;
  } = {}) {
    this.channel = options.realtimeChannel ?? DEFAULT_CHANNEL;
    this.logger = options.logger ?? {
      info: (...a) => console.info('[schema-bridge:client-updater]', ...a),
      warn: (...a) => console.warn('[schema-bridge:client-updater]', ...a),
      error: (...a) => console.error('[schema-bridge:client-updater]', ...a),
    };

    if (options.redisUrl) {
      this.initRedis(options.redisUrl);
    }
  }

  private initRedis(redisUrl: string): void {
    // Importación dinámica para no requerir ioredis si Redis no se usa
    import('ioredis').then(({ default: Redis }) => {
      this.redis = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 });
      this.logger.info({ channel: this.channel }, 'Redis pub/sub listo para notificaciones');
    }).catch(err => {
      this.logger.warn({ err }, 'ioredis no disponible — usando solo callbacks locales');
    });
  }

  /**
   * Suscribe un callback local para un connectorId específico.
   * Devuelve una función para cancelar la suscripción.
   */
  subscribe(connectorId: string, cb: Subscriber): UnsubscribeFn {
    if (!this.subscribers.has(connectorId)) {
      this.subscribers.set(connectorId, new Set());
    }
    this.subscribers.get(connectorId)!.add(cb);
    return () => this.subscribers.get(connectorId)?.delete(cb);
  }

  /**
   * Publica una notificación en Redis y llama callbacks locales.
   */
  async notify(notification: ClientUpdateNotification): Promise<void> {
    // 1. Callbacks locales (síncrono)
    for (const id of [notification.connectorAId, notification.connectorBId]) {
      const subs = this.subscribers.get(id);
      if (subs) {
        for (const cb of subs) {
          try { cb(notification); } catch (err) {
            this.logger.warn({ err, connectorId: id }, 'Error en subscriber local');
          }
        }
      }
    }

    // 2. Redis pub/sub (asíncrono)
    if (this.redis) {
      try {
        const payload = JSON.stringify({
          type: 'event',
          channel: 'connectors',
          data: {
            eventType: 'schema.bridge.updated',
            ...notification,
          },
        });
        await (this.redis as { publish: (ch: string, msg: string) => Promise<number> })
          .publish(this.channel, payload);
        this.logger.info({ reportId: notification.reportId, severity: notification.severity }, 'Notificación publicada en Redis');
      } catch (err) {
        this.logger.warn({ err }, 'Error publicando en Redis (no fatal)');
      }
    }
  }

  /**
   * Construye y emite la notificación a partir de un BridgeReport.
   * Fire-and-forget — los errores no propagan.
   */
  async notifySchemaChange(report: BridgeReport): Promise<void> {
    const notification: ClientUpdateNotification = {
      connectorAId: report.connectorAId,
      connectorBId: report.connectorBId,
      reportId: report.id,
      severity: computeSeverity(report),
      breakingChanges: report.requirementsReport.summary.breakingCount,
      nonBreakingChanges: report.requirementsReport.summary.nonBreakingCount,
      timestamp: new Date().toISOString(),
      tenantId: report.tenantId,
    };

    await this.notify(notification);
  }
}

export function createClientUpdater(options: {
  redisUrl?: string;
  realtimeChannel?: string;
  logger?: Logger;
} = {}): ClientUpdater {
  return new ClientUpdater(options);
}
