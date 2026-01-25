/**
 * LLM Orchestrator
 *
 * Orquestador principal que usa LLM para:
 * - Entender intenciones del usuario
 * - Generar workflows de integración
 * - Analizar errores y sugerir soluciones
 * - Responder preguntas sobre integraciones
 */

import { LLMClient, createLLMClient } from './llm-client';
import { ToolExecutor, INTEGRATION_TOOLS, createToolExecutor } from './tools';
import type {
  OrchestratorConfig,
  OrchestratorResponse,
  ParsedIntent,
  GeneratedWorkflow,
  ErrorAnalysis,
  ErrorContext,
  ConversationContext,
  Message,
  ConnectorInfo,
  WorkflowStep,
  ArgentinaContext,
} from './types';

// System prompts
const SYSTEM_PROMPTS = {
  general: `Sos un asistente experto en integraciones para empresas argentinas.
Tu objetivo es ayudar a los usuarios a conectar sus sistemas (MercadoPago, AFIP, Contabilium, WhatsApp, etc.).

Conocés en detalle:
- Facturación electrónica argentina (AFIP WSFE, CAE, tipos de comprobante)
- Condiciones IVA (Responsable Inscripto, Monotributo, Exento, Consumidor Final)
- Pagos con MercadoPago
- ERPs como Contabilium
- Mensajería con WhatsApp Business

Respondé siempre en español argentino. Sé conciso y práctico.
Cuando no tengas certeza, preguntá para clarificar.`,

  intentParser: `Analizá el mensaje del usuario y determiná su intención.
Respondé SOLO con JSON válido con esta estructura:
{
  "intent": "create_invoice" | "process_payment" | "send_notification" | "sync_data" | "query_data" | "create_workflow" | "analyze_error" | "explain_integration" | "unknown",
  "confidence": 0.0-1.0,
  "entities": { entidades extraídas },
  "suggestedActions": [{ connectorId, actionId, description, parameters, confidence }],
  "clarificationNeeded": "pregunta si necesita clarificación"
}`,

  workflowGenerator: `Generá un workflow de integración basado en el requerimiento del usuario.
Respondé SOLO con JSON válido con esta estructura:
{
  "id": "wf-xxx",
  "name": "Nombre del workflow",
  "description": "Descripción",
  "trigger": { "type": "webhook" | "schedule" | "event" | "manual", "config": {} },
  "steps": [
    {
      "id": "step-1",
      "name": "Nombre del paso",
      "connectorId": "id del conector",
      "actionId": "id de la acción",
      "parameters": {},
      "dependsOn": ["step-x"],
      "onError": "stop" | "continue" | "retry"
    }
  ]
}`,

  errorAnalyzer: `Analizá el error y proporcioná un diagnóstico detallado.
Respondé SOLO con JSON válido con esta estructura:
{
  "summary": "Resumen del error",
  "rootCause": "Causa raíz probable",
  "severity": "low" | "medium" | "high" | "critical",
  "category": "validation" | "authentication" | "network" | "rate_limit" | "data" | "unknown",
  "suggestedFixes": [{ "description": "...", "code": "...", "confidence": 0.0-1.0 }],
  "preventionTips": ["tip1", "tip2"],
  "relatedDocs": ["url1"]
}`,
};

export class Orchestrator {
  private llm: LLMClient;
  private tools: ToolExecutor;
  private connectors: ConnectorInfo[];
  private tenantId?: string;
  private conversations: Map<string, ConversationContext> = new Map();

  constructor(config: OrchestratorConfig) {
    this.llm = createLLMClient(config.llm);
    this.connectors = config.availableConnectors;
    this.tools = createToolExecutor(this.connectors);
    this.tenantId = config.tenantId;
  }

