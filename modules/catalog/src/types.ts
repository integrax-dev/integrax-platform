import type { Product, ProductStatus } from '@integrax/entities';

export interface PublishProductInput {
  tenantId: string;
  sourceSystem: string;
  product: Omit<Product, 'id' | 'updatedAt'>;
}

export interface UpdatePriceInput {
  tenantId: string;
  canonicalId: string;
  sourceSystem: string;
  newPrice: number;
  currency?: string;
}

export interface ArchiveProductInput {
  tenantId: string;
  canonicalId: string;
  sourceSystem: string;
}

export interface ProductPriceDivergence {
  canonicalId: string;
  sku: string;
  systems: Array<{ system: string; price: number; currency: string }>;
}

export interface CatalogModule {
  publishProduct(input: PublishProductInput): Promise<Product & { id: string }>;
  updatePrice(input: UpdatePriceInput): Promise<void>;
  archiveProduct(input: ArchiveProductInput): Promise<void>;
  getProduct(tenantId: string, canonicalId: string): Promise<Product | null>;
  listProducts(tenantId: string, options?: { status?: ProductStatus; since?: Date; limit?: number }): Promise<Product[]>;
  findPriceDivergences(tenantId: string): Promise<ProductPriceDivergence[]>;
}
