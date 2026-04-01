import type { OntologyMatch, OntologyMatchContext, OntologyProvider } from './types.js';

const DICTIONARY_SETS = [
  new Set(['cell', 'mobile', 'phone', 'telephone', 'mobile_number', 'cell_phone']),
  new Set(['first_name', 'given_name', 'fname']),
  new Set(['last_name', 'surname', 'family_name', 'lname']),
  new Set(['zip', 'postal', 'zipcode', 'postal_code']),
  new Set(['vat', 'tax_id', 'cuit', 'rfc', 'cnpj', 'tax_number', 'ein']),
  new Set(['mail', 'email', 'email_address']),
  new Set(['qty', 'quantity', 'amount', 'count']),
  new Set(['price', 'cost', 'rate', 'unit_price']),
  new Set(['client', 'customer']),
  new Set(['provider', 'supplier', 'vendor']),
  new Set(['org', 'organization', 'company', 'business']),
  new Set(['desc', 'description', 'notes', 'comments', 'remarks']),
  new Set(['created_at', 'date_created']),
  new Set(['updated_at', 'last_modified']),
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
    
    // Normalize string directly to snake_case without relying on similarity-engine exports
    const normA = leafA.replace(/([A-Z])/g, '_$1').replace(/-/g, '_').toLowerCase().replace(/__+/g, '_').replace(/^_|_$/g, '');
    const normB = leafB.replace(/([A-Z])/g, '_$1').replace(/-/g, '_').toLowerCase().replace(/__+/g, '_').replace(/^_|_$/g, '');

    for (const set of DICTIONARY_SETS) {
      if (set.has(normA) && set.has(normB)) {
        return {
          score: 1.0,
          label: 'dictionary_synonym',
          reason: `Reconocido como sinónimos empresariales (${normA} ↔ ${normB})`
        };
      }
      
      // Match por token sufijo (ej: 'user_first_name' -> coincidirá con 'first_name')
      let aHas = false;
      let bHas = false;
      for (const term of set) {
        if (normA === term || normA.endsWith(`_${term}`)) aHas = true;
        if (normB === term || normB.endsWith(`_${term}`)) bHas = true;
      }
      
      if (aHas && bHas) {
         return {
          score: 0.90,
          label: 'dictionary_synonym_partial',
          reason: `Reconocido parcialmente mediante sufijos clave (${normA} ↔ ${normB})`
        };       
      }
    }

    return null;
  }
}
