import type { MappingMemoryEntry } from '../types.js';
import { generateSeedsFromManifests } from './generate.js';

const CONTABILIUM = {
  service: 'contabilium',
  entities: {
    customer: {
      fields: {
        externalId: 'Id',
        sku: 'NumeroDocumento',
        title: 'RazonSocial',
        status: 'Activo',
        updatedAt: 'FechaModificacion',
      },
    },
    product: {
      fields: {
        externalId: 'Id',
        sku: 'Codigo',
        title: 'Nombre',
        price: 'Precio',
        stock: 'Stock',
        status: 'Activo',
        updatedAt: 'FechaModificacion',
      },
    },
    invoice: {
      fields: {
        externalId: 'Id',
        sku: 'NumeroCompleto',
        title: 'Cliente.RazonSocial',
        price: 'Total',
        currency: 'Moneda',
        status: 'Estado',
        updatedAt: 'FechaModificacion',
        customerTaxId: 'Cliente.NumeroDocumento',
      },
    },
  },
};

const AFIP = {
  service: 'afip-wsfe',
  entities: {
    invoice: {
      fields: {
        externalId: 'CAE',
        sku: 'CbteDesde',
        title: 'DocNro',
        price: 'ImpTotal',
        currency: 'MonId',
        status: 'Resultado',
        updatedAt: 'CbteFch',
        customerTaxId: 'DocNro',
      },
    },
  },
};

export const contabiliumAfipSeeds: MappingMemoryEntry[] =
  generateSeedsFromManifests(CONTABILIUM, AFIP);
