export type SyntheticPositiveScenario = {
  key: string;
  connectorAId: string;
  connectorBId: string;
  samplesA: Record<string, unknown>[];
  samplesB: Record<string, unknown>[];
  requiredMappings: Array<[string, string]>;
  forbiddenSources?: string[];
  allowedLlmEscalations?: number;
};

export type SyntheticAdversarialScenario = {
  key: string;
  connectorAId: string;
  connectorBId: string;
  samplesA: Record<string, unknown>[];
  samplesB: Record<string, unknown>[];
  requiredMappings?: Array<[string, string]>;
  forbiddenMappings?: Array<[string, string]>;
  forbiddenSources?: string[];
};

export type SqlDdlFixture = {
  key: string;
  ddl: string;
  expectedFields: Array<{
    path: string;
    type: string;
    required: boolean;
    nullable: boolean;
    format?: string;
  }>;
};

function pad(value: number) {
  return String(value).padStart(3, '0');
}

export const positiveSyntheticScenarios: SyntheticPositiveScenario[] = [
  {
    key: 'mercadopago-billing-latam',
    connectorAId: 'mercadopago',
    connectorBId: 'billing-latam',
    samplesA: [
      { id: 'PAY-1001', monto: '15000,50', moneda: 'ARS', estado: 'approved' },
      { id: 'PAY-1002', monto: '22000,00', moneda: 'ARS', estado: 'pending' },
      { id: 'PAY-1003', monto: '8500,75', moneda: 'USD', estado: 'approved' },
    ],
    samplesB: [
      { payment_id: 'PAY-1001', amount: '15000.50', currency: 'ARS', status: 'approved' },
      { payment_id: 'PAY-1002', amount: '22000.00', currency: 'ARS', status: 'pending' },
      { payment_id: 'PAY-1003', amount: '8500.75', currency: 'USD', status: 'approved' },
    ],
    requiredMappings: [['id', 'payment_id'], ['monto', 'amount'], ['moneda', 'currency'], ['estado', 'status']],
  },
  {
    key: 'afip-invoice-system',
    connectorAId: 'afip-wsfe',
    connectorBId: 'invoice-system',
    samplesA: [
      { nro_comprobante: 'FC-A-00001-00000001', cuit_receptor: '30-11223344-5' },
      { nro_comprobante: 'FC-A-00001-00000002', cuit_receptor: '20-12345678-9' },
      { nro_comprobante: 'FC-B-00001-00000100', cuit_receptor: '27-87654321-0' },
    ],
    samplesB: [
      { invoice_number: 'FC-A-00001-00000001', tax_id: '30-11223344-5' },
      { invoice_number: 'FC-A-00001-00000002', tax_id: '20-12345678-9' },
      { invoice_number: 'FC-B-00001-00000100', tax_id: '27-87654321-0' },
    ],
    requiredMappings: [['nro_comprobante', 'invoice_number'], ['cuit_receptor', 'tax_id']],
  },
  {
    key: 'softland-quickbooks',
    connectorAId: 'softland',
    connectorBId: 'quickbooks',
    samplesA: [
      { folio: 'F-10001', rut_cliente: '76.123.456-7', neto: '120000,00' },
      { folio: 'F-10002', rut_cliente: '12.345.678-9', neto: '85000,50' },
      { folio: 'F-10003', rut_cliente: '98.765.432-1', neto: '200000,00' },
    ],
    samplesB: [
      { DocNumber: 'F-10001', CustomerRef: '76.123.456-7', Subtotal: '120000.00' },
      { DocNumber: 'F-10002', CustomerRef: '12.345.678-9', Subtotal: '85000.50' },
      { DocNumber: 'F-10003', CustomerRef: '98.765.432-1', Subtotal: '200000.00' },
    ],
    requiredMappings: [['folio', 'DocNumber'], ['rut_cliente', 'CustomerRef']],
    allowedLlmEscalations: 1,
  },
  {
    key: 'oracle-ebs-sap-s4',
    connectorAId: 'oracle-ebs',
    connectorBId: 'sap-s4',
    samplesA: [
      { po_number: 'PO-2024-001', vendor_id: 'PROV-100', line_amount: '15000,50', currency_code: 'ARS' },
      { po_number: 'PO-2024-002', vendor_id: 'PROV-200', line_amount: '8750,75', currency_code: 'BRL' },
      { po_number: 'PO-2024-003', vendor_id: 'PROV-300', line_amount: '22000,00', currency_code: 'USD' },
    ],
    samplesB: [
      { EBELN: 'PO-2024-001', LIFNR: 'PROV-100', NETWR: '15000.50', WAERS: 'ARS' },
      { EBELN: 'PO-2024-002', LIFNR: 'PROV-200', NETWR: '8750.75', WAERS: 'BRL' },
      { EBELN: 'PO-2024-003', LIFNR: 'PROV-300', NETWR: '22000.00', WAERS: 'USD' },
    ],
    requiredMappings: [['po_number', 'EBELN'], ['vendor_id', 'LIFNR'], ['currency_code', 'WAERS']],
    allowedLlmEscalations: 1,
  },
  {
    key: 'flat-vs-nested-components',
    connectorAId: 'flat-a',
    connectorBId: 'nested-b',
    samplesA: [
      { order_lines: [{ sku_code: 'SKU-100', component_code: 'CMP-100', component_desc: 'Valve Kit' }] },
      { order_lines: [{ sku_code: 'SKU-200', component_code: 'CMP-200', component_desc: 'Rotor Kit' }] },
      { order_lines: [{ sku_code: 'SKU-300', component_code: 'CMP-300', component_desc: 'Seal Kit' }] },
    ],
    samplesB: [
      { order: { lines: [{ sku: 'SKU-100', components: [{ id: 'CMP-100', description: 'Valve Kit' }] }] } },
      { order: { lines: [{ sku: 'SKU-200', components: [{ id: 'CMP-200', description: 'Rotor Kit' }] }] } },
      { order: { lines: [{ sku: 'SKU-300', components: [{ id: 'CMP-300', description: 'Seal Kit' }] }] } },
    ],
    requiredMappings: [
      ['order_lines[*].sku_code', 'order.lines[*].sku'],
      ['order_lines[*].component_code', 'order.lines[*].components[*].id'],
      ['order_lines[*].component_desc', 'order.lines[*].components[*].description'],
    ],
  },
  {
    key: 'multi-currency-latam',
    connectorAId: 'latam-source',
    connectorBId: 'latam-target',
    samplesA: [
      { txn_ref: 'T-001', moneda: 'ARS', monto: '15000,00', pais: 'ARG' },
      { txn_ref: 'T-002', moneda: 'BRL', monto: '3200,50', pais: 'BRA' },
      { txn_ref: 'T-003', moneda: 'MXN', monto: '8500,00', pais: 'MEX' },
    ],
    samplesB: [
      { transaction_id: 'T-001', currency: 'ARS', amount: '15000.00', country: 'ARG' },
      { transaction_id: 'T-002', currency: 'BRL', amount: '3200.50', country: 'BRA' },
      { transaction_id: 'T-003', currency: 'MXN', amount: '8500.00', country: 'MEX' },
    ],
    requiredMappings: [['txn_ref', 'transaction_id'], ['moneda', 'currency'], ['monto', 'amount'], ['pais', 'country']],
  },
];

