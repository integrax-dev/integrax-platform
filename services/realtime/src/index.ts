/**
 * @integrax/realtime
 *
 * Servidor WebSocket para notificaciones en tiempo real.
 * Soporta canales aislados por tenant y Redis pub/sub para escalar horizontalmente.
 */

import { WebSocket, WebSocketServer } from 'ws';
import { Redis } from 'ioredis';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import type { IncomingMessage } from 'http';
import { createServer, Server as HttpServer } from 'http';
import express from 'express';
import { createLogger, Logger } from '@integrax/logger';
import { createHealthManager, HealthManager } from '@integrax/health';
import { config as loadEnv } from 'dotenv';

loadEnv();

const logger = createLogger({ service: 'realtime', version: '0.1.0' });

// ============================================
// Tipos
// ============================================

export interface RealtimeConfig {
  port?: number;
  redisUrl?: string;
  jwtSecret?: string;
  pingInterval?: number;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? String(fallback), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export interface ClientConnection {
  id: string;
  ws: WebSocket;
  tenantId: string;
  userId?: string;
  subscriptions: Set<string>;
  lastPing: number;
}

export interface RealtimeMessage {
  type: 'subscribe' | 'unsubscribe' | 'event' | 'ping' | 'pong' | 'error';
  channel?: string;
  data?: unknown;
  timestamp?: string;
}

export interface BroadcastOptions {
  tenantId: string;
  channel: string;
  data: unknown;
  excludeConnectionId?: string;
}

// ============================================
// Tipos de Evento
// ============================================

export type EventType =
  | 'workflow.started'
  | 'workflow.completed'
  | 'workflow.failed'
  | 'workflow.step.completed'
  | 'connector.call.completed'
  | 'connector.call.failed'
  | 'event.received'
  | 'event.processed'
  | 'event.failed'
  | 'tenant.quota.warning'
  | 'tenant.rate.limited'
  | 'system.alert'
  | 'schema.diff.started'
  | 'schema.diff.completed'
  | 'schema.diff.failed';

// ============================================
// Servidor WebSocket
// ============================================

export class RealtimeServer {
  private wss: WebSocketServer | null = null;
  private httpServer: HttpServer | null = null;
  private healthManager: HealthManager | null = null;
  private redis: Redis | null = null;
  private redisSub: Redis | null = null;
  private connections: Map<string, ClientConnection> = new Map();
  private tenantConnections: Map<string, Set<string>> = new Map();
  private pingInterval: NodeJS.Timeout | null = null;
  private readonly config: Required<RealtimeConfig>;
  private logger: Logger = logger;

  constructor(config: RealtimeConfig = {}) {
    if (!config.jwtSecret && !process.env.JWT_SECRET) {
      throw new Error('JWT_SECRET environment variable is required');
    }

    if (!config.redisUrl && !process.env.REDIS_URL) {
      throw new Error('REDIS_URL environment variable is required');
    }

    this.config = {
      port: config.port ?? parsePositiveInt(process.env.WS_PORT, 3003),
      redisUrl: (config.redisUrl || process.env.REDIS_URL) as string,
      jwtSecret: (config.jwtSecret || process.env.JWT_SECRET) as string,
      pingInterval: config.pingInterval ?? parsePositiveInt(process.env.WS_PING_INTERVAL_MS, 30000),
    };
  }

