/**
 * VTEX Adapter
 *
 * Enterprise ecommerce platform — dominant in LATAM enterprise retail.
 * Used by Falabella, Carrefour, La Anónima, Cencosud, and many others.
 *
 * Auth: X-VTEX-API-AppKey + X-VTEX-API-AppToken headers.
 * Products in VTEX are split into Product (metadata) + SKU (sellable variant).
 * We flatten this into IntegraX's CatalogItem + Variant model.
 *
 * Docs: https://developers.vtex.com/docs/api-reference/catalog-api
 */

import type { EcommerceAdapter } from '../adapter.js';
import type { CatalogItem, Variant, Price } from '../types.js';

export interface VTEXAdapterConfig {
  account: string;         // VTEX account name (e.g. mystore)
  appKey: string;
  appToken: string;
  environment?: 'vtexcommercestable' | 'vtexcommercebeta';
  tenantId?: string;
}

interface VTEXProductSearch {
  productId: string;
  productName: string;
  description: string;
  linkText: string;    // handle/slug
  isActive: boolean;
  items: VTEXSku[];
}

interface VTEXSku {
  itemId: string;
  name: string;
  referenceId: Array<{ Key: string; Value: string }>;
  sellers: Array<{
    commertialOffer: {
      Price: number;
      ListPrice: number;
      AvailableQuantity: number;
    };
  }>;
}

interface VTEXProductAdmin {
  Id: number;
  Name: string;
  Description: string;
  LinkId: string;
  IsActive: boolean;
}

interface VTEXSkuAdmin {
  Id: number;
  ProductId: number;
  Name: string;
  RefId: string;
  IsActive: boolean;
}

