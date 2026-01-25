/**
 * IntegraX LLM Orchestrator
 *
 * Orquestador de integraciones impulsado por LLM para empresas argentinas.
 *
 * Características:
 * - Entiende intenciones en lenguaje natural
 * - Genera workflows de integración automáticamente
 * - Analiza errores y sugiere soluciones
 * - Conoce particularidades argentinas (AFIP, IVA, CUIT, etc.)
 *
 * @example
 * ```typescript
 * import { createOrchestrator, INTEGRAX_CONNECTORS } from '@integrax/llm-orchestrator';
 *
 * const orchestrator = createOrchestrator({
 *   llm: { apiKey: process.env.ANTHROPIC_API_KEY! },
 *   availableConnectors: INTEGRAX_CONNECTORS,
 * });
 *
 * const response = await orchestrator.processMessage(
 *   'Necesito crear una factura A para un cliente y enviarla por WhatsApp'
 * );
 * ```
 */

// Main exports
export { Orchestrator, createOrchestrator } from './orchestrator';
export { LLMClient, createLLMClient } from './llm-client';
export { ToolExecutor, createToolExecutor, INTEGRATION_TOOLS } from './tools';
export { INTEGRAX_CONNECTORS, getConnector, getConnectorsByCategory, searchConnectors } from './connectors-registry';

// Type exports
export type {
  // Config
  LLMConfig,
  OrchestratorConfig,

  // Connectors
  ConnectorInfo,
  ActionInfo,

  // Intents
  Intent,
  ParsedIntent,
  SuggestedAction,

  // Workflows
  WorkflowStep,
  WorkflowTrigger,
  GeneratedWorkflow,

  // Errors
  ErrorContext,
  ErrorAnalysis,
  SuggestedFix,

  // Conversation
  Message,
  ConversationContext,

  // Tools
  ToolDefinition,
  ToolResult,

  // Argentina
  ArgentinaContext,

  // Response
  OrchestratorResponse,
} from './types';