  /**
   * Procesa un mensaje del usuario
   */
  async processMessage(
    message: string,
    conversationId?: string,
    argentinaContext?: ArgentinaContext
  ): Promise<OrchestratorResponse> {
    // Get or create conversation context
    const convId = conversationId || crypto.randomUUID();
    let context = this.conversations.get(convId);

    if (!context) {
      context = {
        messages: [],
        metadata: argentinaContext ? { argentina: argentinaContext } : {},
      };
      this.conversations.set(convId, context);
    }

    // Add user message
    context.messages.push({
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
    });

    try {
      // First, parse the intent
      const intent = await this.parseIntent(message, context);
      context.currentIntent = intent.intent;

      // Route based on intent
      let response: OrchestratorResponse;

      switch (intent.intent) {
        case 'create_invoice':
        case 'process_payment':
        case 'send_notification':
        case 'sync_data':
        case 'create_workflow':
          response = await this.handleWorkflowIntent(message, intent, context);
          break;

        case 'analyze_error':
          response = await this.handleErrorAnalysis(message, context);
          break;

        case 'query_data':
        case 'explain_integration':
          response = await this.handleQueryIntent(message, context);
          break;

        default:
          response = await this.handleGeneralChat(message, context);
      }

      // Add assistant response to context
      context.messages.push({
        role: 'assistant',
        content: response.message,
        timestamp: new Date().toISOString(),
      });

      return {
        ...response,
        conversationId: convId,
      };
    } catch (error) {
      return {
        success: false,
        message: `Error al procesar el mensaje: ${error instanceof Error ? error.message : 'Error desconocido'}`,
        conversationId: convId,
      };
    }
  }

  /**
   * Parse user intent from message
   */
  private async parseIntent(message: string, context: ConversationContext): Promise<ParsedIntent> {
    const prompt = `Mensaje del usuario: "${message}"

Contexto previo: ${context.messages.slice(-4).map((m) => `${m.role}: ${m.content}`).join('\n')}

Conectores disponibles: ${this.connectors.map((c) => c.name).join(', ')}`;

    try {
      const result = await this.llm.parseStructured<ParsedIntent>(
        prompt,
        SYSTEM_PROMPTS.intentParser,
        (text) => JSON.parse(text)
      );
      return result;
    } catch {
      return {
        intent: 'unknown',
        confidence: 0,
        entities: {},
        suggestedActions: [],
      };
    }
  }

  /**
   * Handle intents that require workflow generation
   */
  private async handleWorkflowIntent(
    message: string,
    intent: ParsedIntent,
    context: ConversationContext
  ): Promise<OrchestratorResponse> {
    // Use tools to gather information and generate workflow
    const systemPrompt = `${SYSTEM_PROMPTS.general}

El usuario quiere: ${intent.intent}
Entidades detectadas: ${JSON.stringify(intent.entities)}

Usá las herramientas disponibles para:
1. Buscar los conectores necesarios
2. Obtener las acciones disponibles
3. Validar el workflow generado

Luego generá un workflow completo y explicalo al usuario.`;

    const { response, toolResults } = await this.llm.chatWithTools(
      context.messages,
      INTEGRATION_TOOLS,
      systemPrompt,
      async (toolName, input) => this.tools.execute(toolName, input)
    );

    // Try to extract workflow from response
    let workflow: GeneratedWorkflow | undefined;
    try {
      const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        workflow = JSON.parse(jsonMatch[1]);
        context.pendingWorkflow = workflow;
      }
    } catch {
      // No workflow in response, that's ok
    }