export const adversarialSyntheticScenarios: SyntheticAdversarialScenario[] = [
  {
    key: 'sparse-data',
    connectorAId: 'sparse-a',
    connectorBId: 'sparse-b',
    samplesA: Array.from({ length: 20 }, (_, i) => ({
      legacy_customer_id: i < 5 ? `LEG-${pad(i + 1)}` : null,
      note: i < 17 ? 'N/A' : `manual-${i}`,
      comments: null,
    })),
    samplesB: Array.from({ length: 20 }, (_, i) => ({
      customerId: i < 5 ? `LEG-${pad(i + 1)}` : null,
      comment: i < 17 ? 'N/A' : `manual-${i}`,
      remarks: null,
    })),
    forbiddenMappings: [['note', 'comment'], ['comments', 'remarks']],
    forbiddenSources: ['note', 'comments'],
  },
  {
    key: 'placeholder-swamping',
    connectorAId: 'placeholder-a',
    connectorBId: 'placeholder-b',
    samplesA: Array.from({ length: 20 }, (_, i) => ({
      order_ref: `ORD-${pad(i + 1)}`,
      note: 'N/A',
      comment: i % 4 === 0 ? 'TBD' : '-',
    })),
    samplesB: Array.from({ length: 20 }, (_, i) => ({
      orderId: `ORD-${pad(i + 1)}`,
      internalNote: 'N/A',
      freeText: i % 4 === 0 ? 'TBD' : '-',
    })),
    requiredMappings: [['order_ref', 'orderId']],
    forbiddenSources: ['note', 'comment'],
  },
  {
    key: 'zero-overlap',
    connectorAId: 'zero-overlap-a',
    connectorBId: 'zero-overlap-b',
    samplesA: Array.from({ length: 20 }, (_, i) => ({
      legacy_customer_id: `CUST-A-${pad(i + 1)}`,
      tenant_code: `TENANT-${(i % 5) + 1}`,
    })),
    samplesB: Array.from({ length: 20 }, (_, i) => ({
      customerId: `CUST-B-${pad(i + 51)}`,
      tenantId: `TENANT-${(i % 5) + 1}`,
    })),
    forbiddenMappings: [['legacy_customer_id', 'customerId']],
  },
  {
    key: 'mixed-type-noise',
    connectorAId: 'mixed-a',
    connectorBId: 'mixed-b',
    samplesA: [
      { order_total: '100.50', order_status: 'approved', quality_flag: 1 },
      { order_total: 101.5, order_status: 'approved', quality_flag: '1' },
      { order_total: null, order_status: 'pending', quality_flag: null },
      { order_total: '102', order_status: 'approved', quality_flag: 1 },
      { order_total: 103, order_status: 'pending', quality_flag: '1' },
    ],
    samplesB: [
      { amount: 100.5, status: 'approved', confidenceFlag: true },
      { amount: 101.5, status: 'approved', confidenceFlag: true },
      { amount: null, status: 'pending', confidenceFlag: null },
      { amount: 102, status: 'approved', confidenceFlag: true },
      { amount: 103, status: 'pending', confidenceFlag: true },
    ],
    forbiddenMappings: [['quality_flag', 'confidenceFlag']],
  },
  {
    key: 'low-entropy-collision',
    connectorAId: 'low-entropy-a',
    connectorBId: 'low-entropy-b',
    samplesA: Array.from({ length: 20 }, (_, i) => ({
      lifecycle_status: i % 2 === 0 ? 'ACTIVE' : 'INACTIVE',
      support_comment: i % 3 === 0 ? 'N/A' : 'ACTIVE',
      record_id: `REC-${pad(i + 1)}`,
    })),
    samplesB: Array.from({ length: 20 }, (_, i) => ({
      state: i % 2 === 0 ? 'ACTIVE' : 'INACTIVE',
      note: i % 3 === 0 ? 'N/A' : 'ACTIVE',
      recordId: `REC-${pad(i + 1)}`,
    })),
    requiredMappings: [['record_id', 'recordId']],
    forbiddenSources: ['lifecycle_status', 'support_comment'],
  },
];

