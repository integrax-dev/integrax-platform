import type { Invoice, InvoiceStatus } from '@integrax/entities';

export interface CreateInvoiceInput {
  tenantId: string;
  sourceSystem: string;
  invoice: Omit<Invoice, 'id' | 'updatedAt'>;
}

export interface AuthorizeCaeInput {
  tenantId: string;
  canonicalId: string;
  sourceSystem: string;
  cae: string;
  caeExpiryDate: Date;
}

export interface VoidInvoiceInput {
  tenantId: string;
  canonicalId: string;
  sourceSystem: string;
  reason?: string;
}

export interface CompareInvoicesInput {
  tenantId: string;
  canonicalId: string;
}

export interface InvoiceComparisonResult {
  canonicalId: string;
  systems: string[];
  hasConflicts: boolean;
  recommendation: 'PROCEED' | 'ALERT' | 'BLOCK' | 'IGNORE' | 'AUTO_FIX';
  conflicts: Array<{ type: string; severity: string; summary: string }>;
}

export interface BillingModule {
  createInvoice(input: CreateInvoiceInput): Promise<Invoice & { id: string }>;
  authorizeCae(input: AuthorizeCaeInput): Promise<void>;
  voidInvoice(input: VoidInvoiceInput): Promise<void>;
  getInvoice(tenantId: string, canonicalId: string): Promise<Invoice | null>;
  listInvoices(tenantId: string, options?: { status?: InvoiceStatus; since?: Date; limit?: number }): Promise<Invoice[]>;
  compareAcrossSystems(input: CompareInvoicesInput): Promise<InvoiceComparisonResult>;
}
