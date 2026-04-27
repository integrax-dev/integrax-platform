import type { MappingMemoryEntry } from '@integrax/schema-bridge';

interface SeedableManifest {
  service: string;
  entities?: Record<string, { fields: Record<string, string> }>;
}

/**
 * Derives ground-truth seeds from two connector manifests by cross-referencing
 * shared canonical field names. Only emits pairs where both connectors map the
 * same canonical key to *different* connector-specific paths.
 */
export function generateSeedsFromManifests(
  manifestA: SeedableManifest,
  manifestB: SeedableManifest,
): MappingMemoryEntry[] {
  const seeds: MappingMemoryEntry[] = [];
  const { entities: entitiesA } = manifestA;
  const { entities: entitiesB } = manifestB;
  if (!entitiesA || !entitiesB) return seeds;

  for (const entityType of Object.keys(entitiesA)) {
    const entA = entitiesA[entityType];
    const entB = entitiesB[entityType];
    if (!entA || !entB) continue;
    for (const canonicalKey of Object.keys(entA.fields)) {
      const pathA = entA.fields[canonicalKey];
      const pathB = entB.fields[canonicalKey];
      if (!pathA || !pathB || pathA === pathB) continue;
      seeds.push({ sourcePath: pathA, targetPath: pathB, connectorAId: manifestA.service, connectorBId: manifestB.service, acceptedCount: 50, rejectedCount: 0, averageConfidence: 0.99, isGroundTruth: true });
    }
  }
  return seeds;
}
