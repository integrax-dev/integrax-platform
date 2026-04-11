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
} from '../platform/container.js';

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
        status: req.query['status'] as string | undefined as any,
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
        status: req.query['status'] as any,
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
        status: req.query['status'] as any,
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
        ? (req.query['severity'] as string).split(',') as any[]
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
