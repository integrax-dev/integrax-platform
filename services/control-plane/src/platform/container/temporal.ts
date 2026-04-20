/**
 * Temporal client singleton
 *
 * Single shared lazy connection for the entire control-plane.
 * Routes import getTemporalClient() from here — never instantiate TemporalClientService directly.
 *
 * Returns null gracefully when TEMPORAL_ADDRESS is not set, so the service
 * boots without Temporal and routes can return a clean 503.
 */

import { TemporalClientService } from '@integrax/temporal-workflows';

let _promise: Promise<TemporalClientService | null> | null = null;

export function getTemporalClient(): Promise<TemporalClientService | null> {
  if (!process.env.TEMPORAL_ADDRESS) return Promise.resolve(null);
  if (!_promise) {
    _promise = (async () => {
      const c = new TemporalClientService();
      await c.connect();
      return c;
    })().catch(() => {
      _promise = null; // allow retry on next request
      return null;
    });
  }
  return _promise;
}
