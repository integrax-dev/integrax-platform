import { createHash } from 'node:crypto';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://integrax:integrax@127.0.0.1:5432/integrax',
});

const tenantId = 'ten_mvp_demo';
const ownerId = 'usr_mvp_demo_owner';
const workflowId = 'schemaDiff-ten_mvp_demo-mercadopago-contabilium';
const reportId = '11111111-1111-4111-8111-111111111111';

const mercadopagoV1 = {
  openapi: '3.0.3',
  info: { title: 'Mercado Pago Payments API', version: '2026-03-01' },
  paths: {
    '/v1/payments': {
      post: {
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['id', 'customer_name', 'total_amount', 'payment_status'],
                properties: {
                  id: { type: 'string' },
                  customer_name: { type: 'string' },
                  customer_email: { type: 'string' },
                  total_amount: { type: 'number' },
                  payment_status: { type: 'string', enum: ['approved', 'pending', 'rejected'] },
                  installments: { type: 'integer' },
                },
              },
            },
          },
        },
      },
    },
  },
};

const mercadopagoV2 = {
  openapi: '3.0.3',
  info: { title: 'Mercado Pago Payments API', version: '2026-04-01' },
  paths: {
    '/v1/payments': {
      post: {
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['id', 'payer_name', 'amount_total', 'payment_status', 'currency'],
                properties: {
                  id: { type: 'string' },
                  payer_name: { type: 'string' },
                  customer_email: { type: 'string' },
                  amount_total: { type: 'number' },
                  payment_status: { type: 'string', enum: ['approved', 'in_process', 'rejected'] },
                  installments: { type: 'integer' },
                  currency: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
  },
};

const contabiliumSchema = {
  openapi: '3.0.3',
  info: { title: 'Contabilium Invoices API', version: '2026-03-15' },
  paths: {
    '/api/facturas': {
      post: {
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['external_id', 'razon_social', 'monto_total', 'estado'],
                properties: {
                  external_id: { type: 'string' },
                  razon_social: { type: 'string' },
                  email: { type: 'string' },
                  monto_total: { type: 'number' },
                  estado: { type: 'string', enum: ['approved', 'pending', 'rejected'] },
                  cuotas: { type: 'integer' },
                  moneda: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
  },
};

const sourceSamples = [
  {
    id: 'pay_1001',
    customer_name: 'Ada Lovelace',
    customer_email: 'ada@example.com',
    total_amount: 15000.5,
    payment_status: 'approved',
    installments: 1,
  },
  {
    id: 'pay_1002',
    payer_name: 'Ada Lovelace',
    customer_email: 'ada@example.com',
    amount_total: 15000.5,
    payment_status: 'in_process',
    installments: 1,
    currency: 'ARS',
  },
];

const targetSamples = [
  {
    external_id: 'pay_1001',
    razon_social: 'Ada Lovelace',
    email: 'ada@example.com',
    monto_total: 15000.5,
    estado: 'approved',
    cuotas: 1,
    moneda: 'ARS',
  },
];

const diffPayload = {
  reportId,
  workflowId,
  tenantId,
  sourceSchemaId: 'mercadopago',
  targetSchemaId: 'contabilium',
  sourceFingerprint: '',
  targetFingerprint: '',
  hasDifferences: true,
  summary: {
    coveragePercent: 86,
    breakingCount: 1,
    nonBreakingCount: 3,
    llmEscalationCount: 0,
  },
  mismatches: {
    addedFields: ['currency'],
    removedFields: ['customer_name', 'total_amount'],
    typeChanges: [],
    renameCandidates: [
      { fromPath: 'customer_name', toPath: 'payer_name', similarityPct: 93 },
      { fromPath: 'total_amount', toPath: 'amount_total', similarityPct: 97 },
      { fromPath: 'payment_status', toPath: 'estado', similarityPct: 76 },
    ],
  },
  mappings: [
    { pathA: 'id', pathB: 'external_id', confidence: 0.99 },
    { pathA: 'payer_name', pathB: 'razon_social', confidence: 0.94 },
    { pathA: 'customer_email', pathB: 'email', confidence: 0.98 },
    { pathA: 'amount_total', pathB: 'monto_total', confidence: 0.97 },
    { pathA: 'payment_status', pathB: 'estado', confidence: 0.78 },
    { pathA: 'installments', pathB: 'cuotas', confidence: 0.88 },
    { pathA: 'currency', pathB: 'moneda', confidence: 0.72 },
  ],
  blueprint: [
    { action: 'identity', path: 'external_id', fromPath: 'id', toPath: 'external_id', description: 'Reuse payment id as external_id.' },
    { action: 'rename', path: 'razon_social', fromPath: 'payer_name', toPath: 'razon_social', description: 'Rename payer_name to razon_social.' },
    { action: 'rename', path: 'monto_total', fromPath: 'amount_total', toPath: 'monto_total', description: 'Rename amount_total to monto_total.' },
    { action: 'rename', path: 'estado', fromPath: 'payment_status', toPath: 'estado', description: 'Map payment_status to estado with enum review.' },
  ],
  generatedTransformTs: `export function mapMercadoPagoToContabilium(input) {
  return {
    external_id: input.id,
    razon_social: input.payer_name,
    email: input.customer_email,
    monto_total: input.amount_total,
    estado: input.payment_status === 'in_process' ? 'pending' : input.payment_status,
    cuotas: input.installments,
    moneda: input.currency ?? 'ARS',
  };
}`,
  requiresLLMFallback: false,
  llmEscalations: [],
  fullSchemaA: mercadopagoV2,
  fullSchemaB: contabiliumSchema,
  sampleInventory: {
    sourceInputCount: sourceSamples.length,
    targetInputCount: targetSamples.length,
    sourceEffectiveCount: sourceSamples.length,
    targetEffectiveCount: targetSamples.length,
    sourceReservoirCount: sourceSamples.length,
    targetReservoirCount: targetSamples.length,
  },
};

function fingerprint(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
}

async function seedTenant(): Promise<void> {
  await pool.query(
    `INSERT INTO tenants (id, name, plan, status, owner_id, limits, metadata, api_key_hash, webhook_secret)
     VALUES ($1, $2, 'professional', 'active', $3, $4, $5, $6, $7)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       plan = EXCLUDED.plan,
       status = EXCLUDED.status,
       limits = EXCLUDED.limits,
       metadata = EXCLUDED.metadata,
       api_key_hash = EXCLUDED.api_key_hash,
       webhook_secret = EXCLUDED.webhook_secret,
       updated_at = NOW()`,
    [
      tenantId,
      'IntegraX MVP Demo',
      ownerId,
      JSON.stringify({
        requestsPerMinute: 500,
        jobsPerMinute: 1000,
        maxConcurrentJobs: 50,
        maxWorkflows: 25,
        maxConnectors: 10,
        dataRetentionDays: 90,
      }),
      JSON.stringify({ demo: true, scenario: 'mercadopago-contabilium-drift' }),
      createHash('sha256').update('mvp-demo-api-key', 'utf8').digest('hex'),
      'whsec_mvp_demo_seed',
    ],
  );
}

async function seedTenantConnectors(): Promise<void> {
  const connectors = [
    ['tc_demo_mp', 'mercadopago'],
    ['tc_demo_conta', 'contabilium'],
    ['tc_demo_email', 'email'],
  ] as const;

  for (const [id, connectorId] of connectors) {
    await pool.query(
      `INSERT INTO tenant_connectors (id, tenant_id, connector_id, status, credentials, updated_at)
       VALUES ($1, $2, $3, 'configured', '{}'::jsonb, NOW())
       ON CONFLICT (tenant_id, connector_id) DO UPDATE SET
         status = EXCLUDED.status,
         updated_at = NOW()`,
      [id, tenantId, connectorId],
    );
  }
}

async function seedSchemaInventory(): Promise<{ mpV1: string; mpV2: string; conta: string }> {
  const mpV1 = fingerprint(mercadopagoV1);
  const mpV2 = fingerprint(mercadopagoV2);
  const conta = fingerprint(contabiliumSchema);

  for (const [fp, schema] of [
    [mpV1, mercadopagoV1],
    [mpV2, mercadopagoV2],
    [conta, contabiliumSchema],
  ] as const) {
    await pool.query(
      `INSERT INTO schema_inventory (fingerprint, schema_definition)
       VALUES ($1, $2)
       ON CONFLICT (fingerprint) DO NOTHING`,
      [fp, JSON.stringify(schema)],
    );
  }

  return { mpV1, mpV2, conta };
}

async function seedSchemaVersions(fingerprints: { mpV1: string; mpV2: string; conta: string }): Promise<void> {
  await pool.query(
    `DELETE FROM connector_schema_versions
     WHERE tenant_id = $1 AND connector_id IN ('mercadopago', 'contabilium')`,
    [tenantId],
  );

  await pool.query(
    `INSERT INTO connector_schema_versions (connector_id, tenant_id, fingerprint, version_number, metadata)
     VALUES
      ('mercadopago', $1, $2, 1, $4),
      ('mercadopago', $1, $3, 2, $5),
      ('contabilium', $1, $6, 1, $7)`,
    [
      tenantId,
      fingerprints.mpV1,
      fingerprints.mpV2,
      JSON.stringify({ source: 'mvp-demo', label: 'baseline', version: '2026-03-01' }),
      JSON.stringify({ source: 'mvp-demo', label: 'changed', version: '2026-04-01' }),
      fingerprints.conta,
      JSON.stringify({ source: 'mvp-demo', label: 'target', version: '2026-03-15' }),
    ],
  );
}

async function seedReservoirSamples(): Promise<void> {
  await pool.query(
    `DELETE FROM schema_sample_reservoir
     WHERE tenant_id = $1 AND schema_id IN ('mercadopago', 'contabilium')`,
    [tenantId],
  );

  for (const sample of sourceSamples) {
    await pool.query(
      `INSERT INTO schema_sample_reservoir (tenant_id, schema_id, sample_hash, sample_payload, captured_at)
       VALUES ($1, 'mercadopago', $2, $3, NOW())
       ON CONFLICT (tenant_id, schema_id, sample_hash) DO UPDATE SET
         sample_payload = EXCLUDED.sample_payload,
         captured_at = NOW()`,
      [tenantId, fingerprint(sample), JSON.stringify(sample)],
    );
  }

  for (const sample of targetSamples) {
    await pool.query(
      `INSERT INTO schema_sample_reservoir (tenant_id, schema_id, sample_hash, sample_payload, captured_at)
       VALUES ($1, 'contabilium', $2, $3, NOW())
       ON CONFLICT (tenant_id, schema_id, sample_hash) DO UPDATE SET
         sample_payload = EXCLUDED.sample_payload,
         captured_at = NOW()`,
      [tenantId, fingerprint(sample), JSON.stringify(sample)],
    );
  }
}

async function seedReport(fingerprints: { mpV2: string; conta: string }): Promise<void> {
  diffPayload.sourceFingerprint = fingerprints.mpV2;
  diffPayload.targetFingerprint = fingerprints.conta;

  await pool.query(
    `DELETE FROM schema_diff_reports WHERE id = $1`,
    [reportId],
  );

  await pool.query(
    `INSERT INTO schema_diff_reports (
      id, workflow_id, tenant_id, source_connector_id, target_connector_id,
      source_fingerprint, target_fingerprint, has_differences, diff_payload, created_at
    )
    VALUES ($1, $2, $3, 'mercadopago', 'contabilium', $4, $5, true, $6, NOW())`,
    [
      reportId,
      workflowId,
      tenantId,
      fingerprints.mpV2,
      fingerprints.conta,
      JSON.stringify(diffPayload),
    ],
  );
}

async function seedMappingMemory(): Promise<void> {
  await pool.query(
    `DELETE FROM schema_mapping_memory
     WHERE tenant_id = $1
       AND source_connector_id = 'mercadopago'
       AND target_connector_id = 'contabilium'`,
    [tenantId],
  );

  const entries = [
    ['id', 'external_id', 12, 0, 0.99],
    ['payer_name', 'razon_social', 5, 1, 0.94],
    ['amount_total', 'monto_total', 9, 0, 0.97],
    ['payment_status', 'estado', 3, 2, 0.78],
  ] as const;

  for (const [sourcePath, targetPath, acceptedCount, rejectedCount, averageConfidence] of entries) {
    await pool.query(
      `INSERT INTO schema_mapping_memory (
        tenant_id, source_connector_id, target_connector_id, source_path, target_path,
        accepted_count, rejected_count, average_confidence, last_report_id, last_accepted_at, updated_at
      )
      VALUES ($1, 'mercadopago', 'contabilium', $2, $3, $4, $5, $6, $7, NOW(), NOW())
      ON CONFLICT (tenant_id, source_connector_id, target_connector_id, source_path, target_path)
      DO UPDATE SET
        accepted_count = EXCLUDED.accepted_count,
        rejected_count = EXCLUDED.rejected_count,
        average_confidence = EXCLUDED.average_confidence,
        last_report_id = EXCLUDED.last_report_id,
        last_accepted_at = NOW(),
        updated_at = NOW()`,
      [tenantId, sourcePath, targetPath, acceptedCount, rejectedCount, averageConfidence, reportId],
    );
  }
}

async function main(): Promise<void> {
  console.log('Seeding IntegraX MVP demo scenario...');
  await seedTenant();
  await seedTenantConnectors();
  const fingerprints = await seedSchemaInventory();
  await seedSchemaVersions(fingerprints);
  await seedReservoirSamples();
  await seedReport(fingerprints);
  await seedMappingMemory();

  console.log('MVP demo seed completed.');
  console.log(`Tenant: ${tenantId}`);
  console.log(`Report: ${reportId}`);
  console.log(`Workflow: ${workflowId}`);
}

main()
  .catch(error => {
    console.error('Failed to seed MVP demo scenario');
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
