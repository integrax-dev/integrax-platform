import type { ExternalId } from './external-id.js';

export type CustomerStatus = 'active' | 'inactive' | 'blocked';

/** Codigos de condicion fiscal mantenidos genericos; los paquetes por pais agregan etiquetas de AR. */
export type VatStatus = string;

export interface CustomerAddress {
  street?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
}

export interface Customer {
  id?: string;
  externalIds: ExternalId[];
  /** Numero de identificacion fiscal (CUIT, CUIL, NIF, CPF, etc.). */
  taxId?: string;
  name: string;
  fantasyName?: string;
  email?: string;
  phone?: string;
  address?: CustomerAddress;
  /** Valor de condicion fiscal tal como lo provee el conector. */
  vatStatus?: VatStatus;
  status: CustomerStatus;
  sourceSystem: string;
  updatedAt: Date;
}
