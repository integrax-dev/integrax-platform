/**
 * Reconciliation Routes
 *
 * Products:
 *   POST /api/reconciliation/products/compare
 *   POST /api/reconciliation/products/link
 *   GET  /api/reconciliation/products/:id/links
 *
 * Customers:
 *   POST /api/reconciliation/customers/compare
 *   POST /api/reconciliation/customers/link
 *   GET  /api/reconciliation/customers/:id/links
 *
 * Invoices:
 *   POST /api/reconciliation/invoices/compare
 *   POST /api/reconciliation/invoices/link
 *   GET  /api/reconciliation/invoices/:id/links
 */

import { Router } from 'express';
import type { IRouter } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { pool } from '../store/db.js';
import {
  matchProduct,
  diffProducts,
  evaluateProductConflicts,
  productRecommendation,
  matchCustomer,
  diffCustomers,
  evaluateCustomerConflicts,
  customerRecommendation,
  matchInvoice,
  diffInvoices,
  evaluateInvoiceConflicts,
  invoiceRecommendation,
} from '@integrax/reconciliation-engine';
import type {
  CanonicalProduct,
  CanonicalCustomer,
  CanonicalInvoice,
  ManualLink,
} from '@integrax/reconciliation-engine';

export const reconciliationRouter: IRouter = Router();

// ─── Input schemas ─────────────────────────────────────────────────────────────

const CanonicalProductSchema = z.object({
  externalIds: z.array(z.object({ system: z.string(), id: z.string() })),
  sku: z.string(),
  title: z.string(),
  brand: z.string().optional(),
  variant: z.string().optional(),
  price: z.number(),
  currency: z.string().length(3),
  stock: z.number(),
  status: z.enum(['active', 'inactive', 'archived']),
  updatedAt: z.string().datetime().transform(s => new Date(s)),
  sourceSystem: z.string(),
});

const CompareProductsSchema = z.object({
  tenantId: z.string().min(1),
  systemA: z.string().min(1),
  productA: CanonicalProductSchema,
  systemB: z.string().min(1),
  productB: CanonicalProductSchema,
  tolerances: z.object({
    pricePct: z.number().min(0).max(1).optional(),
    stockAbs: z.number().min(0).optional(),
  }).optional(),
});

const LinkProductsSchema = z.object({
  tenantId: z.string().min(1),
  systemA: z.string().min(1),
  externalIdA: z.string().min(1),
  systemB: z.string().min(1),
  externalIdB: z.string().min(1),
  confidence: z.number().min(0).max(1).optional(),
});

// ─── POST /products/compare ───────────────────────────────────────────────────

