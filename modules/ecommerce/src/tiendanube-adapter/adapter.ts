/**
 * Tiendanube (Nuvemshop) Adapter
 *
 * Argentina / Brazil #1 SMB ecommerce platform.
 * API v1: https://tiendanube.github.io/api-documentation/
 *
 * Auth: OAuth 2.0 bearer token + User-Agent header (required by Tiendanube).
 * All names/descriptions are multilingual objects — we read 'es' first, then 'pt', then first available.
 * Tiendanube does not expose a headless cart API; only catalog + orders are available.
 */

import type { EcommerceAdapter } from '../adapter.js';
import type { CatalogItem, Variant, Price, Cart } from '../types.js';
import { ulid } from '@integrax/entities';

export interface TiendanubeAdapterConfig {
  storeId: string;
  accessToken: string;
  userAgent: string;
  tenantId?: string;
}

type TiendanubeLocale = Record<string, string>;

interface TiendanubeVariant {
  id: number;
  sku: string | null;
  price: string;
  promotional_price: string | null;
  stock: number | null;
  stock_management: boolean;
  values: Array<{ en: string; es?: string }>;
  created_at: string;
  updated_at: string;
}

interface TiendanubeProduct {
  id: number;
  name: TiendanubeLocale;
  description: TiendanubeLocale | null;
  handle: TiendanubeLocale;
  published: boolean;
  free_shipping: boolean;
  variants: TiendanubeVariant[];
  tags: string;
  images: Array<{ id: number; src: string }>;
  created_at: string;
  updated_at: string;
}

function pickLocale(obj: TiendanubeLocale | null | undefined): string {
  if (!obj) return '';
  return obj['es'] ?? obj['pt'] ?? Object.values(obj)[0] ?? '';
}

function tnProductToCatalogItem(tenantId: string, p: TiendanubeProduct): CatalogItem {
  const variants: Variant[] = p.variants.map((v) => {
    const price: Price = {
      id: `tn_price_${v.id}`,
      variantId: `tn_var_${v.id}`,
      currency: 'ARS',
      amount: Math.round(parseFloat(v.price) * 100),
    };
    return {
      id: `tn_var_${v.id}`,
      catalogItemId: `tn_${p.id}`,
      sku: v.sku ?? `TN-${p.id}-${v.id}`,
      title: v.values.map((val) => val.es ?? val.en).join(' / ') || 'Default',
      prices: [price],
      inventory_quantity: v.stock ?? undefined,
      allow_backorder: !v.stock_management,
    };
  });

  return {
    id: `tn_${p.id}`,
    tenantId,
    externalIds: [{ system: 'tiendanube', id: String(p.id) }],
    title: pickLocale(p.name),
    description: pickLocale(p.description),
    handle: pickLocale(p.handle),
    status: p.published ? 'published' : 'draft',
    variants,
    tags: p.tags ? p.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
    createdAt: new Date(p.created_at),
    updatedAt: new Date(p.updated_at),
  };
}

export class TiendanubeAdapter implements EcommerceAdapter {
  readonly provider = 'tiendanube';
  private readonly cfg: TiendanubeAdapterConfig;

  constructor(cfg: TiendanubeAdapterConfig) {
    this.cfg = cfg;
  }

  private get baseUrl(): string {
    return `https://api.tiendanube.com/v1/${this.cfg.storeId}`;
  }

  private get headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authentication: `bearer ${this.cfg.accessToken}`,
      'User-Agent': this.cfg.userAgent,
    };
  }

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: this.headers,
      signal: AbortSignal.timeout(15000),
    });
    return this.parse<T>(res);
  }

  private async post<T>(path: string, body: unknown, method = 'POST'): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: this.headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    return this.parse<T>(res);
  }

  private async del(path: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'DELETE',
      headers: this.headers,
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok && res.status !== 204) {
      const err = await res.json().catch(() => ({})) as { description?: string };
      throw new Error(`Tiendanube ${res.status}: ${err.description ?? 'Unknown error'}`);
    }
  }

  private async parse<T>(res: Response): Promise<T> {
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { description?: string; code?: string };
      throw new Error(`Tiendanube ${res.status}: ${err.description ?? err.code ?? 'Unknown error'}`);
    }
    return res.json() as Promise<T>;
  }

  // ─── Catalog ───────────────────────────────────────────────────────────────

  async listProducts(params?: { limit?: number; offset?: number; status?: string }): Promise<CatalogItem[]> {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set('per_page', String(Math.min(params.limit, 200)));
    if (params?.offset) qs.set('page', String(Math.floor((params.offset ?? 0) / (params.limit ?? 20)) + 1));
    if (params?.status === 'published') qs.set('published', 'true');
    if (params?.status === 'draft') qs.set('published', 'false');

    const products = await this.get<TiendanubeProduct[]>(`/products?${qs}`);
    const tid = this.cfg.tenantId ?? 'default';
    return products.map((p) => tnProductToCatalogItem(tid, p));
  }

  async getProduct(id: string): Promise<CatalogItem | null> {
    const externalId = id.startsWith('tn_') ? id.slice(3) : id;
    try {
      const p = await this.get<TiendanubeProduct>(`/products/${externalId}`);
      return tnProductToCatalogItem(this.cfg.tenantId ?? 'default', p);
    } catch (e) {
      if (e instanceof Error && e.message.includes('404')) return null;
      throw e;
    }
  }

  async createProduct(
    item: Omit<CatalogItem, 'id' | 'externalIds' | 'createdAt' | 'updatedAt'>,
  ): Promise<CatalogItem> {
    const body = {
      name: { es: item.title },
      description: { es: item.description ?? '' },
      published: item.status === 'published',
      tags: item.tags?.join(', ') ?? '',
      variants: item.variants.map((v) => ({
        sku: v.sku,
        price: (v.prices[0]?.amount ?? 0) / 100,
        stock: v.inventory_quantity ?? null,
        stock_management: v.inventory_quantity !== undefined,
      })),
    };
    const p = await this.post<TiendanubeProduct>('/products', body);
    return tnProductToCatalogItem(this.cfg.tenantId ?? 'default', p);
  }

  async updateProduct(id: string, patch: Partial<CatalogItem>): Promise<CatalogItem> {
    const externalId = id.startsWith('tn_') ? id.slice(3) : id;
    const body: Record<string, unknown> = {};
    if (patch.title) body['name'] = { es: patch.title };
    if (patch.description) body['description'] = { es: patch.description };
    if (patch.status) body['published'] = patch.status === 'published';
    if (patch.tags) body['tags'] = patch.tags.join(', ');
    const p = await this.post<TiendanubeProduct>(`/products/${externalId}`, body, 'PUT');
    return tnProductToCatalogItem(this.cfg.tenantId ?? 'default', p);
  }

  async deleteProduct(id: string): Promise<void> {
    const externalId = id.startsWith('tn_') ? id.slice(3) : id;
    await this.del(`/products/${externalId}`);
  }
}

export function createTiendanubeAdapter(cfg: TiendanubeAdapterConfig | null): TiendanubeAdapter | null {
  if (!cfg?.storeId || !cfg?.accessToken) return null;
  return new TiendanubeAdapter({
    ...cfg,
    userAgent: cfg.userAgent || 'IntegraX (soporte@integrax.io)',
  });
}
