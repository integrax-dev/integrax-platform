import type {
  MappingMemoryEntry,
  OntologyMatch,
  OntologyMatchContext,
  OntologyProvider,
} from './types.js';

function normalizeToken(value: string): string {
  if (/^[A-Z0-9_]+$/.test(value)) {
    return value.toLowerCase().replace(/__+/g, '_').replace(/^_|_$/g, '');
  }

  return value
    .replace(/([A-Z])/g, '_$1')
    .replace(/-/g, '_')
    .toLowerCase()
    .replace(/__+/g, '_')
    .replace(/^_|_$/g, '');
}

function normalizePath(path: string): string {
  return path
    .split('.')
    .filter(Boolean)
    .map(segment => normalizeToken(segment.replace(/\[\*\]/g, '')))
    .join('.');
}

function leaf(path: string): string {
  const parts = normalizePath(path).split('.');
  return parts[parts.length - 1] ?? '';
}

/** Umbral de rechazo: si ≥70% de las decisiones son rechazos con ≥3 muestras → excluir el par. */
export const REJECTION_VETO_RATIO = 0.70;
export const REJECTION_MIN_SAMPLES = 3;

function isVetoed(
  entry: MappingMemoryEntry,
  vetoRatio = REJECTION_VETO_RATIO,
  minSamples = REJECTION_MIN_SAMPLES,
): boolean {
  const total = entry.acceptedCount + entry.rejectedCount;
  if (total < minSamples) return false;
  return entry.rejectedCount / total >= vetoRatio;
}

function confidenceScore(entry: MappingMemoryEntry): number {
  const total = entry.acceptedCount + entry.rejectedCount;
  const acceptanceRatio = total === 0 ? 0 : entry.acceptedCount / total;
  // log10(10) === 1, dividir por eso es un no-op — se mantiene implícito por claridad.
  // Satura en 10 muestras: log10(11) ≈ 1.04, recortado a 1 por Math.min.
  const experienceBoost = Math.min(1, Math.log10(total + 1));
  return Math.max(
    0.55,
    // Los pesos suman 0.99 (no 1.0) intencionalmente — el score nunca puede llegar a 1.0,
    // preservando un margen que indica "validado por humano pero aún probabilístico".
    Math.min(0.99, entry.averageConfidence * 0.60 + acceptanceRatio * 0.25 + experienceBoost * 0.14),
  );
}

/**
 * Registra el feedback del operador sobre un par de campos y devuelve el array
 * actualizado de entradas de memoria. El llamador es responsable de persistir el resultado.
 *
 * Si el par ya existe (mismo sourcePath + targetPath + conectores), actualiza los contadores.
 * Si no existe, crea una nueva entrada.
 */
export function updateMemoryEntry(
  entries: MappingMemoryEntry[],
  sourcePath: string,
  targetPath: string,
  accepted: boolean,
  confidence: number,
  connectorAId?: string,
  connectorBId?: string,
): MappingMemoryEntry[] {
  const srcNorm = normalizePath(sourcePath);
  const tgtNorm = normalizePath(targetPath);

  const existing = entries.find(e =>
    normalizePath(e.sourcePath) === srcNorm &&
    normalizePath(e.targetPath) === tgtNorm &&
    e.connectorAId === connectorAId &&
    e.connectorBId === connectorBId,
  );

  if (existing) {
    const prevTotal = existing.acceptedCount + existing.rejectedCount;
    const updated: MappingMemoryEntry = {
      ...existing,
      acceptedCount: existing.acceptedCount + (accepted ? 1 : 0),
      rejectedCount: existing.rejectedCount + (accepted ? 0 : 1),
      // Media ponderada acumulada: preserva el historial completo.
      averageConfidence: (existing.averageConfidence * prevTotal + confidence) / (prevTotal + 1),
      lastAcceptedAt: accepted ? new Date().toISOString() : existing.lastAcceptedAt,
    };
    return entries.map(e => (e === existing ? updated : e));
  }

  const newEntry: MappingMemoryEntry = {
    sourcePath,
    targetPath,
    connectorAId,
    connectorBId,
    acceptedCount: accepted ? 1 : 0,
    rejectedCount: accepted ? 0 : 1,
    averageConfidence: confidence,
    lastAcceptedAt: accepted ? new Date().toISOString() : undefined,
  };
  return [...entries, newEntry];
}

/** Mínimo de aceptaciones explícitas para que la memoria tenga autoridad de auto-accept.
 *  Por debajo de este umbral la señal contribuye a otros canales pero no puede
 *  disparar la Regla 0 (ontology ≥ 0.85) por sí sola. Default: 3.
 *
 *  Por qué 3 y no 1:
 *    Con 1-2 aceptaciones el score calculado por confidenceScore() ya supera 0.85
 *    (≈ 0.857 con 2 muestras). Esto significa que un solo operador aceptando dos
 *    veces un mapping incorrecto auto-aceptaría ese mismo error en el futuro.
 *    Con 3 aceptaciones hay corroboración mínima y el score llega a ≈ 0.87.
 */
