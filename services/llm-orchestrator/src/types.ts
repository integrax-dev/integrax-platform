/**
 * LLM Orchestrator Types
 *
 * Tipos para el orquestador de integraciones basado en LLM
 */

import { z } from 'zod';

// ==================== Configuration ====================

export interface LLMConfig {
  apiKey: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface OrchestratorConfig {
  llm: LLMConfig;
  availableConnectors: ConnectorInfo[];
  tenantId?: string;
}

// ==================== Connectors ====================

export interface ConnectorInfo {
  id: string;
  name: string;
  description: string;
  category: 'payment' | 'erp' | 'messaging' | 'spreadsheet' | 'invoicing' | 'other';
  capabilities: string[];
  actions: ActionInfo[];
}

export interface ActionInfo {
  id: string;
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
}

// ==================== Intents & Tasks ====================

export const IntentSchema = z.enum([
  'create_invoice',      // Crear factura
  'process_payment',     // Procesar pago
  'send_notification',   // Enviar notificación (WhatsApp, Email)
  'sync_data',           // Sincronizar datos entre sistemas
  'query_data',          // Consultar información
  'create_workflow',     // Crear un flujo de trabajo
  'analyze_error',       // Analizar un error
  'explain_integration', // Explicar cómo funciona una integración
  'unknown',             // Intent no reconocido
]);

export type Intent = z.infer<typeof IntentSchema>;

export interface ParsedIntent {
  intent: Intent;
  confidence: number;
  entities: Record<string, unknown>;
  suggestedActions: SuggestedAction[];
  clarificationNeeded?: string;
}

export interface SuggestedAction {
  connectorId: string;
  actionId: string;
  description: string;
  parameters: Record<string, unknown>;
  confidence: number;
}

// ==================== Workflows ====================

export interface WorkflowStep {
  id: string;
  name: string;
  connectorId: string;
  actionId: string;
  parameters: Record<string, unknown>;
  dependsOn?: string[];
  onError?: 'stop' | 'continue' | 'retry';
  retryCount?: number;
}

export interface GeneratedWorkflow {
  id: string;
  name: string;
  description: string;
  trigger: WorkflowTrigger;
  steps: WorkflowStep[];
  createdAt: string;
}

export interface WorkflowTrigger {
  type: 'webhook' | 'schedule' | 'event' | 'manual';
  config: Record<string, unknown>;
}

// ==================== Error Analysis ====================

export interface ErrorContext {
  errorMessage: string;
  errorCode?: string;
  connectorId?: string;
  actionId?: string;
  inputData?: Record<string, unknown>;
  stackTrace?: string;
  timestamp: string;
}

export interface ErrorAnalysis {
  summary: string;
  rootCause: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: 'validation' | 'authentication' | 'network' | 'rate_limit' | 'data' | 'unknown';
  suggestedFixes: SuggestedFix[];
  preventionTips: string[];
  relatedDocs?: string[];
}

export interface SuggestedFix {
  description: string;
  code?: string;
  confidence: number;
}

// ==================== Conversation ====================

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
}

export interface ConversationContext {
  messages: Message[];
  currentIntent?: Intent;
  pendingWorkflow?: GeneratedWorkflow;
  lastError?: ErrorContext;
  metadata: Record<string, unknown>;
}

// ==================== Tool Definitions ====================

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

// ==================== Argentine-specific ====================

export interface ArgentinaContext {
  // AFIP
  cuit?: string;
  condicionIVA?: 'responsable_inscripto' | 'monotributo' | 'exento' | 'consumidor_final';
  puntoVenta?: number;

  // Business
  razonSocial?: string;
  domicilioFiscal?: string;

  // Preferences
  defaultCurrency?: 'ARS' | 'USD';
  timezone?: string;
}

// ==================== API Responses ====================

export interface OrchestratorResponse {
  success: boolean;
  message: string;
  data?: {
    intent?: ParsedIntent;
    workflow?: GeneratedWorkflow;
    errorAnalysis?: ErrorAnalysis;
    actions?: SuggestedAction[];
  };
  conversationId?: string;
}
