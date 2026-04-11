/**
 * Event bus singleton
 *
 * In-process InMemoryEventBus for single-instance deployments.
 * Replace with a Redis/Kafka-backed implementation when scaling to 2+ replicas.
 * See TD-001 in the code comments and ARCHITECTURE.md for details.
 */

import { InMemoryEventBus } from '@integrax/event-bus';

export const eventBus = new InMemoryEventBus();
