import type { ExternalId } from '@integrax/entities';

export type IdentityStrategy = 'exact' | 'fuzzy' | 'manual';

export interface IdentityCandidate {
  system: string;
  externalId: string;
  confidence: number;
  reason: string;
}

export interface ResolvedIdentity {
  /** ID canonico estable (ulid), generado en la primera resolucion. */
  canonicalId: string;
  candidates: IdentityCandidate[];
  strategy: IdentityStrategy;
}

export interface AliasEntry {
  canonicalId: string;
  externalIds: ExternalId[];
  registeredAt: Date;
  /** Payload guardado para comparacion difusa. Opcional — se omite si no se pasa. */
  payload?: Record<string, unknown>;
}
