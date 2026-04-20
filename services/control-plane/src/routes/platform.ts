/**
 * Platform module routes
 *
 * Expone los módulos de dominio (orders, inventory, billing, catalog,
 * consistency-inspector) como endpoints REST bajo /api/platform.
 *
 * Todos los endpoints requieren autenticación. Las operaciones de escritura
 * requieren rol operator o superior; las de lectura aceptan viewer.
 */

import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import {
  ordersService,
  inventoryService,
  billingService,
  catalogService,
  consistencyInspector,
  ecommerceService,
} from '../platform/container.js';
import type { OrderStatus, InvoiceStatus, ProductStatus } from '@integrax/entities';

export const platformRouter = Router();

// ─── Orders ──────────────────────────────────────────────────────────────────

platformRouter.post(
  '/tenants/:tenantId/orders',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin', 'operator'),
  async (req, res, next) => {
    try {
      const order = await ordersService.createOrder({
        tenantId: req.params['tenantId'],
        sourceSystem: req.body.sourceSystem,
        order: req.body.order,
      });
      res.status(201).json({ success: true, data: order });
    } catch (err) {
      next(err);
    }
  },
);

platformRouter.get(
  '/tenants/:tenantId/orders',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin', 'operator', 'viewer'),
  async (req, res, next) => {
    try {
      const orders = await ordersService.listOrders({
        tenantId: req.params['tenantId'],
        status: req.query['status'] as OrderStatus | undefined,
        sourceSystem: req.query['sourceSystem'] as string | undefined,
        since: req.query['since'] ? new Date(req.query['since'] as string) : undefined,
        limit: req.query['limit'] ? Number(req.query['limit']) : undefined,
      });
      res.json({ success: true, data: orders });
    } catch (err) {
      next(err);
    }
  },
);

platformRouter.get(
  '/tenants/:tenantId/orders/:canonicalId',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin', 'operator', 'viewer'),
  async (req, res, next) => {
    try {
      const order = await ordersService.getOrder({
        tenantId: req.params['tenantId'],
        canonicalId: req.params['canonicalId'],
      });
      if (!order) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Pedido no encontrado' });
        return;
      }
      res.json({ success: true, data: order });
    } catch (err) {
      next(err);
    }
  },
);

