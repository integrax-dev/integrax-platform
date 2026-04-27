import {
  GENERIC_BUSINESS_TYPE_PROVIDERS,
  GENERIC_BUSINESS_TYPE_WEIGHTS,
  AR_TAX_ID_PROVIDERS, AR_TAX_ID_WEIGHTS,
  BR_TAX_ID_PROVIDERS, BR_TAX_ID_WEIGHTS,
  MX_TAX_ID_PROVIDERS, MX_TAX_ID_WEIGHTS,
} from '@integrax/ontology';
import type { BusinessTypeProvider, BusinessTypeWeightMap } from '@integrax/schema-bridge';

export const defaultBusinessTypeProviders: BusinessTypeProvider[] = GENERIC_BUSINESS_TYPE_PROVIDERS;
export const defaultBusinessTypeWeights: BusinessTypeWeightMap = GENERIC_BUSINESS_TYPE_WEIGHTS;

export const latamBusinessTypeProviders: BusinessTypeProvider[] = [
  ...AR_TAX_ID_PROVIDERS,
  ...BR_TAX_ID_PROVIDERS,
  ...MX_TAX_ID_PROVIDERS,
];
export const latamBusinessTypeWeights: BusinessTypeWeightMap = {
  ...AR_TAX_ID_WEIGHTS,
  ...BR_TAX_ID_WEIGHTS,
  ...MX_TAX_ID_WEIGHTS,
};