    return {
      success: true,
      message: response,
      data: {
        intent,
        workflow,
        actions: intent.suggestedActions,
      },
    };
  }

  /**
   * Analyze an error
   */
  private async handleErrorAnalysis(
    message: string,
    context: ConversationContext
  ): Promise<OrchestratorResponse> {
    // Extract error info from message
    const errorContext: ErrorContext = {
      errorMessage: message,
      timestamp: new Date().toISOString(),
    };

    // Use error solutions tool first
    const errorToolResult = await this.tools.execute('get_error_solutions', {
      errorMessage: message,
    });

    const prompt = `Error reportado: "${message}"

Información de herramientas: ${JSON.stringify(errorToolResult.data)}

Analizá el error y proporcioná un diagnóstico completo.`;

    try {
      const analysis = await this.llm.parseStructured<ErrorAnalysis>(
        prompt,
        SYSTEM_PROMPTS.errorAnalyzer,
        (text) => JSON.parse(text)
      );

      context.lastError = errorContext;

      // Generate user-friendly message
      const userMessage = `## Análisis del Error

**Resumen:** ${analysis.summary}

**Causa probable:** ${analysis.rootCause}

**Severidad:** ${analysis.severity}

### Soluciones sugeridas:
${analysis.suggestedFixes.map((f, i) => `${i + 1}. ${f.description}`).join('\n')}

### Tips de prevención:
${analysis.preventionTips.map((t) => `- ${t}`).join('\n')}`;

      return {
        success: true,
        message: userMessage,
        data: { errorAnalysis: analysis },
      };
    } catch {
      // Fallback to general chat
      return this.handleGeneralChat(message, context);
    }
  }

  /**
   * Handle query/explanation intents
   */
  private async handleQueryIntent(
    message: string,
    context: ConversationContext
  ): Promise<OrchestratorResponse> {
    const systemPrompt = `${SYSTEM_PROMPTS.general}

Conectores disponibles y sus capacidades:
${this.connectors.map((c) => `- ${c.name}: ${c.description} (${c.capabilities.join(', ')})`).join('\n')}

Respondé la consulta del usuario de forma clara y práctica.`;

    const { response, toolResults } = await this.llm.chatWithTools(
      context.messages,
      INTEGRATION_TOOLS,
      systemPrompt,
      async (toolName, input) => this.tools.execute(toolName, input)
    );

    return {
      success: true,
      message: response,
    };
  }

  /**
   * General chat fallback
   */
  private async handleGeneralChat(
    message: string,
    context: ConversationContext
  ): Promise<OrchestratorResponse> {
    const response = await this.llm.chat(context.messages, SYSTEM_PROMPTS.general);

    return {
      success: true,
      message: response,
    };
  }

  /**
   * Generate a workflow from natural language
   */
  async generateWorkflow(
    description: string,
    argentinaContext?: ArgentinaContext
  ): Promise<GeneratedWorkflow> {
    const contextInfo = argentinaContext
      ? `Contexto argentino:
- CUIT: ${argentinaContext.cuit || 'No especificado'}
- Condición IVA: ${argentinaContext.condicionIVA || 'No especificada'}
- Punto de Venta: ${argentinaContext.puntoVenta || 'No especificado'}`
      : '';

    const prompt = `Requerimiento: ${description}

${contextInfo}

Conectores disponibles:
${this.connectors
  .map(
    (c) => `- ${c.id} (${c.name}): ${c.actions.map((a) => a.id).join(', ')}`
  )
  .join('\n')}

Generá el workflow óptimo para este requerimiento.`;

    const workflow = await this.llm.parseStructured<GeneratedWorkflow>(
      prompt,
      SYSTEM_PROMPTS.workflowGenerator,
      (text) => JSON.parse(text)
    );

    // Validate the workflow
    const validation = await this.tools.execute('validate_workflow', {
      steps: workflow.steps,
    });

    if (!validation.success) {
      throw new Error(`Workflow inválido: ${JSON.stringify(validation.data)}`);
    }

    return workflow;
  }

  /**
   * Analyze an error and get solutions
   */
  async analyzeError(errorContext: ErrorContext): Promise<ErrorAnalysis> {
    const prompt = `Error a analizar:
- Mensaje: ${errorContext.errorMessage}
- Código: ${errorContext.errorCode || 'N/A'}
- Conector: ${errorContext.connectorId || 'N/A'}
- Acción: ${errorContext.actionId || 'N/A'}
- Datos de entrada: ${JSON.stringify(errorContext.inputData) || 'N/A'}
- Stack trace: ${errorContext.stackTrace || 'N/A'}

Proporcioná un análisis detallado.`;

    return this.llm.parseStructured<ErrorAnalysis>(
      prompt,
      SYSTEM_PROMPTS.errorAnalyzer,
      (text) => JSON.parse(text)
    );
  }

  /**
   * Clear conversation history
   */
  clearConversation(conversationId: string): void {
    this.conversations.delete(conversationId);
  }

  /**
   * Get available connectors
   */
  getConnectors(): ConnectorInfo[] {
    return this.connectors;
  }
}

// Factory function
export function createOrchestrator(config: OrchestratorConfig): Orchestrator {
  return new Orchestrator(config);
}
