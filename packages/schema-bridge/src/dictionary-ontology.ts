import type { OntologyMatch, OntologyMatchContext, OntologyProvider } from './types.js';

// Sets de alta confianza (score 1.0): términos con semántica unívoca de negocio.
// Cada término del set es intercambiable con certeza en cualquier contexto enterprise.
const HIGH_CONFIDENCE_SETS = [
  new Set(['cell', 'mobile', 'phone', 'telephone', 'mobile_number', 'cell_phone']),
  new Set(['first_name', 'given_name', 'fname']),
  new Set(['last_name', 'surname', 'family_name', 'lname']),
  new Set(['zip', 'postal', 'zipcode', 'postal_code']),
  new Set(['vat', 'tax_id', 'cuit', 'rfc', 'cnpj', 'tax_number', 'ein']),
  new Set(['mail', 'email', 'email_address']),
  new Set(['price', 'cost', 'rate', 'unit_price']),
  new Set(['client', 'customer']),
  new Set(['provider', 'supplier', 'vendor']),
  new Set(['org', 'organization', 'company', 'business']),
  new Set(['created_at', 'date_created']),
  new Set(['updated_at', 'last_modified']),
];

// Sets de confianza media (score 0.75): términos relacionados pero con más ambigüedad
// semántica. No alcanzan el umbral 0.90 requerido por Regla 4 por sí solos — necesitan
// corroboración de valores u otros canales para auto-aceptar.
// Ejemplo: 'note' y 'comment' son similares pero con datos sparse no hay evidencia real.
const MEDIUM_CONFIDENCE_SETS = [
  new Set(['qty', 'quantity', 'count']),
  new Set(['desc', 'description', 'note', 'notes', 'comment', 'comments', 'remarks']),
];

/**
 * Provee alias empresariales rígidos. Resuelve mapeos semánticos donde fallaría la 
 * similitud de Jaccard/Levenshtein porque cambian las palabras (ej. first_name vs given_name).
 */
export class DictionaryOntologyProvider implements OntologyProvider {
  id = 'dictionary-synonyms';

  match(context: OntologyMatchContext): OntologyMatch | null {
    const leafA = context.pathA.split('.').pop()?.replace(/\[\*\]/g, '') || '';
    const leafB = context.pathB.split('.').pop()?.replace(/\[\*\]/g, '') || '';

    // Normalize to snake_case without importing from similarity-engine (circular dep risk).
    const normA = leafA.replace(/([A-Z])/g, '_$1').replace(/-/g, '_').toLowerCase().replace(/__+/g, '_').replace(/^_|_$/g, '');
    const normB = leafB.replace(/([A-Z])/g, '_$1').replace(/-/g, '_').toLowerCase().replace(/__+/g, '_').replace(/^_|_$/g, '');

    // Alta confianza — score 1.0, apto para disparar Regla 4 con corroboración mínima.
    for (const set of HIGH_CONFIDENCE_SETS) {
      if (set.has(normA) && set.has(normB)) {
        return { score: 1.0, label: 'dictionary_synonym', reason: `Sinónimos empresariales de alta confianza (${normA} ↔ ${normB})` };
      }
      // Match por token sufijo (ej: 'user_first_name' coincide con 'first_name').
      let aHas = false;
      let bHas = false;
      for (const term of set) {
        if (normA === term || normA.endsWith(`_${term}`)) aHas = true;
        if (normB === term || normB.endsWith(`_${term}`)) bHas = true;
      }
      if (aHas && bHas) {
        return { score: 0.90, label: 'dictionary_synonym_partial', reason: `Sinónimos por sufijo (${normA} ↔ ${normB})` };
      }
    }

    // Confianza media — score 0.75. No alcanza umbral 0.90 de Regla 4 por sí solo.
    // Necesita corroboración de valores u otros canales para auto-aceptar.
    for (const set of MEDIUM_CONFIDENCE_SETS) {
      if (set.has(normA) && set.has(normB)) {
        return { score: 0.75, label: 'dictionary_synonym_medium', reason: `Sinónimos de confianza media (${normA} ↔ ${normB})` };
      }
      let aHas = false;
      let bHas = false;
      for (const term of set) {
        if (normA === term || normA.endsWith(`_${term}`)) aHas = true;
        if (normB === term || normB.endsWith(`_${term}`)) bHas = true;
      }
      if (aHas && bHas) {
        return { score: 0.70, label: 'dictionary_synonym_medium_partial', reason: `Sinónimos por sufijo, confianza media (${normA} ↔ ${normB})` };
      }
    }

    return null;
  }
}
