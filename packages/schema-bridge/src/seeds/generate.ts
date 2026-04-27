import type { MappingMemoryEntry } from '../types.js';

interface SeedableManifest {
  service: string;
  entities?: Record<string, { fields: Record<string, string> }>;
}

function makeGT(
  sourcePath: string,
  targetPath: string,
  connectorAId: string,
  connectorBId: string,
): MappingMemoryEntry {
  return {
    sourcePath,
    targetPath,
    connectorAId,
    connectorBId,
    acceptedCount: 50,
    rejectedCount: 0,
    averageConfidence: 0.99,
    isGroundTruth: true,
  };
}

/**
 * Derives ground-truth MappingMemoryEntry pairs from two connector manifests
 * by cross-referencing shared canonical field names. Only emits pairs where
 * both connectors map the same canonical key to *different* connector-specific paths.
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
      seeds.push(makeGT(pathA, pathB, manifestA.service, manifestB.service));
    }
  }
  return seeds;
}
