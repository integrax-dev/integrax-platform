import type { OntologyMatch, OntologyMatchContext, OntologyProvider } from './types.js';

export function normalizeToken(value: string): string {
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

export function leafToken(path: string): string {
  const segments = path.split('.');
  return normalizeToken(segments[segments.length - 1].replace(/\[\*\]/g, ''));
}

export function buildSynonymIndex(pairs: Array<[string, string]>): Map<string, Set<string>> {
  const index = new Map<string, Set<string>>();
  for (const [left, right] of pairs) {
    const l = normalizeToken(left);
    const r = normalizeToken(right);
    if (!index.has(l)) index.set(l, new Set());
    if (!index.has(r)) index.set(r, new Set());
    index.get(l)!.add(r);
    index.get(r)!.add(l);
  }
  return index;
}

function sharedTokenRatio(left: string, right: string): number {
  const leftTokens = left.split('_').filter(Boolean);
  const rightTokens = right.split('_').filter(Boolean);
  if (leftTokens.length === 0 || rightTokens.length === 0) return 0;
  const shared = leftTokens.filter(t => rightTokens.includes(t)).length;
  return shared / Math.max(leftTokens.length, rightTokens.length);
}

export function makeSynonymProvider(
  id: string,
  index: Map<string, Set<string>>,
): OntologyProvider {
  return {
    id,
    match(context: OntologyMatchContext): OntologyMatch | null {
      const leafA = leafToken(context.pathA);
      const leafB = leafToken(context.pathB);

      if (leafA === leafB) {
        return { score: 1, label: 'exact_leaf', reason: `Leaf token "${leafA}" matches exactly.` };
      }

      if (index.get(leafA)?.has(leafB) || index.get(leafB)?.has(leafA)) {
        return { score: 0.92, label: 'synonym', reason: `Synonym "${leafA}" <-> "${leafB}".` };
      }

      const sharedRatio = sharedTokenRatio(leafA, leafB);
      if (sharedRatio >= 0.5) {
        return {
          score: Math.min(0.8, 0.55 + sharedRatio * 0.25),
          label: 'token_overlap',
          reason: `Token overlap between "${leafA}" and "${leafB}".`,
        };
      }

      return null;
    },
  };
}
