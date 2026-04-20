# @integrax/event-bus

Typed in-process event bus for the IntegraX platform.

**Exports:** `InMemoryEventBus`, `IntegraxEventType` (union of all event type strings), `IntegraxEvent`, `EventHandler`, `Unsubscribe`, `DeadLetterEntry`, `EventBus` interface, `SubscribeOptions`.

**How it works:** publish/subscribe with typed events. Failed handlers go to a dead-letter queue. Supports `once` subscriptions and per-event error isolation.

**Consumers:** `services/control-plane` (schema drift, conflict detection, notifications), `packages/integration-orchestrator`, `packages/operation-engine`.
