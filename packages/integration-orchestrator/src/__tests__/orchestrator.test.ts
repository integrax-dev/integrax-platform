import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IntegrationOrchestrator } from '../orchestrator.js';
import { ConnectorManifestRegistry } from '../connector-manifest-registry.js';
import { Canonicalizer } from '../canonicalizer.js';
import type { OrchestratorConfig } from '../types.js';
import type { SnapshotStore, EntitySnapshot } from '@integrax/snapshot-store';
import type { EventBus } from '@integrax/event-bus';
import type { TimelineStore } from '@integrax/timeline';
import type { ConnectorManifest } from '@integrax/connector-sdk';
import { IdentityResolver } from '@integrax/platform-kernel';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const MP_MANIFEST: ConnectorManifest = {
  service: 'mercadopago',
  auth: { type: 'api_key' },
  capabilities: ['read', 'webhook_inbound', 'polling'],
  webhooks_supported: true,
  polling_supported: true,
  cursor_fields: ['date_last_updated'],
  entities_supported: ['payment'],
  entities: {
    payment: {
      source: 'payments',
      identity: { primary: ['id'], fallback: ['external_reference'] },
      fields: {
        externalId: 'id',
        sku: 'external_reference',
        price: 'transaction_amount',
        currency: 'currency_id',
        status: 'status',
        updatedAt: 'date_last_updated',
      },
    },
  },
  drift: { endpoints: ['payments'] },
};

const RAW_PAYMENT = {
  id: '12345',
  external_reference: 'ORDER-99',
  transaction_amount: 1500.0,
  currency_id: 'ARS',
  status: 'approved',
  date_last_updated: '2026-04-01T10:00:00.000-03:00',
};

// ─── Mocks ────────────────────────────────────────────────────────────────────

function mockSnapshotStore(): SnapshotStore {
  const stored = new Map<string, EntitySnapshot>();
  return {
    get: vi.fn(async (_t: string, _et: string, canonicalId: string) => stored.get(canonicalId) ?? null),
    getAll: vi.fn(async () => []),
    upsert: vi.fn(async (snap: EntitySnapshot) => { stored.set(snap.canonicalId, snap); }),
    list: vi.fn(async () => []),
    diff: vi.fn(() => ({ fields: [], severity: 'LOW', recommendation: 'PROCEED' }) as any),
  };
}

function mockEventBus(): EventBus {
  return {
    publish: vi.fn(async () => {}),
    subscribe: vi.fn(() => () => {}),
    subscribeAll: vi.fn(() => () => {}),
    deadLetterQueue: vi.fn(() => []),
    replayDlq: vi.fn(async () => {}),
  };
}

function mockTimelineStore(): TimelineStore {
  return {
    append: vi.fn(async (_tenantId: string, entry: unknown) => ({ id: 'tl-1', recordedAt: new Date(), ...(entry as object) } as any)),
    list: vi.fn(async () => []),
    get: vi.fn(async () => null),
    resolveConflict: vi.fn(async () => ({}) as any),
  };
}

function makeConfig(): OrchestratorConfig & {
  snapshotStore: ReturnType<typeof mockSnapshotStore>;
  eventBus: ReturnType<typeof mockEventBus>;
  timelineStore: ReturnType<typeof mockTimelineStore>;
} {
  return {
    snapshotStore: mockSnapshotStore(),
    eventBus: mockEventBus(),
    timelineStore: mockTimelineStore(),
  };
}

// ─── ConnectorManifestRegistry ───────────────────────────────────────────────

describe('ConnectorManifestRegistry', () => {
  it('registers and retrieves a manifest', () => {
    const registry = new ConnectorManifestRegistry();
    registry.register({
      connectorId: 'mercadopago',
      manifest: MP_MANIFEST,
      createFacade: () => ({ execute: vi.fn(), listEntities: vi.fn(), getEntity: vi.fn(), updateEntity: vi.fn() }),
    });

    expect(registry.getManifest('mercadopago')).toBe(MP_MANIFEST);
    expect(registry.getManifest('unknown')).toBeUndefined();
  });

  it('filters polling connectors', () => {
    const registry = new ConnectorManifestRegistry();
    registry.register({ connectorId: 'mercadopago', manifest: MP_MANIFEST, createFacade: vi.fn() });
    registry.register({
      connectorId: 'email',
      manifest: { service: 'email', auth: { type: 'custom' }, polling_supported: false },
      createFacade: vi.fn(),
    });

    expect(registry.getPollingConnectors()).toHaveLength(1);
    expect(registry.getPollingConnectors()[0].connectorId).toBe('mercadopago');
  });

  it('filters entity connectors', () => {
    const registry = new ConnectorManifestRegistry();
    registry.register({ connectorId: 'mercadopago', manifest: MP_MANIFEST, createFacade: vi.fn() });
    expect(registry.getEntityConnectors('payment')).toHaveLength(1);
    expect(registry.getEntityConnectors('invoice')).toHaveLength(0);
  });
});