  async start(): Promise<void> {
    this.logger.info({ port: this.config.port }, 'Starting Realtime server');

    // Inicializar Redis
    this.redis = new Redis(this.config.redisUrl);
    this.redisSub = new Redis(this.config.redisUrl);

    // Suscribirse a Redis pub/sub para mensajería entre instancias y eventos de schema-bridge
    await this.redisSub.psubscribe('integrax:realtime:*', 'integrax:schema:*');
    this.redisSub.on('pmessage', (_pattern, channel, message) => {
      this.handleRedisMessage(channel, message);
    });

    // Inicializar HTTP y health check
    const app = express();
    this.httpServer = createServer(app);
    this.healthManager = createHealthManager('0.1.0');

    // Agregar rutas de health
    app.use(this.healthManager.router());

    // Inicializar servidor WebSocket
    this.wss = new WebSocketServer({ server: this.httpServer, maxPayload: 64 * 1024 }); // 64 KB — previene ataques DoS con frames grandes

    this.wss.on('connection', (ws, req) => {
      this.handleConnection(ws, req);
    });

    // Iniciar intervalo de ping
    this.pingInterval = setInterval(() => {
      this.pingClients();
    }, this.config.pingInterval);

    this.httpServer.listen(this.config.port, () => {
      this.logger.info({ port: this.config.port }, 'Realtime server running (HTTP + WS)');
    });
  }

  async stop(): Promise<void> {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    // Cerrar todas las conexiones
    for (const [, conn] of this.connections) {
      conn.ws.close(1001, 'Server shutting down');
    }
    this.connections.clear();
    this.tenantConnections.clear();

    // Cerrar Redis
    if (this.redisSub) {
      await this.redisSub.quit();
    }
    if (this.redis) {
      await this.redis.quit();
    }

    // Cerrar servidor WebSocket
    if (this.wss) {
      this.wss.close();
    }

    // Cerrar servidor HTTP
    if (this.httpServer) {
      this.httpServer.close();
    }

    this.logger.info('Realtime server stopped');
  }

  // ============================================
  // Manejo de Conexiones
  // ============================================

  private handleConnection(ws: WebSocket, req: IncomingMessage): void {
    // Autenticar la conexión
    const auth = this.authenticateConnection(req);
    if (!auth) {
      ws.close(4001, 'Unauthorized');
      return;
    }

    const connection: ClientConnection = {
      id: uuidv4(),
      ws,
      tenantId: auth.tenantId,
      userId: auth.userId,
      subscriptions: new Set(),
      lastPing: Date.now(),
    };

    this.connections.set(connection.id, connection);

    // Agrupar por tenant
    if (!this.tenantConnections.has(auth.tenantId)) {
      this.tenantConnections.set(auth.tenantId, new Set());
    }
    this.tenantConnections.get(auth.tenantId)!.add(connection.id);

    this.logger.info({ connectionId: connection.id, tenantId: auth.tenantId }, 'Client connected');

    // Enviar mensaje de bienvenida
    this.send(connection, {
      type: 'event',
      channel: 'system',
      data: { connected: true, connectionId: connection.id },
      timestamp: new Date().toISOString(),
    });

    // Manejar mensajes entrantes
    ws.on('message', (data) => {
      this.handleMessage(connection, data.toString());
    });

    // Manejar cierre de conexión
    ws.on('close', () => {
      this.handleDisconnect(connection);
    });

    // Manejar errores del cliente
    ws.on('error', (error) => {
      this.logger.error({ err: error, connectionId: connection.id }, 'Client error');
    });
  }

  private authenticateConnection(req: IncomingMessage): { tenantId: string; userId?: string } | null {
    // Token aceptado desde query string (?token=...) o header Authorization.
    // Token-en-URL es el patrón estándar de auth para WebSocket porque los browsers
    // no pueden enviar headers custom en el handshake WS. Compromiso: los tokens
    // aparecen en logs de nginx/proxy y en el historial del browser. Mitigación:
    // filtrar los logs de acceso en producción (ej: nginx log_format que omite el
    // parámetro token) y usar JWTs de vida corta.
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const token = url.searchParams.get('token') || req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return null;
    }

    try {
      const decoded = jwt.verify(token, this.config.jwtSecret) as {
        tenantId: string;
        userId?: string;
        sub?: string;
      };

      return {
        tenantId: decoded.tenantId,
        userId: decoded.userId || decoded.sub,
      };
    } catch {
      return null;
    }
  }

