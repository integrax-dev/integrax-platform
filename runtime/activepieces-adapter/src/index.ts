// --- Interfaz RuntimeAdapter (quien llama depende de esto) ------------------
export type {
  RuntimeAdapter,
  CompiledFlowRef,
  ExecuteFlowInput,
  FlowExecutionResult,
  ExecutionStatus,
} from './runtime-adapter.js';

// --- Compilador -------------------------------------------------------------
export type { ActivepiecesFlowJSON } from './compile.js';
export { compileFlow } from './compile.js';

// --- Implementacion de Activepieces -----------------------------------------
export { ActivepiecesRuntimeAdapter } from './adapter.js';
