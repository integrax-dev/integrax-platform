import {
  DictionaryOntologyProvider,
  buildSynonymIndex,
  makeSynonymProvider,
} from '@integrax/schema-bridge';
import type { OntologyProvider } from '@integrax/schema-bridge';
import {
  HIGH_CONFIDENCE_SETS,
  MEDIUM_CONFIDENCE_SETS,
  GENERIC_SYNONYM_PAIRS,
  ES_COMMON_SYNONYM_PAIRS,
  ES_AR_SYNONYM_PAIRS,
  PT_COMMON_SYNONYM_PAIRS,
  PT_BR_SYNONYM_PAIRS,
} from '@integrax/ontology';

export const defaultOntologyProviders: OntologyProvider[] = [
  new DictionaryOntologyProvider(HIGH_CONFIDENCE_SETS, MEDIUM_CONFIDENCE_SETS),
  makeSynonymProvider('generic-synonyms', buildSynonymIndex(GENERIC_SYNONYM_PAIRS)),
];

/** Spanish + Portuguese LatAm providers — spread after defaultOntologyProviders. */
export const latamOntologyProviders: OntologyProvider[] = [
  makeSynonymProvider('es-common', buildSynonymIndex(ES_COMMON_SYNONYM_PAIRS)),
  makeSynonymProvider('es-ar',     buildSynonymIndex(ES_AR_SYNONYM_PAIRS)),
  makeSynonymProvider('pt-common', buildSynonymIndex(PT_COMMON_SYNONYM_PAIRS)),
  makeSynonymProvider('pt-br',     buildSynonymIndex(PT_BR_SYNONYM_PAIRS)),
];
