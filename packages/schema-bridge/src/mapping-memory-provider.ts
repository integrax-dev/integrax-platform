import type {
  ChannelMultipliers,
  MappingMemoryEntry,
  OntologyMatch,
  OntologyMatchContext,
  OntologyProvider,
  SignalChannel,
  SimilarityEvidenceBreakdown,
} from './types.js';

const ALL_CHANNELS: SignalChannel[] = ['lexical', 'value', 'structural', 'businessType', 'ontology'];

export const DEFAULT_CHANNEL_MULTIPLIERS: ChannelMultipliers = {
  lexical: 1.0,
  value: 1.0,
  structural: 1.0,
  businessType: 1.0,
  ontology: 1.0,
};

function dominantChannel(breakdown: SimilarityEvidenceBreakdown): SignalChannel {
  let best: SignalChannel = 'lexical';
  let bestScore = breakdown.lexical;
  const candidates: [SignalChannel, number][] = [
    ['value', breakdown.value],
    ['structural', breakdown.structural],
    ['businessType', breakdown.businessType],
    ['ontology', breakdown.ontology],
  ];
  for (const [ch, score] of candidates) {
    if (score > bestScore) { best = ch; bestScore = score; }
  }
  return best;
}

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

/**
 * Mínimo de feedbacks totales (accepted + rejected) para que la memoria emita señal.
 * Con 1 solo feedback el score puede verse inflado por el experienceBoost y por una
 * averageConfidence arbitraria. Por debajo de este umbral el provider devuelve null
 * — como si la entrada no existiera — para no contaminar el scoring con ruido.
 * Default: 2.
 */
export const MIN_ACTIVATION_SAMPLES = 2;

/**
 * Máximo de penalización por rechazo sobre el score base de aceptaciones.
 * Evita que un solo rechazo (operator error, dato raro) baje drásticamente el score.
 * Requiere al menos MIN_REJECTION_WEIGHT_SAMPLES rechazos para aplicar penalización completa.
 * Default: 0.15 (15 puntos porcentuales máximo con 1 solo reject).
 */
export const REJECTION_CONTAMINATION_CAP = 0.15;
export const MIN_REJECTION_WEIGHT_SAMPLES = 2;

function isVetoed(
  entry: MappingMemoryEntry,
  vetoRatio = REJECTION_VETO_RATIO,
  minSamples = REJECTION_MIN_SAMPLES,
): boolean {
  const total = entry.acceptedCount + entry.rejectedCount;
  if (total < minSamples) return false;
  return entry.rejectedCount / total >= vetoRatio;
}

