import { moduleManifest as orders } from '@integrax/module-orders';
import { moduleManifest as inventory } from '@integrax/module-inventory';
import { moduleManifest as billing } from '@integrax/module-billing';
import { moduleManifest as catalog } from '@integrax/module-catalog';
import { moduleManifest as payments } from '@integrax/module-payments';

/**
 * Un Profile agrupa modulos, templates de workflow, entidades y presets de UI
 * para un vertical de negocio especifico. Los profiles NO modifican el
 * comportamiento del core de la plataforma.
 *
 * El profile ecommerce cubre:
 *  - Ciclo de vida de pedidos (orders)
 *  - Gestion de stock (inventory)
 *  - Generacion de facturas y seguimiento de CAE (billing)
 *  - Sincronizacion de catalogo de productos (catalog)
 */

export interface Profile {
  id: string;
  name: string;
  description: string;
  modules: string[];
  defaultWorkflowIds: string[];
  primaryEntities: string[];
  uiPresets: ProfileUiPresets;
}

export interface ProfileUiPresets {
  primaryEntity: string;
  dashboardWidgets: string[];
  defaultSort: { entity: string; field: string; direction: 'asc' | 'desc' };
}

export const ecommerceProfile: Profile = {
  id: 'ecommerce',
  name: 'Ecommerce',
  description: 'Operacion ecommerce multicanal: pedidos, inventario, facturacion y sincronizacion de catalogo',
  modules: [orders.id, inventory.id, billing.id, catalog.id, payments.id],
  defaultWorkflowIds: [
    'order-created-invoice',
    'stock-changed-sync',
    'invoice-failed-alert',
    'price-divergence-notify',
    'payment-captured-fulfill',
    'payment-failed-alert',
  ],
  primaryEntities: ['Order', 'Product', 'Invoice', 'Stock', 'Customer', 'Payment'],
  uiPresets: {
    primaryEntity: 'Order',
    dashboardWidgets: [
      'pending-orders',
      'stock-alerts',
      'invoice-status',
      'price-divergences',
      'consistency-report',
      'payment-summary',
    ],
    defaultSort: { entity: 'order', field: 'createdAt', direction: 'desc' },
  },
};
