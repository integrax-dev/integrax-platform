/**
 * Integration Tools
 *
 * Herramientas que el LLM puede usar para ejecutar acciones
 */

import type { ToolDefinition, ToolResult, ConnectorInfo } from './types';

// ==================== Tool Definitions ====================

export const INTEGRATION_TOOLS: ToolDefinition[] = [
  {
    name: 'search_connectors',
    description: 'Busca conectores disponibles por nombre, categoría o capacidad',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Texto de búsqueda (nombre, categoría, o capacidad)',
        },
        category: {
          type: 'string',
          enum: ['payment', 'erp', 'messaging', 'spreadsheet', 'invoicing', 'other'],
          description: 'Filtrar por categoría',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_connector_actions',
    description: 'Obtiene las acciones disponibles de un conector específico',
    input_schema: {
      type: 'object',
      properties: {
        connectorId: {
          type: 'string',
          description: 'ID del conector (ej: mercadopago, contabilium, whatsapp)',
        },
      },
      required: ['connectorId'],
    },
  },
  {
    name: 'validate_workflow',
    description: 'Valida que un workflow sea correcto y ejecutable',
    input_schema: {
      type: 'object',
      properties: {
        steps: {
          type: 'array',
          description: 'Pasos del workflow a validar',
          items: {
            type: 'object',
            properties: {
              connectorId: { type: 'string' },
              actionId: { type: 'string' },
              parameters: { type: 'object' },
            },
          },
        },
      },
      required: ['steps'],
    },
  },
  {
    name: 'get_afip_comprobante_types',
    description: 'Obtiene los tipos de comprobante AFIP disponibles según condición IVA',
    input_schema: {
      type: 'object',
      properties: {
        condicionIVA: {
          type: 'string',
          enum: ['responsable_inscripto', 'monotributo', 'exento', 'consumidor_final'],
          description: 'Condición frente al IVA del emisor',
        },
        receptorCondicionIVA: {
          type: 'string',
          enum: ['responsable_inscripto', 'monotributo', 'exento', 'consumidor_final'],
          description: 'Condición frente al IVA del receptor',
        },
      },
      required: ['condicionIVA'],
    },
  },
  {
    name: 'calculate_iva',
    description: 'Calcula el IVA para un monto dado',
    input_schema: {
      type: 'object',
      properties: {
        monto: {
          type: 'number',
          description: 'Monto neto (sin IVA)',
        },
        alicuota: {
          type: 'number',
          enum: [0, 2.5, 5, 10.5, 21, 27],
          description: 'Alícuota de IVA (%)',
        },
      },
      required: ['monto', 'alicuota'],
    },
  },
  {
    name: 'format_cuit',
    description: 'Formatea un CUIT/CUIL argentino',
    input_schema: {
      type: 'object',
      properties: {
        cuit: {
          type: 'string',
          description: 'CUIT/CUIL a formatear',
        },
      },
      required: ['cuit'],
    },
  },
  {
    name: 'format_phone_argentina',
    description: 'Formatea un teléfono argentino al formato WhatsApp',
    input_schema: {
      type: 'object',
      properties: {
        phone: {
          type: 'string',
          description: 'Número de teléfono',
        },
      },
      required: ['phone'],
    },
  },
  {
    name: 'get_error_solutions',
    description: 'Obtiene soluciones para errores comunes de integración',
    input_schema: {
      type: 'object',
      properties: {
        errorCode: {
          type: 'string',
          description: 'Código de error',
        },
        connectorId: {
          type: 'string',
          description: 'ID del conector donde ocurrió el error',
        },
        errorMessage: {
          type: 'string',
          description: 'Mensaje de error',
        },
      },
      required: ['errorMessage'],
    },
  },
];

// ==================== Tool Executor ====================

export class ToolExecutor {
  private connectors: ConnectorInfo[];

  constructor(connectors: ConnectorInfo[]) {
    this.connectors = connectors;
  }