function confidenceScore(
  entry: MappingMemoryEntry,
  contaminationCap = REJECTION_CONTAMINATION_CAP,
  minRejectionSamples = MIN_REJECTION_WEIGHT_SAMPLES,
): number {
  const total = entry.acceptedCount + entry.rejectedCount;
  const acceptanceRatio = total === 0 ? 0 : entry.acceptedCount / total;
  // log10(10) === 1, dividir por eso es un no-op — se mantiene implícito por claridad.
  // Satura en 10 muestras: log10(11) ≈ 1.04, recortado a 1 por Math.min.
  const experienceBoost = Math.min(1, Math.log10(total + 1));

  const rawScore = Math.min(
    0.99,
    // Los pesos suman 0.99 (no 1.0) intencionalmente — el score nunca puede llegar a 1.0,
    // preservando un margen que indica "validado por humano pero aún probabilístico".
    entry.averageConfidence * 0.60 + acceptanceRatio * 0.25 + experienceBoost * 0.14,
  );

  // Contamination cap: un único rechazo no puede penalizar más de contaminationCap puntos.
  // Con 1 solo reject el ratio acceptance cae a 0.5 (50%), lo que podría bajar el score
  // drásticamente aunque todos los demás indicadores sean fuertes. Limitamos la caída
  // hasta que haya al menos minRejectionSamples rechazos que confirmen el patrón negativo.
  const scoreSinReject = Math.min(
    0.99,
    entry.averageConfidence * 0.60 + 1.0 * 0.25 + experienceBoost * 0.14,
  );
  const needsCap = entry.rejectedCount > 0 && entry.rejectedCount < minRejectionSamples;
  const cappedScore = needsCap
    ? Math.max(rawScore, scoreSinReject - contaminationCap)
    : rawScore;

  return Math.max(0.55, cappedScore);
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
  breakdown?: SimilarityEvidenceBreakdown,
): MappingMemoryEntry[] {
  const srcNorm = normalizePath(sourcePath);
  const tgtNorm = normalizePath(targetPath);

  const existing = entries.find(e =>
    normalizePath(e.sourcePath) === srcNorm &&
    normalizePath(e.targetPath) === tgtNorm &&
    e.connectorAId === connectorAId &&
    e.connectorBId === connectorBId,
  );

  // Cuando se acepta un mapping con breakdown disponible, registrar el canal dominante.
  const updatedChannelHits = (existing: MappingMemoryEntry | undefined): Partial<Record<SignalChannel, number>> | undefined => {
    if (!accepted || !breakdown) return existing?.channelHits;
    const ch = dominantChannel(breakdown);
    const prev = existing?.channelHits ?? {};
    return { ...prev, [ch]: (prev[ch] ?? 0) + 1 };
  };

  if (existing) {
    const prevTotal = existing.acceptedCount + existing.rejectedCount;
    const updated: MappingMemoryEntry = {
      ...existing,
      acceptedCount: existing.acceptedCount + (accepted ? 1 : 0),
      rejectedCount: existing.rejectedCount + (accepted ? 0 : 1),
      // Media ponderada acumulada: preserva el historial completo.
      averageConfidence: (existing.averageConfidence * prevTotal + confidence) / (prevTotal + 1),
      lastAcceptedAt: accepted ? new Date().toISOString() : existing.lastAcceptedAt,
      channelHits: updatedChannelHits(existing),
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
    channelHits: updatedChannelHits(undefined),
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

/**
 * Número mínimo de channel hits totales para derivar multiplicadores adaptativos.
 * Por debajo de este umbral se devuelven los multiplicadores por defecto (1.0 en todos).
 * Evita que 1-2 aceptaciones sesguen los pesos hacia un canal particular.
 * Default: 5.
 */
export const MIN_HITS_FOR_CHANNEL_WEIGHTS = 5;

/** Vida media del decay de confianza histórica en días. Default: 90. */
export const DECAY_HALF_LIFE_DAYS = 90;

/**
 * Factor de decay temporal basado en `lastAcceptedAt`.
 * decayFactor = 0.5 ^ (ageDays / halfLifeDays)
 * Sin timestamp → 1.0 (neutro, no penaliza datos legacy).
 */
export function computeDecayFactor(
  lastAcceptedAt: string | undefined,
  now = Date.now(),
  halfLifeDays = DECAY_HALF_LIFE_DAYS,
): number {
  if (!lastAcceptedAt) return 1.0;
  const ageMs = now - new Date(lastAcceptedAt).getTime();
  if (ageMs <= 0) return 1.0;
  return Math.pow(0.5, (ageMs / (1000 * 60 * 60 * 24)) / halfLifeDays);
}

/**
 * Deriva multiplicadores por canal desde el historial de feedback.
 * Aplica decay exponencial (half-life 90 días) para que feedback reciente pese más.
 * Filtra opcionalmente por par de conectores para no mezclar dominios.
 */
export function computeSignalWeights(
  entries: MappingMemoryEntry[],
  connectorAId?: string,
  connectorBId?: string,
  minHits = MIN_HITS_FOR_CHANNEL_WEIGHTS,
  now = Date.now(),
): ChannelMultipliers {
  const relevant = entries.filter(e =>
    (!connectorAId || e.connectorAId === connectorAId) &&
    (!connectorBId || e.connectorBId === connectorBId) &&
    e.acceptedCount >= 1 &&
    e.channelHits != null,
  );

  const totals: Record<SignalChannel, number> = { lexical: 0, value: 0, structural: 0, businessType: 0, ontology: 0 };
  let totalHits = 0;

  for (const entry of relevant) {
    const decay = computeDecayFactor(entry.lastAcceptedAt, now);
    for (const ch of ALL_CHANNELS) {
      const weighted = (entry.channelHits?.[ch] ?? 0) * decay;
      totals[ch] += weighted;
      totalHits += weighted;
    }
  }

  if (totalHits < minHits) return { ...DEFAULT_CHANNEL_MULTIPLIERS };

  const avgShare = 1 / ALL_CHANNELS.length;
  const result = { ...DEFAULT_CHANNEL_MULTIPLIERS };

  for (const ch of ALL_CHANNELS) {
    const delta = totals[ch] / totalHits - avgShare;
    result[ch] = Math.max(0.80, Math.min(1.20, 1.0 + delta));
  }

  return result;
}

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
  /**
   * Mínimo de feedbacks totales (accepted + rejected) para que la entrada emita señal.
   * Con menos feedbacks que este umbral el provider devuelve null — la entrada existe
   * en memoria pero es demasiado ruidosa para influir en el scoring.
   * Default: MIN_ACTIVATION_SAMPLES = 2.
   */
  minActivationSamples?: number;
  /**
   * Máximo de penalización que un único rechazo puede aplicar sobre el score.
   * Protege contra operadores que rechazan por error o datos atípicos.
   * Default: REJECTION_CONTAMINATION_CAP = 0.15.
   */
  rejectionContaminationCap?: number;
}

export function createMappingMemoryOntologyProvider(
  entries: MappingMemoryEntry[],
  options: MappingMemoryProviderOptions = {},
): OntologyProvider {
  const providerId = options.providerId ?? 'mapping-memory';
  const vetoRatio = options.rejectionVetoRatio ?? REJECTION_VETO_RATIO;
  const minSamples = options.rejectionMinSamples ?? REJECTION_MIN_SAMPLES;
  const minFeedback = options.minFeedbackForAutoAccept ?? MIN_FEEDBACK_FOR_AUTO_ACCEPT;
  const minActivation = options.minActivationSamples ?? MIN_ACTIVATION_SAMPLES;
  const contaminationCap = options.rejectionContaminationCap ?? REJECTION_CONTAMINATION_CAP;

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
        // Si hay menos feedbacks totales que el mínimo de activación, la señal es ruido.
        const totalDirect = directEntry.acceptedCount + directEntry.rejectedCount;
        if (totalDirect < minActivation) return null;
        const rawScore = confidenceScore(directEntry, contaminationCap);
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
      // Mismo check de activación para leaf.
      const totalLeaf = leafEntry.acceptedCount + leafEntry.rejectedCount;
      if (totalLeaf < minActivation) return null;

      const rawLeafScore = Math.max(0.82, confidenceScore(leafEntry, contaminationCap) - 0.08);
      const leafScore = leafEntry.acceptedCount >= minFeedback ? rawLeafScore : Math.min(rawLeafScore, 0.82);
      return {
        score: leafScore,
        label: leafEntry.acceptedCount >= minFeedback ? 'mapping_memory_leaf' : 'mapping_memory_leaf_provisional',
        reason: `Historical leaf mapping memory for ${leaf(sourcePath)} -> ${leaf(targetPath)} (${leafEntry.acceptedCount} accepted).`,
      };
    },
  };
}