export const sqlDdlFixtures: SqlDdlFixture[] = [
  {
    key: 'basic-user-table',
    ddl: `
      CREATE TABLE users (
        id UUID PRIMARY KEY,
        first_name VARCHAR(100) NOT NULL,
        age INT,
        is_active BOOLEAN NOT NULL,
        created_at TIMESTAMP
      );
    `,
    expectedFields: [
      { path: 'id', type: 'string', format: 'uuid', required: true, nullable: false },
      { path: 'first_name', type: 'string', required: true, nullable: false },
      { path: 'age', type: 'number', required: false, nullable: true },
      { path: 'is_active', type: 'boolean', required: true, nullable: false },
      { path: 'created_at', type: 'string', format: 'date-time', required: false, nullable: true },
    ],
  },
  {
    key: 'table-level-constraints',
    ddl: `
      CREATE TABLE orders (
        order_id INT NOT NULL,
        amount DECIMAL(10,2),
        PRIMARY KEY (order_id),
        CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id)
      );
    `,
    expectedFields: [
      { path: 'order_id', type: 'number', required: true, nullable: false },
      { path: 'amount', type: 'number', required: false, nullable: true },
    ],
  },
  {
    key: 'quoted-identifiers-and-comments',
    ddl: `
      /* customer projection */
      CREATE TABLE [Customers] (
        [CustomerId] UNIQUEIDENTIFIER NOT NULL, -- logical PK
        [FullName] NVARCHAR(200) NOT NULL,
        [Balance] MONEY,
        [Metadata] JSONB,
        PRIMARY KEY ([CustomerId])
      );
    `,
    expectedFields: [
      { path: 'customerid', type: 'string', required: true, nullable: false },
      { path: 'fullname', type: 'string', required: true, nullable: false },
      { path: 'balance', type: 'string', format: 'ar-money-string', required: false, nullable: true },
      { path: 'metadata', type: 'object', required: false, nullable: true },
    ],
  },
  {
    key: 'composite-primary-key',
    ddl: `
      CREATE TABLE line_items (
        order_id BIGINT,
        line_no INT,
        sku VARCHAR(50) NOT NULL,
        quantity NUMERIC(10, 2) NOT NULL,
        PRIMARY KEY (order_id, line_no)
      );
    `,
    expectedFields: [
      { path: 'order_id', type: 'number', required: true, nullable: false },
      { path: 'line_no', type: 'number', required: true, nullable: false },
      { path: 'sku', type: 'string', required: true, nullable: false },
      { path: 'quantity', type: 'number', required: true, nullable: false },
    ],
  },
  {
    key: 'date-and-binary-types',
    ddl: `
      CREATE TABLE audit_log (
        event_id UUID NOT NULL,
        event_date DATE NOT NULL,
        event_time TIMESTAMPTZ,
        payload BYTEA,
        is_replayed BOOL DEFAULT FALSE
      );
    `,
    expectedFields: [
      { path: 'event_id', type: 'string', format: 'uuid', required: true, nullable: false },
      { path: 'event_date', type: 'string', format: 'date', required: true, nullable: false },
      { path: 'event_time', type: 'string', format: 'date-time', required: false, nullable: true },
      { path: 'payload', type: 'string', required: false, nullable: true },
      { path: 'is_replayed', type: 'boolean', required: false, nullable: true },
    ],
  },
];
