import type { Stock } from '@integrax/entities';
import { ulid } from '@integrax/entities';
import type { EventBus } from '@integrax/event-bus';
import type { SnapshotStore } from '@integrax/snapshot-store';
import { hashPayload } from '@integrax/snapshot-store';
import { detectMismatch } from '@integrax/platform-kernel';
import type { TimelineStore } from '@integrax/timeline';
import type {
  InventoryModule,
  UpdateStockInput,
  ReserveStockInput,
  ReleaseReservationInput,
  StockDivergence,
} from './types.js';

// Reservation entity type stored in the snapshot store under entityType 'stock_reservation'.
// Key: canonicalId = `${tenantId}:${sku}:${referenceId}`
// This ensures reservations survive restarts and are consistent across replicas.

export class InventoryService implements InventoryModule {
  constructor(
    private readonly store: SnapshotStore,
    private readonly bus: EventBus,
    private readonly timeline?: TimelineStore,
  ) {}

  async updateStock(input: UpdateStockInput): Promise<Stock & { id: string }> {
    const id = input.canonicalId ?? ulid();
    const now = new Date();
    const stock: Stock & { id: string } = {
      id,
      externalIds: [],
      sku: input.sku,
      quantity: input.quantity,
      locationId: input.locationId,
      sourceSystem: input.sourceSystem,
      updatedAt: now,
    };

    const existing = await this.store.get(input.tenantId, 'stock', id);
    const prevQty = existing ? (existing.payload['quantity'] as number) : null;
    const prevHash = existing?.payloadHash ?? null;
    const newHash = hashPayload(stock as unknown as Record<string, unknown>);

    await this.store.upsert({
      snapshotId: ulid(),
      tenantId: input.tenantId,
      entityType: 'stock',
      canonicalId: id,
      externalIds: stock.externalIds,
      payloadHash: newHash,
      payload: stock as unknown as Record<string, unknown>,
      sourceSystem: input.sourceSystem,
      updatedAtSource: now,
      updatedAtSnapshot: now,
    });

    const deltas = prevQty !== null && prevQty !== input.quantity
      ? [{ field: 'quantity', before: prevQty, after: input.quantity }]
      : [];

    await this.timeline?.append(input.tenantId, {
      kind: 'entity',
      tenantId: input.tenantId,
      occurredAt: now,
      entityType: 'stock',
      canonicalId: id,
      sourceSystem: input.sourceSystem,
      deltas,
      previousHash: prevHash,
      currentHash: newHash,
      actor: 'system',
    });

    if (prevQty !== null && prevQty !== input.quantity) {
      await this.bus.publish({
        id: ulid(),
        type: 'stock.changed',
        tenantId: input.tenantId,
        sourceSystem: input.sourceSystem,
        entityType: 'stock',
        entityId: id,
        payload: { sku: input.sku, previousQuantity: prevQty, newQuantity: input.quantity },
        occurredAt: now,
      });
    }

    if (input.quantity === 0) {
      await this.bus.publish({
        id: ulid(),
        type: 'stock.depleted',
        tenantId: input.tenantId,
        sourceSystem: input.sourceSystem,
        entityType: 'stock',
        entityId: id,
        payload: { sku: input.sku },
        occurredAt: now,
      });
    }

    return stock;
  }

  async reserveStock(input: ReserveStockInput): Promise<void> {
    const canonicalId = `${input.tenantId}:${input.sku}:${input.referenceId}`;
    const now = new Date();
    const reservation = {
      tenantId: input.tenantId,
      sku: input.sku,
      referenceId: input.referenceId,
      quantity: input.quantity,
      sourceSystem: input.sourceSystem,
      reservedAt: now.toISOString(),
    };
    await this.store.upsert({
      snapshotId: ulid(),
      tenantId: input.tenantId,
      entityType: 'stock_reservation',
      canonicalId,
      externalIds: [],
      payloadHash: hashPayload(reservation),
      payload: reservation,
      sourceSystem: input.sourceSystem,
      updatedAtSource: now,
      updatedAtSnapshot: now,
    });
  }

  async releaseReservation(input: ReleaseReservationInput): Promise<void> {
    const canonicalId = `${input.tenantId}:${input.sku}:${input.referenceId}`;
    // Mark reservation as released by writing a tombstone payload
    const now = new Date();
    const tombstone = {
      tenantId: input.tenantId,
      sku: input.sku,
      referenceId: input.referenceId,
      quantity: 0,
      sourceSystem: input.sourceSystem,
      releasedAt: now.toISOString(),
      released: true,
    };
    await this.store.upsert({
      snapshotId: ulid(),
      tenantId: input.tenantId,
      entityType: 'stock_reservation',
      canonicalId,
      externalIds: [],
      payloadHash: hashPayload(tombstone),
      payload: tombstone,
      sourceSystem: input.sourceSystem,
      updatedAtSource: now,
      updatedAtSnapshot: now,
    });
  }

  async getStock(tenantId: string, sku: string, sourceSystem?: string): Promise<Stock | null> {
    const snaps = await this.store.list(tenantId, 'stock', { sourceSystem });
    const match = snaps.find(s => s.payload['sku'] === sku);
    return match ? (match.payload as unknown as Stock) : null;
  }

  async findDivergences(tenantId: string): Promise<StockDivergence[]> {
    const snaps = await this.store.list(tenantId, 'stock');

    const bySku = new Map<string, Array<{ system: string; quantity: number; canonicalId: string }>>();
    for (const snap of snaps) {
      const sku = snap.payload['sku'] as string;
      const qty = snap.payload['quantity'] as number;
      const group = bySku.get(sku) ?? [];
      group.push({ system: snap.sourceSystem, quantity: qty, canonicalId: snap.canonicalId });
      bySku.set(sku, group);
    }

    const divergences: StockDivergence[] = [];
    for (const [sku, systems] of bySku) {
      if (systems.length < 2) continue;
      const quantities = systems.map(s => s.quantity);
      const min = Math.min(...quantities);
      const max = Math.max(...quantities);
      if (detectMismatch(min, max, 0)) {
        divergences.push({
          sku,
          canonicalId: systems[0].canonicalId,
          systems: systems.map(s => ({ system: s.system, quantity: s.quantity })),
          maxDelta: max - min,
        });
        await this.bus.publish({
          id: ulid(),
          type: 'stock.diverged',
          tenantId,
          sourceSystem: 'inventory-module',
          entityType: 'stock',
          payload: { sku, systems, maxDelta: max - min },
          occurredAt: new Date(),
        });
      }
    }
    return divergences;
  }
}
