import type { MappingMemoryEntry } from '../types.js';
import { generateSeedsFromManifests } from './generate.js';

// ─── Inline manifest shapes (canonical → connector-specific paths) ────────────
// Mirrors connector.manifest.ts files without creating a package dependency.

const MP = {
  service: 'mercadopago',
  entities: {
    payment: {
      fields: {
        externalId: 'id',
        amount: 'transaction_amount',
        currency: 'currency_id',
        status: 'status',
        transactionReference: 'external_reference',
        payerId: 'payer.id',
        authorizedAt: 'date_approved',
        rejectionCode: 'status_detail',
        updatedAt: 'date_last_updated',
        installments: 'installments',
        methodType: 'payment_type_id',
        description: 'description',
      },
    },
    subscription: {
      fields: {
        externalId: 'id',
        status: 'status',
        amount: 'auto_recurring.transaction_amount',
        currency: 'auto_recurring.currency_id',
        customerId: 'payer_id',
        nextBillingAt: 'next_payment_date',
        cancelledAt: 'date_cancelled',
        updatedAt: 'date_last_modified',
      },
    },
  },
};

const PAYWAY = {
  service: 'payway',
  entities: {
    payment: {
      fields: {
        externalId: 'id',
        amount: 'amount',
        currency: 'currency',
        status: 'status',
        transactionReference: 'external_reference',
        authorizationCode: 'authorization_code',
        cardToken: 'card_token',
        installments: 'installments',
        updatedAt: 'date_last_updated',
      },
    },
  },
};

const MOBBEX = {
  service: 'mobbex',
  entities: {
    payment: {
      fields: {
        externalId: 'id',
        amount: 'total',
        currency: 'currency',
        status: 'status',
        transactionReference: 'reference',
        checkoutUrl: 'url',
        updatedAt: 'updated_at',
      },
    },
    subscription: {
      fields: {
        externalId: 'id',
        status: 'status',
        amount: 'total',
        currency: 'currency',
        customerId: 'customer',
        updatedAt: 'updated_at',
      },
    },
  },
};

const DECIDIR = {
  service: 'decidir',
  entities: {
    payment: {
      fields: {
        externalId: 'id',
        amount: 'amount',
        currency: 'currency',
        status: 'status',
        transactionReference: 'merchant_payment_id',
        authorizationCode: 'establishment_name',
        installments: 'installments',
        updatedAt: 'date',
      },
    },
  },
};

// ─── Generated seed pairs ────────────────────────────────────────────────────

export const mercadopagoPaywaySeeds: MappingMemoryEntry[] =
  generateSeedsFromManifests(MP, PAYWAY);

export const mercadopagoMobbexSeeds: MappingMemoryEntry[] =
  generateSeedsFromManifests(MP, MOBBEX);

export const mercadopagoDecidirSeeds: MappingMemoryEntry[] =
  generateSeedsFromManifests(MP, DECIDIR);

export const paywayMobbexSeeds: MappingMemoryEntry[] =
  generateSeedsFromManifests(PAYWAY, MOBBEX);

export const paywayDecidirSeeds: MappingMemoryEntry[] =
  generateSeedsFromManifests(PAYWAY, DECIDIR);

export const mobbexDecidirSeeds: MappingMemoryEntry[] =
  generateSeedsFromManifests(MOBBEX, DECIDIR);

export const allPaymentGatewaySeeds: MappingMemoryEntry[] = [
  ...mercadopagoPaywaySeeds,
  ...mercadopagoMobbexSeeds,
  ...mercadopagoDecidirSeeds,
  ...paywayMobbexSeeds,
  ...paywayDecidirSeeds,
  ...mobbexDecidirSeeds,
];