function vtexSearchToCatalogItem(tenantId: string, p: VTEXProductSearch): CatalogItem {
  const variants: Variant[] = p.items.map((sku) => {
    const seller = sku.sellers[0];
    const price = seller?.commertialOffer.Price ?? 0;
    const qty = seller?.commertialOffer.AvailableQuantity ?? 0;
    const refId = sku.referenceId.find((r) => r.Key === 'RefId')?.Value ?? sku.itemId;

    const priceObj: Price = {
      id: `vtex_price_${sku.itemId}`,
      variantId: `vtex_sku_${sku.itemId}`,
      currency: 'BRL',
      amount: Math.round(price * 100),
    };

    return {
      id: `vtex_sku_${sku.itemId}`,
      catalogItemId: `vtex_${p.productId}`,
      sku: refId,
      title: sku.name,
      prices: [priceObj],
      inventory_quantity: qty,
      allow_backorder: false,
    };
  });

  return {
    id: `vtex_${p.productId}`,
    tenantId,
    externalIds: [{ system: 'vtex', id: p.productId }],
    title: p.productName,
    description: p.description,
    handle: p.linkText,
    status: p.isActive ? 'published' : 'draft',
    variants,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export class VTEXAdapter implements EcommerceAdapter {
  readonly provider = 'vtex';
  private readonly cfg: VTEXAdapterConfig;
  private readonly env: string;

  constructor(cfg: VTEXAdapterConfig) {
    this.cfg = cfg;
    this.env = cfg.environment ?? 'vtexcommercestable';
  }

  private catalogBase(): string {
    return `https://${this.cfg.account}.${this.env}.com.br/api/catalog`;
  }

  private searchBase(): string {
    return `https://${this.cfg.account}.${this.env}.com.br/api/catalog_system/pub`;
  }

  private get headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-VTEX-API-AppKey': this.cfg.appKey,
      'X-VTEX-API-AppToken': this.cfg.appToken,
    };
  }

  private async get<T>(url: string): Promise<T> {
    const res = await fetch(url, { headers: this.headers, signal: AbortSignal.timeout(15000) });
    return this.parse<T>(res);
  }

  private async post<T>(url: string, body: unknown, method = 'POST'): Promise<T> {
    const res = await fetch(url, {
      method,
      headers: this.headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    return this.parse<T>(res);
  }

  private async parse<T>(res: Response): Promise<T> {
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { Message?: string; error?: string };
      throw new Error(`VTEX ${res.status}: ${err.Message ?? err.error ?? 'Unknown error'}`);
    }
    return res.json() as Promise<T>;
  }

  // ─── Catalog ───────────────────────────────────────────────────────────────

  async listProducts(params?: { limit?: number; offset?: number }): Promise<CatalogItem[]> {
    const from = params?.offset ?? 0;
    const to = from + (params?.limit ?? 49) - 1;
    const url = `${this.searchBase()}/products/search?_from=${from}&_to=${to}`;
    const products = await this.get<VTEXProductSearch[]>(url);
    const tid = this.cfg.tenantId ?? 'default';
    return products.map((p) => vtexSearchToCatalogItem(tid, p));
  }

  async getProduct(id: string): Promise<CatalogItem | null> {
    const externalId = id.startsWith('vtex_') ? id.slice(5) : id;
    try {
      const url = `${this.searchBase()}/products/search?fq=productId:${externalId}`;
      const products = await this.get<VTEXProductSearch[]>(url);
      if (!products.length) return null;
      return vtexSearchToCatalogItem(this.cfg.tenantId ?? 'default', products[0]);
    } catch (e) {
      if (e instanceof Error && e.message.includes('404')) return null;
      throw e;
    }
  }

  async createProduct(
    item: Omit<CatalogItem, 'id' | 'externalIds' | 'createdAt' | 'updatedAt'>,
  ): Promise<CatalogItem> {
    const body = {
      Name: item.title,
      Description: item.description ?? '',
      LinkId: item.handle,
      IsActive: item.status === 'published',
    };
    const created = await this.post<VTEXProductAdmin>(`${this.catalogBase()}/pvt/product`, body);
    return {
      id: `vtex_${created.Id}`,
      tenantId: this.cfg.tenantId ?? 'default',
      externalIds: [{ system: 'vtex', id: String(created.Id) }],
      title: created.Name,
      description: created.Description,
      handle: created.LinkId,
      status: created.IsActive ? 'published' : 'draft',
      variants: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  async updateProduct(id: string, patch: Partial<CatalogItem>): Promise<CatalogItem> {
    const externalId = id.startsWith('vtex_') ? id.slice(5) : id;
    const existing = await this.get<VTEXProductAdmin>(`${this.catalogBase()}/pvt/product/${externalId}`);
    const body: Partial<VTEXProductAdmin> = {
      ...existing,
      ...(patch.title !== undefined ? { Name: patch.title } : {}),
      ...(patch.description !== undefined ? { Description: patch.description } : {}),
      ...(patch.handle !== undefined ? { LinkId: patch.handle } : {}),
      ...(patch.status !== undefined ? { IsActive: patch.status === 'published' } : {}),
    };
    const updated = await this.post<VTEXProductAdmin>(
      `${this.catalogBase()}/pvt/product/${externalId}`,
      body,
      'PUT',
    );
    return {
      id: `vtex_${updated.Id}`,
      tenantId: this.cfg.tenantId ?? 'default',
      externalIds: [{ system: 'vtex', id: String(updated.Id) }],
      title: updated.Name,
      description: updated.Description,
      handle: updated.LinkId,
      status: updated.IsActive ? 'published' : 'draft',
      variants: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  async deleteProduct(id: string): Promise<void> {
    const externalId = id.startsWith('vtex_') ? id.slice(5) : id;
    await this.post(`${this.catalogBase()}/pvt/product/${externalId}`, { IsActive: false }, 'PUT');
  }
}

export function createVTEXAdapter(cfg: VTEXAdapterConfig | null): VTEXAdapter | null {
  if (!cfg?.account || !cfg?.appKey || !cfg?.appToken) return null;
  return new VTEXAdapter(cfg);
}