platformRouter.patch(
  '/tenants/:tenantId/orders/:canonicalId/status',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin', 'operator'),
  async (req, res, next) => {
    try {
      await ordersService.updateStatus({
        tenantId: req.params['tenantId'],
        canonicalId: req.params['canonicalId'],
        sourceSystem: req.body.sourceSystem,
        newStatus: req.body.status,
        reason: req.body.reason,
      });
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  },
);

platformRouter.post(
  '/tenants/:tenantId/orders/:canonicalId/cancel',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin', 'operator'),
  async (req, res, next) => {
    try {
      await ordersService.cancelOrder({
        tenantId: req.params['tenantId'],
        canonicalId: req.params['canonicalId'],
        sourceSystem: req.body.sourceSystem,
        reason: req.body.reason,
      });
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  },
);

// ─── Inventory ───────────────────────────────────────────────────────────────

platformRouter.put(
  '/tenants/:tenantId/stock',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin', 'operator'),
  async (req, res, next) => {
    try {
      const stock = await inventoryService.updateStock({
        tenantId: req.params['tenantId'],
        sourceSystem: req.body.sourceSystem,
        sku: req.body.sku,
        canonicalId: req.body.canonicalId,
        quantity: req.body.quantity,
        locationId: req.body.locationId,
      });
      res.json({ success: true, data: stock });
    } catch (err) {
      next(err);
    }
  },
);

platformRouter.get(
  '/tenants/:tenantId/stock/:sku',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin', 'operator', 'viewer'),
  async (req, res, next) => {
    try {
      const stock = await inventoryService.getStock(
        req.params['tenantId'],
        req.params['sku'],
        req.query['sourceSystem'] as string | undefined,
      );
      if (!stock) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Stock no encontrado' });
        return;
      }
      res.json({ success: true, data: stock });
    } catch (err) {
      next(err);
    }
  },
);

platformRouter.get(
  '/tenants/:tenantId/stock-divergences',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin', 'operator', 'viewer'),
  async (req, res, next) => {
    try {
      const divergences = await inventoryService.findDivergences(req.params['tenantId']);
      res.json({ success: true, data: divergences });
    } catch (err) {
      next(err);
    }
  },
);

platformRouter.post(
  '/tenants/:tenantId/stock/reserve',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin', 'operator'),
  async (req, res, next) => {
    try {
      await inventoryService.reserveStock({
        tenantId: req.params['tenantId'],
        sourceSystem: req.body.sourceSystem,
        sku: req.body.sku,
        canonicalId: req.body.canonicalId,
        quantity: req.body.quantity,
        referenceId: req.body.referenceId,
      });
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  },
);

platformRouter.post(
  '/tenants/:tenantId/stock/release',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin', 'operator'),
  async (req, res, next) => {
    try {
      await inventoryService.releaseReservation({
        tenantId: req.params['tenantId'],
        sourceSystem: req.body.sourceSystem,
        sku: req.body.sku,
        canonicalId: req.body.canonicalId,
        referenceId: req.body.referenceId,
      });
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  },
);

// ─── Billing ─────────────────────────────────────────────────────────────────

platformRouter.post(
  '/tenants/:tenantId/invoices',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin', 'operator'),
  async (req, res, next) => {
    try {
      const invoice = await billingService.createInvoice({
        tenantId: req.params['tenantId'],
        sourceSystem: req.body.sourceSystem,
        invoice: req.body.invoice,
      });
      res.status(201).json({ success: true, data: invoice });
    } catch (err) {
      next(err);
    }
  },
);

platformRouter.get(
  '/tenants/:tenantId/invoices',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin', 'operator', 'viewer'),
  async (req, res, next) => {
    try {
      const invoices = await billingService.listInvoices(req.params['tenantId'], {
        status: req.query['status'] as InvoiceStatus | undefined,
        since: req.query['since'] ? new Date(req.query['since'] as string) : undefined,
        limit: req.query['limit'] ? Number(req.query['limit']) : undefined,
      });
      res.json({ success: true, data: invoices });
    } catch (err) {
      next(err);
    }
  },
);

platformRouter.get(
  '/tenants/:tenantId/invoices/:canonicalId',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin', 'operator', 'viewer'),
  async (req, res, next) => {
    try {
      const invoice = await billingService.getInvoice(
        req.params['tenantId'],
        req.params['canonicalId'],
      );
      if (!invoice) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Factura no encontrada' });
        return;
      }
      res.json({ success: true, data: invoice });
    } catch (err) {
      next(err);
    }
  },
);

platformRouter.post(
  '/tenants/:tenantId/invoices/:canonicalId/authorize-cae',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin', 'operator'),
  async (req, res, next) => {
    try {
      await billingService.authorizeCae({
        tenantId: req.params['tenantId'],
        canonicalId: req.params['canonicalId'],
        sourceSystem: req.body.sourceSystem,
        cae: req.body.cae,
        caeExpiryDate: new Date(req.body.caeExpiryDate),
      });
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  },
);

platformRouter.post(
  '/tenants/:tenantId/invoices/:canonicalId/void',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin', 'operator'),
  async (req, res, next) => {
    try {
      await billingService.voidInvoice({
        tenantId: req.params['tenantId'],
        canonicalId: req.params['canonicalId'],
        sourceSystem: req.body.sourceSystem,
        reason: req.body.reason,
      });
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  },
);

platformRouter.get(
  '/tenants/:tenantId/invoices/:canonicalId/compare',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin', 'operator', 'viewer'),
  async (req, res, next) => {
    try {
      const result = await billingService.compareAcrossSystems({
        tenantId: req.params['tenantId'],
        canonicalId: req.params['canonicalId'],
      });
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },
);

// ─── Catalog ─────────────────────────────────────────────────────────────────

platformRouter.post(
  '/tenants/:tenantId/products',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin', 'operator'),
  async (req, res, next) => {
    try {
      const product = await catalogService.publishProduct({
        tenantId: req.params['tenantId'],
        sourceSystem: req.body.sourceSystem,
        product: req.body.product,
      });
      res.status(201).json({ success: true, data: product });
    } catch (err) {
      next(err);
    }
  },
);

platformRouter.get(
  '/tenants/:tenantId/products',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin', 'operator', 'viewer'),
  async (req, res, next) => {
    try {
      const products = await catalogService.listProducts(req.params['tenantId'], {
        status: req.query['status'] as ProductStatus | undefined,
        since: req.query['since'] ? new Date(req.query['since'] as string) : undefined,
        limit: req.query['limit'] ? Number(req.query['limit']) : undefined,
      });
      res.json({ success: true, data: products });
    } catch (err) {
      next(err);
    }
  },
);

platformRouter.get(
  '/tenants/:tenantId/products/:canonicalId',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin', 'operator', 'viewer'),
  async (req, res, next) => {
    try {
      const product = await catalogService.getProduct(
        req.params['tenantId'],
        req.params['canonicalId'],
      );
      if (!product) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Producto no encontrado' });
        return;
      }
      res.json({ success: true, data: product });
    } catch (err) {
      next(err);
    }
  },
);

platformRouter.patch(
  '/tenants/:tenantId/products/:canonicalId/price',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin', 'operator'),
  async (req, res, next) => {
    try {
      await catalogService.updatePrice({
        tenantId: req.params['tenantId'],
        canonicalId: req.params['canonicalId'],
        sourceSystem: req.body.sourceSystem,
        newPrice: req.body.price,
        currency: req.body.currency,
      });
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  },
);

platformRouter.post(
  '/tenants/:tenantId/products/:canonicalId/archive',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin', 'operator'),
  async (req, res, next) => {
    try {
      await catalogService.archiveProduct({
        tenantId: req.params['tenantId'],
        canonicalId: req.params['canonicalId'],
        sourceSystem: req.body.sourceSystem,
      });
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  },
);

platformRouter.get(
  '/tenants/:tenantId/price-divergences',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin', 'operator', 'viewer'),
  async (req, res, next) => {
    try {
      const divergences = await catalogService.findPriceDivergences(req.params['tenantId']);
      res.json({ success: true, data: divergences });
    } catch (err) {
      next(err);
    }
  },
);

// ─── Consistency Inspector ───────────────────────────────────────────────────

platformRouter.get(
  '/tenants/:tenantId/consistency/:entityType',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin', 'operator', 'viewer'),
  async (req, res, next) => {
    try {
      const report = await consistencyInspector.inspect(
        req.params['tenantId'],
        req.params['entityType'],
      );
      res.json({ success: true, data: report });
    } catch (err) {
      next(err);
    }
  },
);

platformRouter.get(
  '/tenants/:tenantId/consistency',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin', 'operator', 'viewer'),
  async (req, res, next) => {
    try {
      const entityTypes = req.query['entityTypes']
        ? (req.query['entityTypes'] as string).split(',')
        : undefined;
      const severity = req.query['severity']
        ? (req.query['severity'] as string).split(',') as Array<'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'>
        : undefined;

      const reports = await consistencyInspector.inspectAll(req.params['tenantId'], {
        entityTypes,
        severity,
      });
      res.json({ success: true, data: reports });
    } catch (err) {
      next(err);
    }
  },
);

// ─── Ecommerce ────────────────────────────────────────────────────────────────

// GET /api/tenants/:tenantId/ecommerce/catalog
platformRouter.get(
  '/tenants/:tenantId/ecommerce/catalog',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin', 'operator', 'viewer'),
  async (req, res, next) => {
    try {
      const items = await ecommerceService.listCatalogItems(req.params['tenantId'], {
        status: req.query['status'] as 'draft' | 'published' | 'archived' | undefined,
        limit: req.query['limit'] ? Number(req.query['limit']) : undefined,
        offset: req.query['offset'] ? Number(req.query['offset']) : undefined,
      });
      res.json({ success: true, data: items });
    } catch (err) { next(err); }
  },
);

// GET /api/tenants/:tenantId/ecommerce/catalog/:id
platformRouter.get(
  '/tenants/:tenantId/ecommerce/catalog/:id',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin', 'operator', 'viewer'),
  async (req, res, next) => {
    try {
      const item = await ecommerceService.getCatalogItem(req.params['tenantId'], req.params['id']);
      if (!item) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Catalog item not found' } });
      res.json({ success: true, data: item });
    } catch (err) { next(err); }
  },
);

// POST /api/tenants/:tenantId/ecommerce/catalog/ingest
platformRouter.post(
  '/tenants/:tenantId/ecommerce/catalog/ingest',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin', 'operator'),
  async (req, res, next) => {
    try {
      const item = await ecommerceService.ingestCatalogItem(req.params['tenantId'], req.body);
      res.status(201).json({ success: true, data: item });
    } catch (err) { next(err); }
  },
);

// GET /api/tenants/:tenantId/ecommerce/carts/:cartId
platformRouter.get(
  '/tenants/:tenantId/ecommerce/carts/:cartId',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin', 'operator', 'viewer'),
  async (req, res, next) => {
    try {
      const cart = await ecommerceService.getCart(req.params['tenantId'], req.params['cartId']);
      if (!cart) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Cart not found' } });
      res.json({ success: true, data: cart });
    } catch (err) { next(err); }
  },
);

// POST /api/tenants/:tenantId/ecommerce/carts/:cartId/checkout
platformRouter.post(
  '/tenants/:tenantId/ecommerce/carts/:cartId/checkout',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin', 'operator'),
  async (req, res, next) => {
    try {
      const session = await ecommerceService.startCheckout(req.params['tenantId'], req.params['cartId']);
      res.status(201).json({ success: true, data: session });
    } catch (err) { next(err); }
  },
);

// POST /api/tenants/:tenantId/ecommerce/fulfillment
platformRouter.post(
  '/tenants/:tenantId/ecommerce/fulfillment',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin', 'operator'),
  async (req, res, next) => {
    try {
      await ecommerceService.requestFulfillment(req.params['tenantId'], req.body);
      res.status(202).json({ success: true, data: { queued: true } });
    } catch (err) { next(err); }
  },
);

// POST /api/tenants/:tenantId/ecommerce/carts
platformRouter.post(
  '/tenants/:tenantId/ecommerce/carts',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin', 'operator'),
  async (req, res, next) => {
    try {
      const cart = await ecommerceService.createCart(req.params['tenantId'], req.body);
      res.status(201).json({ success: true, data: cart });
    } catch (err) { next(err); }
  },
);

// POST /api/tenants/:tenantId/ecommerce/carts/:cartId/items
platformRouter.post(
  '/tenants/:tenantId/ecommerce/carts/:cartId/items',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin', 'operator'),
  async (req, res, next) => {
    try {
      const { variantId, quantity } = req.body as { variantId: string; quantity: number };
      const cart = await ecommerceService.addLineItem(req.params['tenantId'], req.params['cartId'], variantId, quantity ?? 1);
      res.json({ success: true, data: cart });
    } catch (err) { next(err); }
  },
);

// PATCH /api/tenants/:tenantId/ecommerce/carts/:cartId/items/:lineItemId
platformRouter.patch(
  '/tenants/:tenantId/ecommerce/carts/:cartId/items/:lineItemId',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin', 'operator'),
  async (req, res, next) => {
    try {
      const { quantity } = req.body as { quantity: number };
      const cart = await ecommerceService.updateLineItemQuantity(req.params['tenantId'], req.params['cartId'], req.params['lineItemId'], quantity);
      res.json({ success: true, data: cart });
    } catch (err) { next(err); }
  },
);

// DELETE /api/tenants/:tenantId/ecommerce/carts/:cartId/items/:lineItemId
platformRouter.delete(
  '/tenants/:tenantId/ecommerce/carts/:cartId/items/:lineItemId',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin', 'operator'),
  async (req, res, next) => {
    try {
      const cart = await ecommerceService.removeLineItem(req.params['tenantId'], req.params['cartId'], req.params['lineItemId']);
      res.json({ success: true, data: cart });
    } catch (err) { next(err); }
  },
);

// PATCH /api/tenants/:tenantId/ecommerce/carts/:cartId/shipping-address
platformRouter.patch(
  '/tenants/:tenantId/ecommerce/carts/:cartId/shipping-address',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin', 'operator'),
  async (req, res, next) => {
    try {
      const cart = await ecommerceService.setShippingAddress(req.params['tenantId'], req.params['cartId'], req.body);
      res.json({ success: true, data: cart });
    } catch (err) { next(err); }
  },
);

// PATCH /api/tenants/:tenantId/ecommerce/carts/:cartId/billing-address
platformRouter.patch(
  '/tenants/:tenantId/ecommerce/carts/:cartId/billing-address',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin', 'operator'),
  async (req, res, next) => {
    try {
      const cart = await ecommerceService.setBillingAddress(req.params['tenantId'], req.params['cartId'], req.body);
      res.json({ success: true, data: cart });
    } catch (err) { next(err); }
  },
);

// POST /api/tenants/:tenantId/ecommerce/carts/:cartId/promotions
platformRouter.post(
  '/tenants/:tenantId/ecommerce/carts/:cartId/promotions',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin', 'operator'),
  async (req, res, next) => {
    try {
      const { code } = req.body as { code: string };
      const cart = await ecommerceService.applyPromotion(req.params['tenantId'], req.params['cartId'], code);
      res.json({ success: true, data: cart });
    } catch (err) { next(err); }
  },
);

// DELETE /api/tenants/:tenantId/ecommerce/carts/:cartId/promotions/:code
platformRouter.delete(
  '/tenants/:tenantId/ecommerce/carts/:cartId/promotions/:code',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin', 'operator'),
  async (req, res, next) => {
    try {
      const cart = await ecommerceService.removePromotion(req.params['tenantId'], req.params['cartId'], req.params['code']);
      res.json({ success: true, data: cart });
    } catch (err) { next(err); }
  },
);

// ─── Discounts ────────────────────────────────────────────────────────────────

// GET /api/tenants/:tenantId/ecommerce/discounts
platformRouter.get(
  '/tenants/:tenantId/ecommerce/discounts',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin', 'operator', 'viewer'),
  async (req, res, next) => {
    try {
      const discounts = await ecommerceService.listDiscounts(req.params['tenantId']);
      res.json({ success: true, data: discounts });
    } catch (err) { next(err); }
  },
);

// POST /api/tenants/:tenantId/ecommerce/discounts
platformRouter.post(
  '/tenants/:tenantId/ecommerce/discounts',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin'),
  async (req, res, next) => {
    try {
      const discount = await ecommerceService.createDiscount(req.params['tenantId'], req.body);
      res.status(201).json({ success: true, data: discount });
    } catch (err) { next(err); }
  },
);

// ─── Customers ────────────────────────────────────────────────────────────────

// POST /api/tenants/:tenantId/ecommerce/customers
platformRouter.post(
  '/tenants/:tenantId/ecommerce/customers',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin', 'operator'),
  async (req, res, next) => {
    try {
      const account = await ecommerceService.createCustomerAccount(req.params['tenantId'], req.body);
      res.status(201).json({ success: true, data: account });
    } catch (err) { next(err); }
  },
);

// GET /api/tenants/:tenantId/ecommerce/customers/:id
platformRouter.get(
  '/tenants/:tenantId/ecommerce/customers/:id',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin', 'operator', 'viewer'),
  async (req, res, next) => {
    try {
      const account = await ecommerceService.getCustomerAccount(req.params['tenantId'], req.params['id']);
      if (!account) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Customer not found' } });
      res.json({ success: true, data: account });
    } catch (err) { next(err); }
  },
);

// PATCH /api/tenants/:tenantId/ecommerce/customers/:id
platformRouter.patch(
  '/tenants/:tenantId/ecommerce/customers/:id',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin', 'operator'),
  async (req, res, next) => {
    try {
      const account = await ecommerceService.updateCustomerAccount(req.params['tenantId'], req.params['id'], req.body);
      res.json({ success: true, data: account });
    } catch (err) { next(err); }
  },
);

// ─── Orders ───────────────────────────────────────────────────────────────────

// GET /api/tenants/:tenantId/ecommerce/orders
platformRouter.get(
  '/tenants/:tenantId/ecommerce/orders',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin', 'operator', 'viewer'),
  async (req, res, next) => {
    try {
      const orders = await ecommerceService.listDraftOrders(req.params['tenantId'], {
        status: req.query['status'] as 'open' | 'completed' | 'canceled' | undefined,
        limit: req.query['limit'] ? Number(req.query['limit']) : undefined,
      });
      res.json({ success: true, data: orders });
    } catch (err) { next(err); }
  },
);

// GET /api/tenants/:tenantId/ecommerce/orders/:id
platformRouter.get(
  '/tenants/:tenantId/ecommerce/orders/:id',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin', 'operator', 'viewer'),
  async (req, res, next) => {
    try {
      const order = await ecommerceService.getDraftOrder(req.params['tenantId'], req.params['id']);
      if (!order) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Order not found' } });
      res.json({ success: true, data: order });
    } catch (err) { next(err); }
  },
);

// POST /api/tenants/:tenantId/ecommerce/orders/:id/cancel
platformRouter.post(
  '/tenants/:tenantId/ecommerce/orders/:id/cancel',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin', 'operator'),
  async (req, res, next) => {
    try {
      const order = await ecommerceService.cancelDraftOrder(req.params['tenantId'], req.params['id']);
      res.json({ success: true, data: order });
    } catch (err) { next(err); }
  },
);

// POST /api/tenants/:tenantId/ecommerce/orders/returns
platformRouter.post(
  '/tenants/:tenantId/ecommerce/orders/returns',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin', 'operator'),
  async (req, res, next) => {
    try {
      const result = await ecommerceService.requestReturn(req.params['tenantId'], req.body);
      res.status(202).json({ success: true, data: result });
    } catch (err) { next(err); }
  },
);
