export type { IntegrationEngine, FlowRun, FlowRunOutput, Flow, TriggerFlowInput, IdMapper } from './types.js';
export { IntegrationEngineError } from './errors.js';

import { ActivepiecesAdapter } from './activepieces/index.js';
import type { IntegrationEngine, IdMapper } from './types.js';

/**
 * Crea el engine configurado vía variables de entorno.
 * Lanza en startup si las variables no están presentes.
 *
 * Variables requeridas:
 *   INTEGRATION_ENGINE_URL      URL base del servidor
 *   INTEGRATION_ENGINE_API_KEY  API key
 *
 * @param idMapper  Mapper opcional de IDs internos → IDs del engine.
 *                  Por defecto es passthrough (tenantId = tenantRef, flowId = flowId del engine).
 */
export function createEngine(idMapper?: IdMapper): IntegrationEngine {
  const url = process.env.INTEGRATION_ENGINE_URL;
  const key = process.env.INTEGRATION_ENGINE_API_KEY;

  if (!url) throw new Error('INTEGRATION_ENGINE_URL is required');
  if (!key) throw new Error('INTEGRATION_ENGINE_API_KEY is required');

  return new ActivepiecesAdapter(url, key, idMapper);
}
