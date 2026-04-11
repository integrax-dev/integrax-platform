declare module '@integrax/reconciliation-engine' {
  export interface ManualLink {
    systemA: string;
    externalIdA: string;
    systemB: string;
    externalIdB: string;
  }

  export interface MatchResult {
    decision: 'match' | 'review' | 'no_match';
    confidence: number;
    reason: string;
  }

  export interface EntityConflict {
    type: string;
    severity: string;
    field?: string;
    message?: string;
    action?: string;
  }

  export interface CanonicalProduct {
    externalIds: Array<{ system: string; id: string }>;
    sku: string;
    title: string;
    brand?: string;
    variant?: string;
    price: number;
    currency: string;
    stock: number;
    status: 'active' | 'inactive' | 'archived';
    updatedAt: Date;
    sourceSystem: string;
  }

  export interface CanonicalCustomer {
    externalIds: Array<{ system: string; id: string }>;
    taxId: string;
    name: string;
    fantasyName?: string;
    email?: string;
    phone?: string;
    address?: string;
    vatStatus?: string;
    status: 'active' | 'inactive';
    updatedAt: Date;
    sourceSystem: string;
  }

  export interface CanonicalInvoice {
    externalIds: Array<{ system: string; id: string }>;
    invoiceNumber: string;
    invoiceType: string | number;
    customerTaxId: string;
    customerName: string;
    amountNet: number;
    amountTax: number;
    amountTotal: number;
    currency: string;
    cae?: string;
    caeExpiryDate?: Date;
    status: 'draft' | 'authorized' | 'voided';
    issuedAt: Date;
    updatedAt: Date;
    sourceSystem: string;
  }

  export function matchProduct(
    a: CanonicalProduct,
    b: CanonicalProduct,
    manualLinks?: ManualLink[],
  ): MatchResult;

  export function diffProducts(
    a: CanonicalProduct,
    b: CanonicalProduct,
    tolerances?: {
      pricePct?: number;
      stockAbs?: number;
    },
  ): EntityConflict[];

  export function evaluateProductConflicts(conflicts: EntityConflict[]): EntityConflict[];
  export function productRecommendation(conflicts: EntityConflict[]): string;

  export function matchCustomer(
    a: CanonicalCustomer,
    b: CanonicalCustomer,
    manualLinks?: ManualLink[],
  ): MatchResult;

  export function diffCustomers(a: CanonicalCustomer, b: CanonicalCustomer): EntityConflict[];
  export function evaluateCustomerConflicts(conflicts: EntityConflict[]): EntityConflict[];
  export function customerRecommendation(conflicts: EntityConflict[]): string;

  export function matchInvoice(
    a: CanonicalInvoice,
    b: CanonicalInvoice,
    manualLinks?: ManualLink[],
  ): MatchResult;

  export function diffInvoices(
    a: CanonicalInvoice,
    b: CanonicalInvoice,
    tolerances?: {
      amountPct?: number;
    },
  ): EntityConflict[];

  export function evaluateInvoiceConflicts(conflicts: EntityConflict[]): EntityConflict[];
  export function invoiceRecommendation(conflicts: EntityConflict[]): string;
}