  async execute(toolName: string, input: Record<string, unknown>): Promise<ToolResult> {
    try {
      switch (toolName) {
        case 'search_connectors':
          return this.searchConnectors(input.query as string, input.category as string | undefined);

        case 'get_connector_actions':
          return this.getConnectorActions(input.connectorId as string);

        case 'validate_workflow':
          return this.validateWorkflow(input.steps as Array<Record<string, unknown>>);

        case 'get_afip_comprobante_types':
          return this.getAfipComprobanteTypes(
            input.condicionIVA as string,
            input.receptorCondicionIVA as string | undefined
          );

        case 'calculate_iva':
          return this.calculateIva(input.monto as number, input.alicuota as number);

        case 'format_cuit':
          return this.formatCuit(input.cuit as string);

        case 'format_phone_argentina':
          return this.formatPhoneArgentina(input.phone as string);

        case 'get_error_solutions':
          return this.getErrorSolutions(
            input.errorMessage as string,
            input.errorCode as string | undefined,
            input.connectorId as string | undefined
          );

        default:
          return { success: false, error: `Unknown tool: ${toolName}` };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private searchConnectors(query: string, category?: string): ToolResult {
    const lowerQuery = query.toLowerCase();

    let results = this.connectors.filter((c) => {
      const matchesQuery =
        c.name.toLowerCase().includes(lowerQuery) ||
        c.description.toLowerCase().includes(lowerQuery) ||
        c.capabilities.some((cap) => cap.toLowerCase().includes(lowerQuery));

      const matchesCategory = !category || c.category === category;

      return matchesQuery && matchesCategory;
    });

    return {
      success: true,
      data: results.map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        category: c.category,
        capabilities: c.capabilities,
      })),
    };
  }

  private getConnectorActions(connectorId: string): ToolResult {
    const connector = this.connectors.find((c) => c.id === connectorId);

    if (!connector) {
      return { success: false, error: `Connector not found: ${connectorId}` };
    }

    return {
      success: true,
      data: {
        connector: connector.name,
        actions: connector.actions,
      },
    };
  }

  private validateWorkflow(steps: Array<Record<string, unknown>>): ToolResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const connectorId = step.connectorId as string;
      const actionId = step.actionId as string;

      // Check if connector exists
      const connector = this.connectors.find((c) => c.id === connectorId);
      if (!connector) {
        errors.push(`Step ${i + 1}: Connector "${connectorId}" not found`);
        continue;
      }

      // Check if action exists
      const action = connector.actions.find((a) => a.id === actionId);
      if (!action) {
        errors.push(`Step ${i + 1}: Action "${actionId}" not found in ${connector.name}`);
        continue;
      }

