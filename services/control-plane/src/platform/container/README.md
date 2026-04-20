# platform/container/

Singletons de toda la app. Las rutas importan desde `container.ts` (fachada), nunca directamente de los sub-módulos.

| Archivo | Qué instancia |
|---|---|
| `event-bus.ts` | `InMemoryEventBus` singleton |
| `stores.ts` | Todos los stores Postgres (snapshot, operation, approval, idempotency, timeline, identity) |
| `connectors.ts` | `ConnectorManifestRegistry` + `FacadeResolver` |
| `commands.ts` | `CommandRegistry` con todos los comandos built-in |
| `modules.ts` | Servicios de dominio (Orders, Inventory, Billing, Catalog, Payments, Ecommerce, ConsistencyInspector) |
| `engine.ts` | `OperationEngine` — importa `moduleHandlers` de `module-handlers/index.ts` |
| `orchestrator.ts` | `IntegrationOrchestrator` + `PollingScheduler` |
| `llm.ts` | Instancia del puerto LLM (AnthropicLLMAdapter) |
| `temporal.ts` | Cliente Temporal lazy singleton compartido |
| `notification-handler.ts` | Suscribe al event-bus y despacha a canales de notificación |
| `ecommerce-registry.ts` | Cache per-tenant de EcommerceService (con o sin Medusa) |

## Sub-carpetas
- `module-handlers/` — handler por módulo para el OperationEngine dispatcher
