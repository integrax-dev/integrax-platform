/**
 * @integrax/realtime
 *
 * WebSocket server for real-time notifications.
 * Supports tenant-isolated channels and Redis pub/sub for scaling.
 */

import { WebSocket, WebSocketServer } from 'ws';
import { Redis } from 'ioredis';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import type { IncomingMessage } from 'http';
import { createServer, Server as HttpServer } from 'http';
import express, { Express } from 'express';
import { createLogger, Logger } from '@integrax/logger';
import { createHealthManager, HealthManager } from '@integrax/health';
import { config as loadEnv } from 'dotenv';

loadEnv();

const logger = createLogger({ service: 'realtime', version: '0.1.0' });

// ============================================
// Types
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
// Event Types
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
  | 'system.alert';

// ============================================
// WebSocket Server
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

    // Initialize Redis
    this.redis = new Redis(this.config.redisUrl);
    this.redisSub = new Redis(this.config.redisUrl);

    // Subscribe to Redis pub/sub for cross-instance messaging
    await this.redisSub.psubscribe('integrax:realtime:*');
    this.redisSub.on('pmessage', (_pattern, channel, message) => {
      this.handleRedisMessage(channel, message);
    });

    // Initialize HTTP and health
    const app = express();
    this.httpServer = createServer(app);
    this.healthManager = createHealthManager('0.1.0');

    // Add health routes
    app.use(this.healthManager.router());

    // Initialize WebSocket server
    this.wss = new WebSocketServer({ server: this.httpServer });

    this.wss.on('connection', (ws, req) => {
      this.handleConnection(ws, req);
    });

    // Start ping interval
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

    // Close all connections
    for (const [, conn] of this.connections) {
      conn.ws.close(1001, 'Server shutting down');
    }
    this.connections.clear();
    this.tenantConnections.clear();

    // Close Redis
    if (this.redisSub) {
      await this.redisSub.quit();
    }
    if (this.redis) {
      await this.redis.quit();
    }

    // Close WebSocket server
    if (this.wss) {
      this.wss.close();
    }

    // Close HTTP server
    if (this.httpServer) {
      this.httpServer.close();
    }

    this.logger.info('Realtime server stopped');
  }

  // ============================================
  // Connection Handling
  // ============================================

  private handleConnection(ws: WebSocket, req: IncomingMessage): void {
    // Authenticate connection
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

    // Track by tenant
    if (!this.tenantConnections.has(auth.tenantId)) {
      this.tenantConnections.set(auth.tenantId, new Set());
    }
    this.tenantConnections.get(auth.tenantId)!.add(connection.id);

    this.logger.info({ connectionId: connection.id, tenantId: auth.tenantId }, 'Client connected');

    // Send welcome message
    this.send(connection, {
      type: 'event',
      channel: 'system',
      data: { connected: true, connectionId: connection.id },
      timestamp: new Date().toISOString(),
    });

    // Handle messages
    ws.on('message', (data) => {
      this.handleMessage(connection, data.toString());
    });

    // Handle close
    ws.on('close', () => {
      this.handleDisconnect(connection);
    });

    // Handle errors
    ws.on('error', (error) => {
      this.logger.error({ err: error, connectionId: connection.id }, 'Client error');
    });
  }

  private authenticateConnection(req: IncomingMessage): { tenantId: string; userId?: string } | null {
    // Get token from query string or header
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
    // Remove from tenant connections
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
  // Message Handling
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
    // Validate channel belongs to tenant
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

  private isValidChannel(tenantId: string, channel: string): boolean {
    // Channels are prefixed with tenant ID for isolation
    // Allow: workflows, events, connectors, system
    const validPrefixes = ['workflows', 'events', 'connectors', 'system', 'alerts'];
    return validPrefixes.some((prefix) => channel === prefix || channel.startsWith(`${prefix}.`));
  }

  // ============================================
  // Broadcasting
  // ============================================

  /**
   * Broadcast event to all connections in a tenant subscribed to a channel
   */
  async broadcast(options: BroadcastOptions): Promise<void> {
    const { tenantId, channel, data, excludeConnectionId } = options;

    // Publish to Redis for cross-instance delivery
    if (this.redis) {
      await this.redis.publish(
        `integrax:realtime:${tenantId}`,
        JSON.stringify({ channel, data, excludeConnectionId })
      );
    }

    // Also deliver locally
    this.deliverToTenant(tenantId, channel, data, excludeConnectionId);
  }

  private handleRedisMessage(redisChannel: string, message: string): void {
    // Extract tenant ID from channel
    const match = redisChannel.match(/^integrax:realtime:(.+)$/);
    if (!match) return;

    const tenantId = match[1];

    try {
      const { channel, data, excludeConnectionId } = JSON.parse(message);
      this.deliverToTenant(tenantId, channel, data, excludeConnectionId);
    } catch (error) {
      this.logger.error({ err: error }, 'Failed to parse Redis message');
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
  // Event Publishing Helpers
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
  // Utility Methods
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
  // Stats
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
// ============================================

let instance: RealtimeServer | null = null;

export function getRealtimeServer(config?: RealtimeConfig): RealtimeServer {
  if (!instance) {
    instance = new RealtimeServer(config);
  }
  return instance;
}

export { WebSocket, WebSocketServer };