      // Check required parameters
      const inputSchema = action.inputSchema as { required?: string[] };
      if (inputSchema.required) {
        const params = step.parameters as Record<string, unknown>;
        for (const required of inputSchema.required) {
          if (!params || params[required] === undefined) {
            errors.push(`Step ${i + 1}: Missing required parameter "${required}"`);
          }
        }
      }
    }

    return {
      success: errors.length === 0,
      data: {
        valid: errors.length === 0,
        errors,
        warnings,
        stepCount: steps.length,
      },
    };
  }

  private getAfipComprobanteTypes(condicionIVA: string, receptorCondicionIVA?: string): ToolResult {
    // Tipos de comprobante según condición IVA
    const tiposComprobante: Record<string, Record<string, string[]>> = {
      responsable_inscripto: {
        responsable_inscripto: ['Factura A', 'Nota de Crédito A', 'Nota de Débito A'],
        monotributo: ['Factura A', 'Nota de Crédito A', 'Nota de Débito A'],
        exento: ['Factura A', 'Nota de Crédito A', 'Nota de Débito A'],
        consumidor_final: ['Factura B', 'Nota de Crédito B', 'Nota de Débito B'],
      },
      monotributo: {
        responsable_inscripto: ['Factura C', 'Nota de Crédito C', 'Nota de Débito C'],
        monotributo: ['Factura C', 'Nota de Crédito C', 'Nota de Débito C'],
        exento: ['Factura C', 'Nota de Crédito C', 'Nota de Débito C'],
        consumidor_final: ['Factura C', 'Nota de Crédito C', 'Nota de Débito C'],
      },
      exento: {
        responsable_inscripto: ['Factura C', 'Nota de Crédito C', 'Nota de Débito C'],
        monotributo: ['Factura C', 'Nota de Crédito C', 'Nota de Débito C'],
        exento: ['Factura C', 'Nota de Crédito C', 'Nota de Débito C'],
        consumidor_final: ['Factura C', 'Nota de Crédito C', 'Nota de Débito C'],
      },
    };

    const emisorTipos = tiposComprobante[condicionIVA];
    if (!emisorTipos) {
      return { success: false, error: `Condición IVA no válida: ${condicionIVA}` };
    }

    if (receptorCondicionIVA) {
      const tipos = emisorTipos[receptorCondicionIVA];
      if (!tipos) {
        return { success: false, error: `Condición IVA receptor no válida: ${receptorCondicionIVA}` };
      }
      return { success: true, data: { tipos, emisor: condicionIVA, receptor: receptorCondicionIVA } };
    }

    return { success: true, data: { tiposPorReceptor: emisorTipos, emisor: condicionIVA } };
  }

  private calculateIva(monto: number, alicuota: number): ToolResult {
    const iva = monto * (alicuota / 100);
    const total = monto + iva;

    return {
      success: true,
      data: {
        neto: monto,
        alicuota: alicuota,
        iva: Number(iva.toFixed(2)),
        total: Number(total.toFixed(2)),
      },
    };
  }

  private formatCuit(cuit: string): ToolResult {
    const clean = cuit.replace(/\D/g, '');

    if (clean.length !== 11) {
      return { success: false, error: 'CUIT debe tener 11 dígitos' };
    }

    const formatted = `${clean.slice(0, 2)}-${clean.slice(2, 10)}-${clean.slice(10)}`;

    return {
      success: true,
      data: {
        original: cuit,
        formatted,
        digits: clean,
      },
    };
  }

  private formatPhoneArgentina(phone: string): ToolResult {
    let digits = phone.replace(/\D/g, '');

    // Remove leading 0
    if (digits.startsWith('0')) {
      digits = digits.substring(1);
    }

    // Remove 15 for mobile
    if (digits.length === 10 && digits.substring(2, 4) === '15') {
      digits = digits.substring(0, 2) + digits.substring(4);
    }

    // Add country code if not present
    if (!digits.startsWith('54')) {
      digits = '54' + digits;
    }

    // Add 9 for mobile if not present
    if (digits.startsWith('54') && !digits.startsWith('549')) {
      digits = '549' + digits.substring(2);
    }

    return {
      success: true,
      data: {
        original: phone,
        whatsapp: digits,
      },
    };
  }

  private getErrorSolutions(
    errorMessage: string,
    errorCode?: string,
    connectorId?: string
  ): ToolResult {
    // Error patterns and solutions
    const errorPatterns = [
      {
        pattern: /authentication|unauthorized|401|invalid.*token/i,
        category: 'authentication',
        solutions: [
          'Verificar que el token de acceso sea válido y no haya expirado',
          'Regenerar las credenciales de la API',
          'Verificar que el scope del token incluya los permisos necesarios',
        ],
      },
      {
        pattern: /rate.*limit|429|too many requests/i,
        category: 'rate_limit',
        solutions: [
          'Implementar exponential backoff en los reintentos',
          'Reducir la frecuencia de las solicitudes',
          'Considerar usar un plan con mayores límites',
        ],
      },
      {
        pattern: /cae|afip|wsfe|10016|10017/i,
        category: 'afip',
        solutions: [
          'Verificar que el CUIT sea válido y esté correctamente formateado',
          'Verificar que el punto de venta esté habilitado',
          'Verificar que el certificado digital no haya expirado',
          'Verificar que los montos sean correctos (neto + IVA = total)',
        ],
      },
      {
        pattern: /connection|timeout|network|ECONNREFUSED/i,
        category: 'network',
        solutions: [
          'Verificar la conectividad de red',
          'Verificar que el servicio de destino esté disponible',
          'Aumentar el timeout de la conexión',
          'Implementar reintentos con backoff',
        ],
      },
      {
        pattern: /validation|invalid|required|missing/i,
        category: 'validation',
        solutions: [
          'Revisar que todos los campos requeridos estén presentes',
          'Verificar el formato de los datos (fechas, números, etc.)',
          'Consultar la documentación del conector para ver los formatos válidos',
        ],
      },
    ];

    const lowerMessage = errorMessage.toLowerCase();
    let matchedPattern = errorPatterns.find((p) => p.pattern.test(errorMessage));

    if (!matchedPattern) {
      matchedPattern = {
        pattern: /.*/,
        category: 'unknown',
        solutions: [
          'Revisar los logs para más detalles',
          'Consultar la documentación del conector',
          'Contactar al soporte técnico si el problema persiste',
        ],
      };
    }

    return {
      success: true,
      data: {
        category: matchedPattern.category,
        solutions: matchedPattern.solutions,
        connectorId,
        errorCode,
        tip:
          connectorId === 'afip-wsfe'
            ? 'Para errores de AFIP, verificar en https://www.afip.gob.ar/ws/'
            : undefined,
      },
    };
  }
}

// Factory
export function createToolExecutor(connectors: ConnectorInfo[]): ToolExecutor {
  return new ToolExecutor(connectors);
}