  private handleDisconnect(connection: ClientConnection): void {
    // Eliminar de las conexiones del tenant
    const tenantConns = this.tenantConnections.get(connection.tenantId);
    if (tenantConns) {
      tenantConns.delete(connection.id);
      if (tenantConns.size === 0) {
        this.tenantConnections.delete(connection.tenantId);
      }
    }

    this.connections.delete(connection.id);
    this.logger.info({ connectionId: connection.id }, 'Client disconnected');
  }

  // ============================================
  // Manejo de Mensajes
  // ============================================

  private handleMessage(connection: ClientConnection, data: string): void {
    try {
      const message: RealtimeMessage = JSON.parse(data);

      switch (message.type) {
        case 'subscribe':
          if (message.channel) {
            this.subscribe(connection, message.channel);
          }
          break;

        case 'unsubscribe':
          if (message.channel) {
            this.unsubscribe(connection, message.channel);
          }
          break;

        case 'ping':
          connection.lastPing = Date.now();
          this.send(connection, { type: 'pong', timestamp: new Date().toISOString() });
          break;

        default:
          this.send(connection, {
            type: 'error',
            data: { message: 'Unknown message type' },
          });
      }
    } catch (error) {
      this.send(connection, {
        type: 'error',
        data: { message: 'Invalid message format' },
      });
    }
  }

  private subscribe(connection: ClientConnection, channel: string): void {
    // Validar que el canal pertenezca al tenant
    if (!this.isValidChannel(connection.tenantId, channel)) {
      this.send(connection, {
        type: 'error',
        data: { message: 'Invalid channel' },
      });
      return;
    }

    connection.subscriptions.add(channel);
    this.send(connection, {
      type: 'event',
      channel: 'system',
      data: { subscribed: channel },
      timestamp: new Date().toISOString(),
    });

    this.logger.info({ connectionId: connection.id, channel }, 'Client subscribed');
  }

  private unsubscribe(connection: ClientConnection, channel: string): void {
    connection.subscriptions.delete(channel);
    this.send(connection, {
      type: 'event',
      channel: 'system',
      data: { unsubscribed: channel },
      timestamp: new Date().toISOString(),
    });
  }

  private isValidChannel(_tenantId: string, channel: string): boolean {
    // Los canales están prefijados con el tenant ID para aislamiento
    // Permitidos: workflows, events, connectors, system, alerts, schema
    const validPrefixes = ['workflows', 'events', 'connectors', 'system', 'alerts', 'schema'];
    return validPrefixes.some((prefix) => channel === prefix || channel.startsWith(`${prefix}.`));
  }

  // ============================================
  // Broadcasting
  // ============================================

  /**
   * Emite un evento a todas las conexiones de un tenant suscritas al canal dado.
   */
  async broadcast(options: BroadcastOptions): Promise<void> {
    const { tenantId, channel, data, excludeConnectionId } = options;

    // Publicar en Redis para entrega cross-instancia
    if (this.redis) {
      await this.redis.publish(
        `integrax:realtime:${tenantId}`,
        JSON.stringify({ channel, data, excludeConnectionId })
      );
    }

    // También entregar localmente
    this.deliverToTenant(tenantId, channel, data, excludeConnectionId);
  }

  private handleRedisMessage(redisChannel: string, message: string): void {
    // integrax:realtime:{tenantId} — broadcast realtime genérico entre instancias
    const realtimeMatch = redisChannel.match(/^integrax:realtime:(.+)$/);
    if (realtimeMatch) {
      const tenantId = realtimeMatch[1];
      try {
        const { channel, data, excludeConnectionId } = JSON.parse(message);
        this.deliverToTenant(tenantId, channel, data, excludeConnectionId);
      } catch (error) {
        this.logger.error({ err: error }, 'Failed to parse Redis realtime message');
      }
      return;
    }

    // integrax:schema:{tenantId} — eventos de diff de schema-bridge
    const schemaMatch = redisChannel.match(/^integrax:schema:(.+)$/);
    if (schemaMatch) {
      const tenantId = schemaMatch[1];
      try {
        const payload = JSON.parse(message);
        this.deliverToTenant(tenantId, 'schema', payload);
      } catch (error) {
        this.logger.error({ err: error }, 'Failed to parse Redis schema message');
      }
    }
  }