// ─── Canonicalizer ────────────────────────────────────────────────────────────

describe('Canonicalizer', () => {
  const canonicalizer = new Canonicalizer();
  const resolver = new IdentityResolver();

  it('maps raw fields to canonical payload', () => {
    const result = canonicalizer.canonicalize(RAW_PAYMENT, 'payment', 'mercadopago', MP_MANIFEST, resolver);
    expect(result).not.toBeNull();
    expect(result!.payload['price']).toBe(1500.0);
    expect(result!.payload['currency']).toBe('ARS');
    expect(result!.payload['status']).toBe('approved');
    expect(result!.sourceSystem).toBe('mercadopago');
    expect(result!.entityType).toBe('payment');
  });

  it('generates a stable canonical ID for the same primary key', () => {
    const resolver2 = new IdentityResolver();
    const r1 = canonicalizer.canonicalize(RAW_PAYMENT, 'payment', 'mercadopago', MP_MANIFEST, resolver2);
    const r2 = canonicalizer.canonicalize(RAW_PAYMENT, 'payment', 'mercadopago', MP_MANIFEST, resolver2);
    expect(r1!.canonicalId).toBe(r2!.canonicalId);
  });

  it('returns null for unknown entity type', () => {
    const result = canonicalizer.canonicalize(RAW_PAYMENT, 'invoice', 'mercadopago', MP_MANIFEST, resolver);
    expect(result).toBeNull();
  });

  it('extracts updatedAt from cursor field', () => {
    const result = canonicalizer.canonicalize(RAW_PAYMENT, 'payment', 'mercadopago', MP_MANIFEST, resolver);
    expect(result!.updatedAt).toBeInstanceOf(Date);
    expect(result!.updatedAt.getFullYear()).toBe(2026);
  });
});

// ─── IntegrationOrchestrator (processWebhookItem) ────────────────────────────

describe('IntegrationOrchestrator.processWebhookItem', () => {
  let registry: ConnectorManifestRegistry;
  let config: ReturnType<typeof makeConfig>;
  let orchestrator: IntegrationOrchestrator;

  beforeEach(() => {
    registry = new ConnectorManifestRegistry();
    registry.register({ connectorId: 'mercadopago', manifest: MP_MANIFEST, createFacade: vi.fn() });
    config = makeConfig();
    orchestrator = new IntegrationOrchestrator(registry, config);
  });

  it('writes snapshot and publishes event on new entity', async () => {
    const result = await orchestrator.processWebhookItem(
      'mercadopago', 'payment', RAW_PAYMENT, 'tenant-1',
    );

    expect(result.itemsProcessed).toBe(1);
    expect(result.snapshotsUpdated).toBe(1);
    expect(result.eventsEmitted).toBe(1);
    expect(result.errors).toHaveLength(0);

    expect(config.snapshotStore.upsert).toHaveBeenCalledOnce();
    expect(config.eventBus.publish).toHaveBeenCalledOnce();
    expect(config.timelineStore.append).toHaveBeenCalled();
  });

  it('does NOT publish event when snapshot is unchanged', async () => {
    // First call — creates snapshot
    await orchestrator.processWebhookItem('mercadopago', 'payment', RAW_PAYMENT, 'tenant-1');
    // Second call — same payload
    const result = await orchestrator.processWebhookItem('mercadopago', 'payment', RAW_PAYMENT, 'tenant-1');

    expect(result.snapshotsUpdated).toBe(0);
    expect(result.eventsEmitted).toBe(0);
  });

  it('returns error result for unknown connector', async () => {
    const result = await orchestrator.processWebhookItem('unknown-connector', 'payment', {}, 'tenant-1');
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('No manifest registered');
  });
});

// ─── IntegrationOrchestrator (processPollBatch) ───────────────────────────────

describe('IntegrationOrchestrator.processPollBatch', () => {
  it('processes a batch and writes a sync trace', async () => {
    const registry = new ConnectorManifestRegistry();
    registry.register({ connectorId: 'mercadopago', manifest: MP_MANIFEST, createFacade: vi.fn() });
    const config = makeConfig();
    const orchestrator = new IntegrationOrchestrator(registry, config);

    const items = [RAW_PAYMENT, { ...RAW_PAYMENT, id: '99999', external_reference: 'ORDER-200' }];
    const result = await orchestrator.processPollBatch(
      'mercadopago', 'payment', items, 'tenant-2', null, '2026-04-01T11:00:00Z',
    );

    expect(result.itemsProcessed).toBe(2);
    expect(result.snapshotsUpdated).toBe(2);
    // SyncTrace written at end of batch
    expect(config.timelineStore.append).toHaveBeenCalledWith(
      'tenant-2',
      expect.objectContaining({ kind: 'sync', recordsFetched: 2 }),
    );
  });
});