reconciliationRouter.post(
  '/products/compare',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin', 'operator'),
  validate(CompareProductsSchema),
  async (req, res, next) => {
    try {
      const { tenantId, productA, productB, tolerances } = req.body as z.infer<typeof CompareProductsSchema>;

      // Load manual links for this tenant+entity pair
      const { rows: linkRows } = await pool.query<{
        system_a: string; external_id_a: string;
        system_b: string; external_id_b: string;
      }>(
        `SELECT system_a, external_id_a, system_b, external_id_b
         FROM entity_links
         WHERE tenant_id = $1 AND entity_type = 'product'`,
        [tenantId],
      );

      const manualLinks: ManualLink[] = linkRows.map(r => ({
        systemA: r.system_a,
        externalIdA: r.external_id_a,
        systemB: r.system_b,
        externalIdB: r.external_id_b,
      }));

      const match = matchProduct(productA as CanonicalProduct, productB as CanonicalProduct, manualLinks);
      const rawConflicts = diffProducts(productA as CanonicalProduct, productB as CanonicalProduct, tolerances);
      const evaluated = evaluateProductConflicts(rawConflicts);
      const recommendation = productRecommendation(evaluated);

      // Auto-persist 'review' matches to entity_match_reviews
      if (match.decision === 'review') {
        const extA = productA.externalIds[0];
        const extB = productB.externalIds[0];
        if (extA && extB) {
          await pool.query(
            `INSERT INTO entity_match_reviews
               (tenant_id, entity_type, system_a, external_id_a, system_b, external_id_b, confidence, match_reason)
             VALUES ($1, 'product', $2, $3, $4, $5, $6, $7)
             ON CONFLICT DO NOTHING`,
            [tenantId, extA.system, extA.id, extB.system, extB.id, match.confidence, match.reason],
          );
        }
      }

      res.json({
        success: true,
        data: {
          match,
          conflicts: evaluated,
          recommendation,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /products/link ──────────────────────────────────────────────────────

reconciliationRouter.post(
  '/products/link',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin', 'operator'),
  validate(LinkProductsSchema),
  async (req, res, next) => {
    try {
      const { tenantId, systemA, externalIdA, systemB, externalIdB, confidence = 1.0 } =
        req.body as z.infer<typeof LinkProductsSchema>;

      const { rows } = await pool.query(
        `INSERT INTO entity_links
           (tenant_id, entity_type, system_a, external_id_a, system_b, external_id_b, confidence, linked_by)
         VALUES ($1, 'product', $2, $3, $4, $5, $6, 'operator')
         ON CONFLICT ON CONSTRAINT uq_entity_link
         DO UPDATE SET confidence = EXCLUDED.confidence, linked_by = 'operator'
         RETURNING *`,
        [tenantId, systemA, externalIdA, systemB, externalIdB, confidence],
      );

      res.status(201).json({ success: true, data: rows[0] });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /products/:id/links ──────────────────────────────────────────────────

reconciliationRouter.get(
  '/products/:id/links',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin', 'operator', 'viewer'),
  async (req, res, next) => {
    try {
      const tenantId = req.tenantId ?? (req.query.tenantId as string);
      const { id } = req.params;

      // Find all links where this external ID appears on either side
      const { rows } = await pool.query(
        `SELECT * FROM entity_links
         WHERE tenant_id = $1
           AND entity_type = 'product'
           AND (external_id_a = $2 OR external_id_b = $2)
         ORDER BY created_at DESC`,
        [tenantId, id],
      );

      res.json({ success: true, data: rows });
    } catch (err) {
      next(err);
    }
  },
);

// ═══════════════════════════════════════════════════════════════════════════════
// CUSTOMERS
// ═══════════════════════════════════════════════════════════════════════════════

const CanonicalCustomerSchema = z.object({
  externalIds: z.array(z.object({ system: z.string(), id: z.string() })),
  taxId: z.string(),
  name: z.string(),
  fantasyName: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  vatStatus: z.string().optional(),
  status: z.enum(['active', 'inactive']),
  updatedAt: z.string().datetime().transform(s => new Date(s)),
  sourceSystem: z.string(),
});

const CompareCustomersSchema = z.object({
  tenantId: z.string().min(1),
  customerA: CanonicalCustomerSchema,
  customerB: CanonicalCustomerSchema,
});

const LinkEntitySchema = z.object({
  tenantId: z.string().min(1),
  systemA: z.string().min(1),
  externalIdA: z.string().min(1),
  systemB: z.string().min(1),
  externalIdB: z.string().min(1),
  confidence: z.number().min(0).max(1).optional(),
});

// ─── POST /customers/compare ──────────────────────────────────────────────────

reconciliationRouter.post(
  '/customers/compare',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin', 'operator'),
  validate(CompareCustomersSchema),
  async (req, res, next) => {
    try {
      const { tenantId, customerA, customerB } = req.body as z.infer<typeof CompareCustomersSchema>;

      const { rows: linkRows } = await pool.query<{
        system_a: string; external_id_a: string;
        system_b: string; external_id_b: string;
      }>(
        `SELECT system_a, external_id_a, system_b, external_id_b
         FROM entity_links
         WHERE tenant_id = $1 AND entity_type = 'customer'`,
        [tenantId],
      );

      const manualLinks: ManualLink[] = linkRows.map(r => ({
        systemA: r.system_a, externalIdA: r.external_id_a,
        systemB: r.system_b, externalIdB: r.external_id_b,
      }));

      const match = matchCustomer(customerA as CanonicalCustomer, customerB as CanonicalCustomer, manualLinks);
      const rawConflicts = diffCustomers(customerA as CanonicalCustomer, customerB as CanonicalCustomer);
      const evaluated = evaluateCustomerConflicts(rawConflicts);
      const recommendation = customerRecommendation(evaluated);

      if (match.decision === 'review') {
        const extA = customerA.externalIds[0];
        const extB = customerB.externalIds[0];
        if (extA && extB) {
          await pool.query(
            `INSERT INTO entity_match_reviews
               (tenant_id, entity_type, system_a, external_id_a, system_b, external_id_b, confidence, match_reason)
             VALUES ($1, 'customer', $2, $3, $4, $5, $6, $7)
             ON CONFLICT DO NOTHING`,
            [tenantId, extA.system, extA.id, extB.system, extB.id, match.confidence, match.reason],
          );
        }
      }

      res.json({ success: true, data: { match, conflicts: evaluated, recommendation } });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /customers/link ─────────────────────────────────────────────────────

reconciliationRouter.post(
  '/customers/link',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin', 'operator'),
  validate(LinkEntitySchema),
  async (req, res, next) => {
    try {
      const { tenantId, systemA, externalIdA, systemB, externalIdB, confidence = 1.0 } =
        req.body as z.infer<typeof LinkEntitySchema>;

      const { rows } = await pool.query(
        `INSERT INTO entity_links
           (tenant_id, entity_type, system_a, external_id_a, system_b, external_id_b, confidence, linked_by)
         VALUES ($1, 'customer', $2, $3, $4, $5, $6, 'operator')
         ON CONFLICT ON CONSTRAINT uq_entity_link
         DO UPDATE SET confidence = EXCLUDED.confidence, linked_by = 'operator'
         RETURNING *`,
        [tenantId, systemA, externalIdA, systemB, externalIdB, confidence],
      );

      res.status(201).json({ success: true, data: rows[0] });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /customers/:id/links ─────────────────────────────────────────────────

reconciliationRouter.get(
  '/customers/:id/links',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin', 'operator', 'viewer'),
  async (req, res, next) => {
    try {
      const tenantId = req.tenantId ?? (req.query.tenantId as string);
      const { rows } = await pool.query(
        `SELECT * FROM entity_links
         WHERE tenant_id = $1 AND entity_type = 'customer'
           AND (external_id_a = $2 OR external_id_b = $2)
         ORDER BY created_at DESC`,
        [tenantId, req.params.id],
      );
      res.json({ success: true, data: rows });
    } catch (err) {
      next(err);
    }
  },
);

// ═══════════════════════════════════════════════════════════════════════════════
// INVOICES
// ═══════════════════════════════════════════════════════════════════════════════

const CanonicalInvoiceSchema = z.object({
  externalIds: z.array(z.object({ system: z.string(), id: z.string() })),
  invoiceNumber: z.string(),
  invoiceType: z.union([z.number(), z.string()]),
  customerTaxId: z.string(),
  customerName: z.string(),
  amountNet: z.number(),
  amountTax: z.number(),
  amountTotal: z.number(),
  currency: z.string().length(3),
  cae: z.string().optional(),
  caeExpiryDate: z.string().datetime().transform(s => new Date(s)).optional(),
  status: z.enum(['draft', 'authorized', 'voided']),
  issuedAt: z.string().datetime().transform(s => new Date(s)),
  updatedAt: z.string().datetime().transform(s => new Date(s)),
  sourceSystem: z.string(),
});

const CompareInvoicesSchema = z.object({
  tenantId: z.string().min(1),
  invoiceA: CanonicalInvoiceSchema,
  invoiceB: CanonicalInvoiceSchema,
  tolerances: z.object({
    amountPct: z.number().min(0).max(1).optional(),
  }).optional(),
});

// ─── POST /invoices/compare ───────────────────────────────────────────────────

reconciliationRouter.post(
  '/invoices/compare',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin', 'operator'),
  validate(CompareInvoicesSchema),
  async (req, res, next) => {
    try {
      const { tenantId, invoiceA, invoiceB, tolerances } = req.body as z.infer<typeof CompareInvoicesSchema>;

      const { rows: linkRows } = await pool.query<{
        system_a: string; external_id_a: string;
        system_b: string; external_id_b: string;
      }>(
        `SELECT system_a, external_id_a, system_b, external_id_b
         FROM entity_links
         WHERE tenant_id = $1 AND entity_type = 'invoice'`,
        [tenantId],
      );

      const manualLinks: ManualLink[] = linkRows.map(r => ({
        systemA: r.system_a, externalIdA: r.external_id_a,
        systemB: r.system_b, externalIdB: r.external_id_b,
      }));

      const match = matchInvoice(invoiceA as CanonicalInvoice, invoiceB as CanonicalInvoice, manualLinks);
      const rawConflicts = diffInvoices(invoiceA as CanonicalInvoice, invoiceB as CanonicalInvoice, tolerances);
      const evaluated = evaluateInvoiceConflicts(rawConflicts);
      const recommendation = invoiceRecommendation(evaluated);

      if (match.decision === 'review') {
        const extA = invoiceA.externalIds[0];
        const extB = invoiceB.externalIds[0];
        if (extA && extB) {
          await pool.query(
            `INSERT INTO entity_match_reviews
               (tenant_id, entity_type, system_a, external_id_a, system_b, external_id_b, confidence, match_reason)
             VALUES ($1, 'invoice', $2, $3, $4, $5, $6, $7)
             ON CONFLICT DO NOTHING`,
            [tenantId, extA.system, extA.id, extB.system, extB.id, match.confidence, match.reason],
          );
        }
      }

      res.json({ success: true, data: { match, conflicts: evaluated, recommendation } });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /invoices/link ──────────────────────────────────────────────────────

reconciliationRouter.post(
  '/invoices/link',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin', 'operator'),
  validate(LinkEntitySchema),
  async (req, res, next) => {
    try {
      const { tenantId, systemA, externalIdA, systemB, externalIdB, confidence = 1.0 } =
        req.body as z.infer<typeof LinkEntitySchema>;

      const { rows } = await pool.query(
        `INSERT INTO entity_links
           (tenant_id, entity_type, system_a, external_id_a, system_b, external_id_b, confidence, linked_by)
         VALUES ($1, 'invoice', $2, $3, $4, $5, $6, 'operator')
         ON CONFLICT ON CONSTRAINT uq_entity_link
         DO UPDATE SET confidence = EXCLUDED.confidence, linked_by = 'operator'
         RETURNING *`,
        [tenantId, systemA, externalIdA, systemB, externalIdB, confidence],
      );

      res.status(201).json({ success: true, data: rows[0] });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /invoices/:id/links ──────────────────────────────────────────────────

reconciliationRouter.get(
  '/invoices/:id/links',
  requireAuth,
  requireRole('platform_admin', 'tenant_admin', 'operator', 'viewer'),
  async (req, res, next) => {
    try {
      const tenantId = req.tenantId ?? (req.query.tenantId as string);
      const { rows } = await pool.query(
        `SELECT * FROM entity_links
         WHERE tenant_id = $1 AND entity_type = 'invoice'
           AND (external_id_a = $2 OR external_id_b = $2)
         ORDER BY created_at DESC`,
        [tenantId, req.params.id],
      );
      res.json({ success: true, data: rows });
    } catch (err) {
      next(err);
    }
  },
);