export const MIN_FEEDBACK_FOR_AUTO_ACCEPT = 3;

export interface MappingMemoryProviderOptions {
  /** Custom provider ID (default: 'mapping-memory') */
  providerId?: string;
  /**
   * Ratio de rechazos necesaria para vetar un par (default: REJECTION_VETO_RATIO = 0.70).
   * Un par con rejectedCount/total ≥ este valor se excluye si también supera minSamples.
   */
  rejectionVetoRatio?: number;
  /**
   * Muestras mínimas necesarias para activar el veto por rechazo (default: REJECTION_MIN_SAMPLES = 3).
   */
  rejectionMinSamples?: number;
  /**
   * Mínimo de aceptaciones explícitas para que la memoria tenga autoridad de auto-accept.
   * Si acceptedCount < este valor, el score se recorta a 0.82 para que no dispare
   * la Regla 0 del SimilarityDecisionPolicy (requiere ontology ≥ 0.85).
   * Default: MIN_FEEDBACK_FOR_AUTO_ACCEPT = 3.
   */
  minFeedbackForAutoAccept?: number;
}

export function createMappingMemoryOntologyProvider(
  entries: MappingMemoryEntry[],
  options: MappingMemoryProviderOptions = {},
): OntologyProvider {
  const providerId = options.providerId ?? 'mapping-memory';
  const vetoRatio = options.rejectionVetoRatio ?? REJECTION_VETO_RATIO;
  const minSamples = options.rejectionMinSamples ?? REJECTION_MIN_SAMPLES;
  const minFeedback = options.minFeedbackForAutoAccept ?? MIN_FEEDBACK_FOR_AUTO_ACCEPT;

  const byPathPair = new Map<string, MappingMemoryEntry>();
  const byLeafPair = new Map<string, MappingMemoryEntry>();

  for (const entry of entries) {
    const sourcePath = normalizePath(entry.sourcePath);
    const targetPath = normalizePath(entry.targetPath);
    const sourceLeaf = leaf(sourcePath);
    const targetLeaf = leaf(targetPath);

    byPathPair.set(`${sourcePath}=>${targetPath}`, entry);

    // En colisión de leaf, conservar la entrada con más feedback total (más experiencia).
    const leafKey = `${sourceLeaf}=>${targetLeaf}`;
    const existing = byLeafPair.get(leafKey);
    const entryTotal = entry.acceptedCount + entry.rejectedCount;
    const existingTotal = existing ? existing.acceptedCount + existing.rejectedCount : -1;
    if (!existing || entryTotal > existingTotal) {
      byLeafPair.set(leafKey, entry);
    }
  }

  return {
    id: providerId,
    match(context: OntologyMatchContext): OntologyMatch | null {
      const sourcePath = normalizePath(context.pathA);
      const targetPath = normalizePath(context.pathB);
      const directEntry = byPathPair.get(`${sourcePath}=>${targetPath}`);
      if (directEntry) {
        if (isVetoed(directEntry, vetoRatio, minSamples)) return null;
        const rawScore = confidenceScore(directEntry);
        // Recortar a 0.82 si no hay suficiente feedback para autoridad de auto-accept.
        // La Regla 0 requiere ontology ≥ 0.85 — por debajo del umbral la señal
        // contribuye a otras reglas pero no puede auto-aceptar sola.
        const score = directEntry.acceptedCount >= minFeedback ? rawScore : Math.min(rawScore, 0.82);
        return {
          score,
          label: directEntry.acceptedCount >= minFeedback ? 'mapping_memory_path' : 'mapping_memory_path_provisional',
          reason: `Historical mapping memory for ${sourcePath} -> ${targetPath} (${directEntry.acceptedCount} accepted, ${directEntry.rejectedCount} rejected).`,
        };
      }

      const leafEntry = byLeafPair.get(`${leaf(sourcePath)}=>${leaf(targetPath)}`);
      if (!leafEntry || isVetoed(leafEntry, vetoRatio, minSamples)) return null;

      const rawLeafScore = Math.max(0.82, confidenceScore(leafEntry) - 0.08);
      const leafScore = leafEntry.acceptedCount >= minFeedback ? rawLeafScore : Math.min(rawLeafScore, 0.82);
      return {
        score: leafScore,
        label: leafEntry.acceptedCount >= minFeedback ? 'mapping_memory_leaf' : 'mapping_memory_leaf_provisional',
        reason: `Historical leaf mapping memory for ${leaf(sourcePath)} -> ${leaf(targetPath)} (${leafEntry.acceptedCount} accepted).`,
      };
    },
  };
}
