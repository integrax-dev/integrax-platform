import type { ExternalId } from './external-id.js';

export type ProductStatus = 'active' | 'inactive' | 'archived' | 'draft';

export interface Product {
  /** ID canonico interno (ulid). Es opcional hasta persistirlo. */
  id?: string;
  externalIds: ExternalId[];
  sku: string;
  title: string;
  description?: string;
  brand?: string;
  /** Por ejemplo 'S', 'M', 'L' o '500ml'. */
  variant?: string;
  size?: string;
  color?: string;
  price: number;
  currency: string;
  /** Unidades de stock disponibles. */
  stock: number;
  status: ProductStatus;
  imageUrl?: string;
  categoryId?: string;
  categoryName?: string;
  tags?: string[];
  sourceSystem: string;
  updatedAt: Date;
}
