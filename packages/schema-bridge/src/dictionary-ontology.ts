import type { OntologyMatch, OntologyMatchContext, OntologyProvider } from './types.js';

// Sets de alta confianza (score 1.0): términos con semántica unívoca de negocio.
const HIGH_CONFIDENCE_SETS = [
  new Set(['cell', 'mobile', 'phone', 'telephone', 'mobile_number', 'cell_phone']),
  new Set(['first_name', 'given_name', 'fname']),
  new Set(['last_name', 'surname', 'family_name', 'lname']),
  new Set(['zip', 'postal', 'zipcode', 'postal_code']),
  new Set(['vat', 'tax_id', 'tax_number', 'ein']),  // generic fiscal IDs only
  new Set(['mail', 'email', 'email_address']),
  new Set(['price', 'cost', 'rate', 'unit_price']),
  new Set(['client', 'customer']),
  new Set(['provider', 'supplier', 'vendor']),
  new Set(['org', 'organization', 'company', 'business']),
  new Set(['created_at', 'date_created']),
  new Set(['updated_at', 'last_modified']),
];

// Sets de confianza media (score 0.75)
const MEDIUM_CONFIDENCE_SETS = [
  new Set(['qty', 'quantity', 'count']),
  new Set(['desc', 'description', 'note', 'notes', 'comment', 'comments', 'remarks']),
];

/**
 * Provee alias empresariales rígidos para términos genéricos en inglés.
 * Para cubrir sinónimos en español/portugués, inyectar latamOntologyProviders.
 */
export class DictionaryOntologyProvider implements OntologyProvider {
  id = 'dictionary-synonyms';

  match(context: OntologyMatchContext): OntologyMatch | null {
    const leafA = context.pathA.split('.').pop()?.replace(/\[\*\]/g, '') || '';
    const leafB = context.pathB.split('.').pop()?.replace(/\[\*\]/g, '') || '';

    const normA = leafA.replace(/([A-Z])/g, '_$1').replace(/-/g, '_').toLowerCase().replace(/__+/g, '_').replace(/^_|_$/g, '');
    const normB = leafB.replace(/([A-Z])/g, '_$1').replace(/-/g, '_').toLowerCase().replace(/__+/g, '_').replace(/^_|_$/g, '');

    for (const set of HIGH_CONFIDENCE_SETS) {
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

    for (const set of MEDIUM_CONFIDENCE_SETS) {
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
