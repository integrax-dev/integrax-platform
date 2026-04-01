import pkg from 'pg';
const { Pool } = pkg;
import { ulid } from 'ulid';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/integrax',
});

async function seed() {
  const tenantId = 'ten_01';
  
  console.log('--- Seeding Tenant ---');
  await pool.query(`
    INSERT INTO tenants (id, name, owner_id)
    VALUES ($1, $2, $3)
    ON CONFLICT (id) DO NOTHING
  `, [tenantId, 'Tenant de Prueba', 'user_01']);

  console.log('--- Seeding Report ---');
  const reportId = 'rep_' + ulid();
  const diffPayload = {
    summary: {
      coveragePercent: 85,
      breakingCount: 1,
      nonBreakingCount: 12
    },
    mappings: [
      { pathA: 'id', pathB: 'external_id', confidence: 0.99 },
      { pathA: 'user.email', pathB: 'customer.email_address', confidence: 0.95 },
      { pathA: 'user.name.first', pathB: 'customer.given_name', confidence: 0.92 },
      { pathA: 'user.name.last', pathB: 'customer.family_name', confidence: 0.92 },
      { pathA: 'order.items[*].id', pathB: 'items[*].product_sku', confidence: 0.88 },
      { pathA: 'order.items[*].price', pathB: 'items[*].unit_price', confidence: 0.90 },
      { pathA: 'order.total', pathB: 'total_amount', confidence: 0.99 },
      { pathA: 'metadata.source_ip', pathB: null, confidence: 0.10 } // Breaking / No mapping
    ]
  };

  await pool.query(`
    INSERT INTO schema_diff_reports (id, tenant_id, workflow_id, source_connector_id, target_connector_id, diff_payload)
    VALUES ($1, $2, $3, $4, $5, $6)
  `, [reportId, tenantId, 'wf_' + ulid(), 'system_a', 'system_b', JSON.stringify(diffPayload)]);

  console.log(`Report created: ${reportId}`);
  
  await pool.end();
}

seed().catch(console.error);
