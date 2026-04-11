import type { ExternalId } from '@integrax/entities';
import type {
  AliasEntry,
  ResolvedIdentity,
} from './types.js';

// --- Jaro-Winkler ------------------------------------------------------------

/**
 * Jaro similarity between two strings (0..1).
 */
function jaro(s1: string, s2: string): number {
  if (s1 === s2) return 1;
  const len1 = s1.length;
  const len2 = s2.length;
  if (len1 === 0 || len2 === 0) return 0;

  const matchDist = Math.floor(Math.max(len1, len2) / 2) - 1;
  const matched1 = new Array<boolean>(len1).fill(false);
  const matched2 = new Array<boolean>(len2).fill(false);

  let matches = 0;
  let transpositions = 0;

  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - matchDist);
    const end = Math.min(i + matchDist + 1, len2);
    for (let j = start; j < end; j++) {
      if (matched2[j] || s1[i] !== s2[j]) continue;
      matched1[i] = true;
      matched2[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0;

  let k = 0;
  for (let i = 0; i < len1; i++) {
    if (!matched1[i]) continue;
    while (!matched2[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }

  return (matches / len1 + matches / len2 + (matches - transpositions / 2) / matches) / 3;
}

/**
 * Jaro-Winkler similarity (0..1). Rewards common prefix up to 4 chars.
 */
export function jaroWinkler(s1: string, s2: string): number {
  const j = jaro(s1, s2);
  const prefixLen = Math.min(
    4,
    [...s1].findIndex((c, i) => c !== s2[i]) === -1
      ? Math.min(s1.length, s2.length)
      : [...s1].findIndex((c, i) => c !== s2[i]),
  );
  return j + prefixLen * 0.1 * (1 - j);
}

/**
 * Fields checked during fuzzy resolution, in priority order.
 * Keys must exist as top-level properties on the entity payload.
 */
const FUZZY_FIELDS = ['taxId', 'email', 'name', 'title', 'sku', 'invoiceNumber'] as const;

// --- Resolver ----------------------------------------------------------------

/**
 * Resolucion de identidad entre conectores.
 *
 * Mantiene en memoria un registro de alias que mapea IDs externos
 * (pares system + id) a IDs canonicos estables. La persistencia queda del
 * lado de quien lo usa; por eso se pueden inyectar alias precargados con
 * `loadAliases()` al arrancar.
 *
 * Estrategia de resolucion:
 *  1. Match exacto por external ID -> 'exact', confianza 1.0
 *  2. Match difuso por campos del payload (Jaro-Winkler) -> 'fuzzy'
 *  3. Match manual: quien llama registra explicitamente un link via `registerAlias`
 */
export class IdentityResolver {
  private readonly aliases: Map<string, AliasEntry> = new Map();
  // clave = "system:externalId" -> canonicalId
  private readonly externalIndex: Map<string, string> = new Map();
  /** Confianza minima para matches difusos. Reservado para una implementacion futura. */
  readonly fuzzyThreshold: number;

  constructor(fuzzyThreshold = 0.8) {
    this.fuzzyThreshold = fuzzyThreshold;
  }

  // --- Gestion de alias -----------------------------------------------------

  /**
   * Registra o actualiza un mapeo canonical -> external ID.
   * Si el canonical ID ya existe, se agrega el nuevo externalId.
   */
  registerAlias(canonicalId: string, system: string, externalId: string): void {
    const key = this.externalKey(system, externalId);
    this.externalIndex.set(key, canonicalId);

    const existing = this.aliases.get(canonicalId);
    if (existing) {
      const already = existing.externalIds.some(e => e.system === system && e.id === externalId);
      if (!already) existing.externalIds.push({ system, id: externalId });
    } else {
      this.aliases.set(canonicalId, {
        canonicalId,
        externalIds: [{ system, id: externalId }],
        registeredAt: new Date(),
      });
    }
  }

  /** Carga alias en lote, por ejemplo desde base de datos al iniciar. */
  loadAliases(entries: AliasEntry[]): void {
    for (const entry of entries) {
      this.aliases.set(entry.canonicalId, entry);
      for (const ext of entry.externalIds) {
        this.externalIndex.set(this.externalKey(ext.system, ext.id), entry.canonicalId);
      }
    }
  }

  /** Devuelve todos los alias de un canonical ID dado. */
  getAliases(canonicalId: string): AliasEntry | undefined {
    return this.aliases.get(canonicalId);
  }

  // --- Resolucion -----------------------------------------------------------

  /**
   * Resuelve uno o varios external IDs a una identidad canonica.
   *
   * Estrategia:
   *  1. Match exacto por `system:externalId` en el indice -> confianza 1.0
   *  2. Match difuso: compara campos del payload contra payloads guardados
   *     usando Jaro-Winkler. Retorna el mejor candidato si supera `fuzzyThreshold`.
   *
   * Devuelve null si ninguna estrategia produce un match.
   */
  resolve(
    externalIds: ExternalId[],
    payload?: Record<string, unknown>,
  ): ResolvedIdentity | null {
    // 1. Match exacto
    for (const ext of externalIds) {
      const key = this.externalKey(ext.system, ext.id);
      const canonicalId = this.externalIndex.get(key);
      if (canonicalId) {
        return {
          canonicalId,
          candidates: [{
            system: ext.system,
            externalId: ext.id,
            confidence: 1.0,
            reason: 'exact_external_id',
          }],
          strategy: 'exact',
        };
      }
    }

    // 2. Match difuso por campos del payload
    if (payload) {
      const fuzzy = this.resolveFuzzy(payload);
      if (fuzzy) return fuzzy;
    }

    return null;
  }

  /**
   * Resuelve o crea: si no hay match, genera un canonical ID nuevo y lo registra.
   *
   * @param generateId Funcion que devuelve un canonical ID nuevo (por ejemplo ulid()).
   */
  resolveOrCreate(
    externalIds: ExternalId[],
    generateId: () => string,
    payload?: Record<string, unknown>,
  ): ResolvedIdentity {
    const existing = this.resolve(externalIds, payload);
    if (existing) return existing;

    const canonicalId = generateId();
    for (const ext of externalIds) {
      this.registerAlias(canonicalId, ext.system, ext.id);
    }
    // Store payload for future fuzzy matching
    if (payload) {
      const entry = this.aliases.get(canonicalId);
      if (entry) entry.payload = payload;
    }
    return {
      canonicalId,
      candidates: externalIds.map(ext => ({
        system: ext.system,
        externalId: ext.id,
        confidence: 1.0,
        reason: 'new_registration',
      })),
      strategy: 'exact',
    };
  }

  // --- Interno --------------------------------------------------------------

  /**
   * Busca entre todos los alias registrados el que tenga mayor similitud
   * Jaro-Winkler con los campos del payload entrante.
   * Solo considera el primer campo de identidad no-nulo de FUZZY_FIELDS.
   */
  private resolveFuzzy(payload: Record<string, unknown>): ResolvedIdentity | null {
    let bestCanonicalId: string | null = null;
    let bestScore = 0;
    let bestField = '';

    for (const field of FUZZY_FIELDS) {
      const incoming = payload[field];
      if (incoming == null) continue;
      const incomingStr = String(incoming).toLowerCase().trim();
      if (!incomingStr) continue;

      for (const [canonicalId, entry] of this.aliases) {
        if (!entry.payload) continue;
        const stored = entry.payload[field];
        if (stored == null) continue;
        const storedStr = String(stored).toLowerCase().trim();
        if (!storedStr) continue;

        const score = jaroWinkler(incomingStr, storedStr);
        if (score > bestScore) {
          bestScore = score;
          bestCanonicalId = canonicalId;
          bestField = field;
        }
      }
      // Stop at the first field that produced any candidate
      if (bestCanonicalId) break;
    }

    if (bestCanonicalId && bestScore >= this.fuzzyThreshold) {
      return {
        canonicalId: bestCanonicalId,
        candidates: [{
          system: 'fuzzy',
          externalId: bestCanonicalId,
          confidence: bestScore,
          reason: `fuzzy_${bestField}`,
        }],
        strategy: 'fuzzy',
      };
    }

    return null;
  }

  private externalKey(system: string, id: string): string {
    return `${system}:${id}`;
  }
}
