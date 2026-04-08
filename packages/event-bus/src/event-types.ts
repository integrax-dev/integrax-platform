/**
 * Registro curado de tipos de evento de la plataforma IntegraX.
 *
 * Agregar un tipo nuevo aca lo vuelve disponible automaticamente para todos los
 * suscriptores. La lista debe mantenerse intencional; no todo cambio interno
 * de estado merece convertirse en un evento de plataforma.
 */
export type IntegraxEventType =
  // --- Pedidos --------------------------------------------------------------
  | 'order.created'
  | 'order.updated'
  | 'order.status_changed'
  | 'order.cancelled'
  // --- Productos ------------------------------------------------------------
  | 'product.created'
  | 'product.updated'
  | 'product.price_changed'
  | 'product.archived'
  // --- Stock ----------------------------------------------------------------
  | 'stock.changed'
  | 'stock.diverged'
  | 'stock.depleted'
  // --- Facturas -------------------------------------------------------------
  | 'invoice.created'
  | 'invoice.authorized'
  | 'invoice.failed'
  | 'invoice.voided'
  // --- Clientes -------------------------------------------------------------
  | 'customer.created'
  | 'customer.updated'
  // --- Envios ---------------------------------------------------------------
  | 'shipment.created'
  | 'shipment.status_changed'
  | 'shipment.delivered'
  // --- Consistencia ---------------------------------------------------------
  | 'conflict.detected'
  | 'conflict.resolved'
  | 'conflict.escalated'
  // --- Identidad ------------------------------------------------------------
  | 'entity.linked'
  | 'entity.unlinked'
  // --- Snapshots ------------------------------------------------------------
  | 'snapshot.updated'
  | 'snapshot.stale'
  // --- Webhook / sistema ----------------------------------------------------
  | 'webhook.received'
  | 'workflow.started'
  | 'workflow.completed'
  | 'workflow.failed'
  // --- Operaciones ----------------------------------------------------------
  | 'operation.submitted'
  | 'operation.succeeded'
  | 'operation.failed'
  | 'operation.approval_required'
  | 'operation.approved'
  | 'operation.rejected';
