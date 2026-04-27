import type { OntologyMatch, OntologyMatchContext, OntologyProvider } from './types.js';

/**
 * Scores pairs by checking membership in caller-supplied high/medium confidence sets.
 * Instantiate with the sets you want — keeps the engine data-free.
 */
export class DictionaryOntologyProvider implements OntologyProvider {
  id = 'dictionary-synonyms';

  constructor(
    private readonly highConfidenceSets: ReadonlyArray<ReadonlySet<string>>,
    private readonly mediumConfidenceSets: ReadonlyArray<ReadonlySet<string>>,
  ) {}

  match(context: OntologyMatchContext): OntologyMatch | null {
    const leafA = context.pathA.split('.').pop()?.replace(/\[\*\]/g, '') || '';
    const leafB = context.pathB.split('.').pop()?.replace(/\[\*\]/g, '') || '';

    const normA = leafA.replace(/([A-Z])/g, '_$1').replace(/-/g, '_').toLowerCase().replace(/__+/g, '_').replace(/^_|_$/g, '');
    const normB = leafB.replace(/([A-Z])/g, '_$1').replace(/-/g, '_').toLowerCase().replace(/__+/g, '_').replace(/^_|_$/g, '');

    for (const set of this.highConfidenceSets) {
      if (set.has(normA) && set.has(normB)) {
        return { score: 1.0, label: 'dictionary_synonym', reason: `High-confidence synonyms (${normA} ↔ ${normB})` };
      }
      let aHas = false;
      let bHas = false;
      for (const term of set) {
        if (normA === term || normA.endsWith(`_${term}`)) aHas = true;
        if (normB === term || normB.endsWith(`_${term}`)) bHas = true;
      }
      if (aHas && bHas) {
        return { score: 0.90, label: 'dictionary_synonym_partial', reason: `Suffix synonyms (${normA} ↔ ${normB})` };
      }
    }

    for (const set of this.mediumConfidenceSets) {
      if (set.has(normA) && set.has(normB)) {
        return { score: 0.75, label: 'dictionary_synonym_medium', reason: `Medium-confidence synonyms (${normA} ↔ ${normB})` };
      }
      let aHas = false;
      let bHas = false;
      for (const term of set) {
        if (normA === term || normA.endsWith(`_${term}`)) aHas = true;
        if (normB === term || normB.endsWith(`_${term}`)) bHas = true;
      }
      if (aHas && bHas) {
        return { score: 0.70, label: 'dictionary_synonym_medium_partial', reason: `Medium suffix synonyms (${normA} ↔ ${normB})` };
      }
    }

    return null;
  }
}
