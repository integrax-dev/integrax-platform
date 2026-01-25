import { z } from 'zod';

// ============================================
// Authentication
// ============================================

export const MercadoPagoAuthSchema = z.object({
  accessToken: z.string().min(1, 'Access token is required'),
});

export type MercadoPagoAuth = z.infer<typeof MercadoPagoAuthSchema>;

// ============================================
// Configuration
// ============================================

export const MercadoPagoConfigSchema = z.object({
  /** Sandbox or production */
  environment: z.enum(['sandbox', 'production']).default('sandbox'),
  /** Webhook secret for signature verification */
  webhookSecret: z.string().optional(),
});

export type MercadoPagoConfig = z.infer<typeof MercadoPagoConfigSchema>;

// ============================================
// Payment
// ============================================

export const PaymentStatusSchema = z.enum([
  'pending',
  'approved',
  'authorized',
  'in_process',
  'in_mediation',
  'rejected',
  'cancelled',
  'refunded',
  'charged_back',
]);

export type PaymentStatus = z.infer<typeof PaymentStatusSchema>;

export const PaymentSchema = z.object({
  id: z.number(),
  status: PaymentStatusSchema,
  status_detail: z.string(),
  date_created: z.string(),
  date_approved: z.string().nullable(),
  money_release_date: z.string().nullable(),
  payment_method_id: z.string(),
  payment_type_id: z.string(),
  issuer_id: z.string().nullable(),
  installments: z.number(),
  transaction_amount: z.number(),
  transaction_amount_refunded: z.number(),
  currency_id: z.string(),
  description: z.string().nullable(),
  external_reference: z.string().nullable(),
  statement_descriptor: z.string().nullable(),
  payer: z.object({
    id: z.string().nullable(),
    email: z.string(),
    identification: z.object({
      type: z.string(),
      number: z.string(),
    }).nullable(),
    first_name: z.string().nullable(),
    last_name: z.string().nullable(),
    phone: z.object({
      area_code: z.string().nullable(),
      number: z.string().nullable(),
    }).nullable(),
  }),
  additional_info: z.object({
    items: z.array(z.object({
      id: z.string(),
      title: z.string(),
      description: z.string().nullable(),
      quantity: z.number(),
      unit_price: z.number(),
    })).optional(),
    payer: z.object({
      first_name: z.string().nullable(),
      last_name: z.string().nullable(),
    }).nullable(),
    shipments: z.object({
      receiver_address: z.object({
        street_name: z.string().nullable(),
        street_number: z.string().nullable(),
        zip_code: z.string().nullable(),
        city_name: z.string().nullable(),
        state_name: z.string().nullable(),
      }).nullable(),
    }).nullable(),
  }).nullable(),
  fee_details: z.array(z.object({
    type: z.string(),
    amount: z.number(),
    fee_payer: z.string(),
  })),
  captured: z.boolean(),
  live_mode: z.boolean(),
  metadata: z.record(z.unknown()).nullable(),
});

export type Payment = z.infer<typeof PaymentSchema>;

// ============================================
// Action Inputs/Outputs
// ============================================

export const GetPaymentInputSchema = z.object({
  paymentId: z.union([z.string(), z.number()]),
});

export const SearchPaymentsInputSchema = z.object({
  externalReference: z.string().optional(),
  status: PaymentStatusSchema.optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  limit: z.number().min(1).max(100).default(30),
  offset: z.number().min(0).default(0),
});

export const RefundPaymentInputSchema = z.object({
  paymentId: z.union([z.string(), z.number()]),
  amount: z.number().positive().optional(),
  reason: z.string().optional(),
});

export const RefundSchema = z.object({
  id: z.number(),
  payment_id: z.number(),
  amount: z.number(),
  status: z.string(),
  date_created: z.string(),
});

export type GetPaymentInput = z.infer<typeof GetPaymentInputSchema>;
export type SearchPaymentsInput = z.infer<typeof SearchPaymentsInputSchema>;
export type RefundPaymentInput = z.infer<typeof RefundPaymentInputSchema>;
export type Refund = z.infer<typeof RefundSchema>;

// ============================================
// Webhook Types
// ============================================

export const WebhookEventSchema = z.object({
  id: z.number(),
  live_mode: z.boolean(),
  type: z.string(),
  date_created: z.string(),
  user_id: z.number(),
  api_version: z.string(),
  action: z.string(),
  data: z.object({
    id: z.string(),
  }),
});

export type WebhookEvent = z.infer<typeof WebhookEventSchema>;