  private deliverToTenant(
    tenantId: string,
    channel: string,
    data: unknown,
    excludeConnectionId?: string
  ): void {
    const tenantConns = this.tenantConnections.get(tenantId);
    if (!tenantConns) return;

    const message: RealtimeMessage = {
      type: 'event',
      channel,
      data,
      timestamp: new Date().toISOString(),
    };

    for (const connId of tenantConns) {
      if (connId === excludeConnectionId) continue;

      const conn = this.connections.get(connId);
      if (conn && conn.subscriptions.has(channel)) {
        this.send(conn, message);
      }
    }
  }

  // ============================================
  // Helpers para Publicar Eventos
  // ============================================

  async publishWorkflowEvent(
    tenantId: string,
    eventType: EventType,
    workflowId: string,
    data: Record<string, unknown>
  ): Promise<void> {
    await this.broadcast({
      tenantId,
      channel: 'workflows',
      data: {
        eventType,
        workflowId,
        ...data,
      },
    });
  }

  async publishConnectorEvent(
    tenantId: string,
    eventType: EventType,
    connectorId: string,
    data: Record<string, unknown>
  ): Promise<void> {
    await this.broadcast({
      tenantId,
      channel: 'connectors',
      data: {
        eventType,
        connectorId,
        ...data,
      },
    });
  }

  async publishEventNotification(
    tenantId: string,
    eventType: EventType,
    data: Record<string, unknown>
  ): Promise<void> {
    await this.broadcast({
      tenantId,
      channel: 'events',
      data: {
        eventType,
        ...data,
      },
    });
  }

  async publishSchemaDiffEvent(
    tenantId: string,
    eventType: 'schema.diff.started' | 'schema.diff.completed' | 'schema.diff.failed',
    data: Record<string, unknown>
  ): Promise<void> {
    await this.broadcast({
      tenantId,
      channel: 'schema',
      data: { eventType, ...data },
    });
  }

  async publishAlert(
    tenantId: string,
    severity: 'info' | 'warning' | 'error' | 'critical',
    message: string,
    details?: Record<string, unknown>
  ): Promise<void> {
    await this.broadcast({
      tenantId,
      channel: 'alerts',
      data: {
        eventType: 'system.alert',
        severity,
        message,
        details,
      },
    });
  }

  // ============================================
  // Métodos Utilitarios
  // ============================================

  private send(connection: ClientConnection, message: RealtimeMessage): void {
    if (connection.ws.readyState === WebSocket.OPEN) {
      connection.ws.send(JSON.stringify(message));
    }
  }

  private pingClients(): void {
    const now = Date.now();
    const timeout = this.config.pingInterval * 2;

    for (const [id, conn] of this.connections) {
      if (now - conn.lastPing > timeout) {
        this.logger.warn({ connectionId: id }, 'Client timed out');
        conn.ws.terminate();
        this.handleDisconnect(conn);
      } else if (conn.ws.readyState === WebSocket.OPEN) {
        conn.ws.ping();
      }
    }
  }

  // ============================================
  // Estadísticas
  // ============================================

  getStats(): {
    totalConnections: number;
    connectionsByTenant: Record<string, number>;
  } {
    const connectionsByTenant: Record<string, number> = {};
    for (const [tenantId, conns] of this.tenantConnections) {
      connectionsByTenant[tenantId] = conns.size;
    }

    return {
      totalConnections: this.connections.size,
      connectionsByTenant,
    };
  }
}

// ============================================
// Singleton
// (una sola instancia del servidor por proceso)
// ============================================

let instance: RealtimeServer | null = null;

export function getRealtimeServer(config?: RealtimeConfig): RealtimeServer {
  if (!instance) {
    instance = new RealtimeServer(config);
  }
  return instance;
}

export { WebSocket, WebSocketServer };
