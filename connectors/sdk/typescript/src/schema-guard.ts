import { SchemaMismatchError } from './validation.js';

/**
 * Envuelve una acción de conector. Si lanza SchemaMismatchError,
 * llama a onMismatch en background (fire-and-forget) y re-lanza el error
 * para que el caller lo maneje normalmente (retry, DLQ, etc.).
 */
export async function withSchemaGuard<T>(
  action: () => Promise<T>,
  onMismatch: (err: SchemaMismatchError) => Promise<void>,
): Promise<T> {
  try {
    return await action();
  } catch (err) {
    if (err instanceof SchemaMismatchError) {
      void onMismatch(err).catch(() => {});
    }
    throw err;
  }
}
