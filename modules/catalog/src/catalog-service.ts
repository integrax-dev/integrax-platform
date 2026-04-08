import type { Product, ProductStatus } from '@integrax/entities';
import { ulid } from '@integrax/entities';
import type { EventBus } from '@integrax/event-bus';
import type { SnapshotStore } from '@integrax/snapshot-store';
import { hashPayload } from '@integrax/snapshot-store';
import { detectMismatch } from '@integrax/platform-kernel';
import type { TimelineStore } from '@integrax/timeline';
import type {
  CatalogModule,
  PublishProductInput,
  UpdatePriceInput,
  ArchiveProductInput,
  ProductPriceDivergence,
} from './types.js';

export class CatalogService implements CatalogModule {
  constructor(
    private readonly store: SnapshotStore,
    private readonly bus: EventBus,
    private readonly timeline?: TimelineStore,
  ) {}

  async publishProduct(input: PublishProductInput): Promise<Product & { id: string }> {
    const id = ulid();
    const now = new Date();
    const product: Product & { id: string } = {
      ...input.product,
      id,
      updatedAt: now,
      sourceSystem: input.sourceSystem,
    };

    const payloadHash = hashPayload(product as unknown as Record<string, unknown>);
    await this.store.upsert({
      snapshotId: ulid(),
      tenantId: input.tenantId,
      entityType: 'product',
      canonicalId: id,
      externalIds: product.externalIds,
      payloadHash,
      payload: product as unknown as Record<string, unknown>,
      sourceSystem: input.sourceSystem,
      updatedAtSource: now,
      updatedAtSnapshot: now,
    });

    await this.timeline?.append(input.tenantId, {
      kind: 'entity',
      tenantId: input.tenantId,
      occurredAt: now,
      entityType: 'product',
      canonicalId: id,
      sourceSystem: input.sourceSystem,
      deltas: [],
      previousHash: null,
      currentHash: payloadHash,
      actor: 'system',
    });

    await this.bus.publish({
      id: ulid(),
      type: 'product.created',
      tenantId: input.tenantId,
      sourceSystem: input.sourceSystem,
      entityType: 'product',
      entityId: id,
      payload: product,
      occurredAt: now,
    });

    return product;
  }

  async updatePrice(input: UpdatePriceInput): Promise<void> {
    const snap = await this.store.get(input.tenantId, 'product', input.canonicalId);
    if (!snap) throw new Error(`Product not found: ${input.canonicalId}`);

    const prevPrice = snap.payload['price'] as number;
    const now = new Date();
    const updated = {
      ...snap.payload,
      price: input.newPrice,
      ...(input.currency ? { currency: input.currency } : {}),
      updatedAt: now,
    };
    const newHash = hashPayload(updated);

    await this.store.upsert({
      ...snap,
      snapshotId: ulid(),
      payload: updated,
      payloadHash: newHash,
      updatedAtSource: now,
      updatedAtSnapshot: now,
    });

    await this.timeline?.append(input.tenantId, {
      kind: 'entity',
      tenantId: input.tenantId,
      occurredAt: now,
      entityType: 'product',
      canonicalId: input.canonicalId,
      sourceSystem: input.sourceSystem,
      deltas: [{ field: 'price', before: prevPrice, after: input.newPrice }],
      previousHash: snap.payloadHash,
      currentHash: newHash,
      actor: 'system',
    });

    await this.bus.publish({
      id: ulid(),
      type: 'product.price_changed',
      tenantId: input.tenantId,
      sourceSystem: input.sourceSystem,
      entityType: 'product',
      entityId: input.canonicalId,
      payload: {
        canonicalId: input.canonicalId,
        previousPrice: prevPrice,
        newPrice: input.newPrice,
        sku: snap.payload['sku'],
      },
      occurredAt: now,
    });
  }

  async archiveProduct(input: ArchiveProductInput): Promise<void> {
    const snap = await this.store.get(input.tenantId, 'product', input.canonicalId);
    if (!snap) throw new Error(`Product not found: ${input.canonicalId}`);

    const now = new Date();
    const updated = { ...snap.payload, status: 'archived', updatedAt: now };
    const newHash = hashPayload(updated);
    await this.store.upsert({
      ...snap,
      snapshotId: ulid(),
      payload: updated,
      payloadHash: newHash,
      updatedAtSource: now,
      updatedAtSnapshot: now,
    });

    await this.timeline?.append(input.tenantId, {
      kind: 'entity',
      tenantId: input.tenantId,
      occurredAt: now,
      entityType: 'product',
      canonicalId: input.canonicalId,
      sourceSystem: input.sourceSystem,
      deltas: [{ field: 'status', before: snap.payload['status'], after: 'archived' }],
      previousHash: snap.payloadHash,
      currentHash: newHash,
      actor: 'system',
    });

    await this.bus.publish({
      id: ulid(),
      type: 'product.archived',
      tenantId: input.tenantId,
      sourceSystem: input.sourceSystem,
      entityType: 'product',
      entityId: input.canonicalId,
      payload: { canonicalId: input.canonicalId },
      occurredAt: now,
    });
  }

  async getProduct(tenantId: string, canonicalId: string): Promise<Product | null> {
    const snap = await this.store.get(tenantId, 'product', canonicalId);
    return snap ? (snap.payload as unknown as Product) : null;
  }

  async listProducts(
    tenantId: string,
    options: { status?: ProductStatus; since?: Date; limit?: number } = {},
  ): Promise<Product[]> {
    const snaps = await this.store.list(tenantId, 'product', { since: options.since, limit: options.limit });
    return snaps
      .map(s => s.payload as unknown as Product)
      .filter(p => !options.status || p.status === options.status);
  }

  async findPriceDivergences(tenantId: string): Promise<ProductPriceDivergence[]> {
    const snaps = await this.store.list(tenantId, 'product');

    const byCanonical = new Map<string, Array<{ system: string; price: number; currency: string; sku: string }>>();
    for (const snap of snaps) {
      const price = snap.payload['price'] as number;
      const currency = snap.payload['currency'] as string;
      const sku = snap.payload['sku'] as string;
      const group = byCanonical.get(snap.canonicalId) ?? [];
      group.push({ system: snap.sourceSystem, price, currency, sku });
      byCanonical.set(snap.canonicalId, group);
    }

    const divergences: ProductPriceDivergence[] = [];
    for (const [canonicalId, systems] of byCanonical) {
      if (systems.length < 2) continue;
      for (let i = 0; i < systems.length; i++) {
        for (let j = i + 1; j < systems.length; j++) {
          if (
            systems[i].currency === systems[j].currency &&
            detectMismatch(systems[i].price, systems[j].price, 0.01)
          ) {
            divergences.push({
              canonicalId,
              sku: systems[0].sku,
              systems: systems.map(s => ({ system: s.system, price: s.price, currency: s.currency })),
            });
            await this.bus.publish({
              id: ulid(),
              type: 'conflict.detected',
              tenantId,
              sourceSystem: 'catalog-module',
              entityType: 'product',
              entityId: canonicalId,
              payload: { kind: 'price_divergence', sku: systems[0].sku, systems },
              occurredAt: new Date(),
            });
            break;
          }
        }
      }
    }
    return divergences;
  }
}
