/**
 * Canonical Product — the shared representation used by the reconciliation engine.
 * Every connector adapter maps its native product type to this shape.
 */

export interface CanonicalProduct {
  /** All external IDs this product has across systems */
  externalIds: Array<{ system: string; id: string }>;
  sku: string;
  title: string;
  brand?: string;
  variant?: string;
  size?: string;
  color?: string;
  price: number;
  currency: string;       // ISO 4217, e.g. 'ARS', 'USD'
  stock: number;
  status: 'active' | 'inactive' | 'archived';
  updatedAt: Date;
  sourceSystem: string;   // 'mercadopago' | 'contabilium' | ...
}
