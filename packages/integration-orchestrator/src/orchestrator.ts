/**
 * Integration Orchestrator
 *
 * The single entry point that closes the runtime loop:
 *
 *   webhook / polling
 *     → manifest lookup
 *     → facade resolution
 *     → canonicalization
 *     → snapshot-store upsert
 *     → event-bus publish  (only if changed)
 *     → timeline write
 *
 * This class is instantiated once in the control-plane container and
 * injected into routes/webhook-ingestion/polling-scheduler callbacks.
 * It does NOT implement HTTP, cron, or Kafka concerns.
 */

import { IdentityResolver } from '@integrax/platform-kernel';
import type { OrchestratorConfig, OrchestratorResult, CanonicalizedEntity } from './types.js';
import type { ConnectorManifestRegistry } from './connector-manifest-registry.js';
import { Canonicalizer } from './canonicalizer.js';
import { SnapshotWriter } from './snapshot-writer.js';
import { EventPublisher } from './event-publisher.js';
import { TimelineWriter } from './timeline-writer.js';

export class IntegrationOrchestrator {
  private readonly canonicalizer = new Canonicalizer();
  private readonly snapshotWriter: SnapshotWriter;
  private readonly eventPublisher: EventPublisher;
  private readonly timelineWriter: TimelineWriter;
  private readonly resolverFactory: (tenantId: string) => IdentityResolver;
  /** One IdentityResolver per tenant, lazily created. */
  private readonly resolvers = new Map<string, IdentityResolver>();

  constructor(
    private readonly registry: ConnectorManifestRegistry,
    config: OrchestratorConfig,
  ) {
    this.snapshotWriter = new SnapshotWriter(config.snapshotStore);
    this.eventPublisher = new EventPublisher(config.eventBus);
    this.timelineWriter = new TimelineWriter(config.timelineStore);
    this.resolverFactory = config.resolverFactory ?? ((_tenantId) => new IdentityResolver());
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  /**
   * Process a single raw item delivered via webhook.
   * The caller (webhooks.ts route) extracts the raw entity from the
   * normalized webhook payload and calls this.
   */
  async processWebhookItem(
    connectorId: string,
    entityType: string,
    rawItem: Record<string, unknown>,
    tenantId: string,
  ): Promise<OrchestratorResult> {
    const start = Date.now();
    const result = this.emptyResult(connectorId, entityType, tenantId);

    const manifest = this.registry.getManifest(connectorId);
    if (!manifest) {
      result.errors.push(`No manifest registered for connector: ${connectorId}`);
      return result;
    }

    const resolver = this.getResolver(tenantId);
    const entity = this.canonicalizer.canonicalize(rawItem, entityType, connectorId, manifest, resolver);

    if (!entity) {
      result.errors.push(`Could not canonicalize ${entityType} from ${connectorId}`);
      return result;
    }

    result.itemsProcessed = 1;
    await this.persistEntity(tenantId, entity, result, 'webhook', start);
    return result;
  }

  /**
   * Process a batch of raw items returned by a connector's listEntities().
   * Called by the polling-scheduler callback after each successful poll.
   */
  async processPollBatch(
    connectorId: string,
    entityType: string,
    items: unknown[],
    tenantId: string,
    cursorBefore: string | null,
    cursorAfter: string | null,
  ): Promise<OrchestratorResult> {
    const start = Date.now();
    const result = this.emptyResult(connectorId, entityType, tenantId);

    const manifest = this.registry.getManifest(connectorId);
    if (!manifest) {
      result.errors.push(`No manifest registered for connector: ${connectorId}`);
      return result;
    }

    const resolver = this.getResolver(tenantId);

    for (const raw of items) {
      try {
        const entity = this.canonicalizer.canonicalize(
          raw as Record<string, unknown>,
          entityType,
          connectorId,
          manifest,
          resolver,
        );
        if (entity) {
          result.itemsProcessed++;
          await this.persistEntity(tenantId, entity, result, 'poll', start);
        }
      } catch (err) {
        result.errors.push(err instanceof Error ? err.message : String(err));
      }
    }

    // Write a sync trace for the entire batch
    await this.timelineWriter.writeSyncTrace({
      tenantId,
      sourceSystem: connectorId,
      entityType,
      trigger: 'poll',
      recordsFetched: items.length,
      recordsChanged: result.snapshotsUpdated,
      cursor: cursorBefore,
      cursorAfter,
      durationMs: Date.now() - start,
      error: result.errors.length > 0 ? result.errors.join('; ') : undefined,
    });

    return result;
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private async persistEntity(
    tenantId: string,
    entity: CanonicalizedEntity,
    result: OrchestratorResult,
    trigger: 'poll' | 'webhook',
    _start: number,
  ): Promise<void> {
    const { snapshot, changed } = await this.snapshotWriter.write(tenantId, entity);

    if (changed) {
      result.snapshotsUpdated++;

      await this.eventPublisher.publishSnapshotUpdated(tenantId, snapshot);
      result.eventsEmitted++;

      // For webhooks, also write a per-entity sync trace
      if (trigger === 'webhook') {
        await this.timelineWriter.writeSyncTrace({
          tenantId,
          sourceSystem: entity.sourceSystem,
          entityType: entity.entityType,
          trigger: 'webhook',
          recordsFetched: 1,
          recordsChanged: 1,
          cursor: null,
          cursorAfter: null,
          durationMs: 0,
        });
      }

      await this.timelineWriter.writeEntityTrace({
        tenantId,
        snapshot,
        previousHash: null, // Snapshot-store has the diff; we omit it here for perf
      });
    }
  }

  private getResolver(tenantId: string): IdentityResolver {
    if (!this.resolvers.has(tenantId)) {
      this.resolvers.set(tenantId, this.resolverFactory(tenantId));
    }
    return this.resolvers.get(tenantId)!;
  }

  private emptyResult(
    connectorId: string,
    entityType: string,
    tenantId: string,
  ): OrchestratorResult {
    return {
      connectorId,
      entityType,
      tenantId,
      itemsProcessed: 0,
      snapshotsUpdated: 0,
      eventsEmitted: 0,
      errors: [],
    };
  }
}
