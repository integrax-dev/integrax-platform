import pkg from 'pg';
const { Pool } = pkg;
import { ulid } from 'ulid';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/integrax';

// DB connection
const pool = new Pool({
  connectionString: DATABASE_URL,
});

async function main() {
  console.log('>>> [1/4] Connecting to Database and Setting Up Test Tenant');
  try {
    const tenantId = `test_tenant_${ulid()}`;
    await pool.query(`INSERT INTO tenants (id, name, owner_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [tenantId, 'MVP Tenant', 'user_root']);

    console.log(`>>> [2/4] Testing Manual Link Persistence`);
    // Insert manual link (confidence = 1)
    const { rows: links } = await pool.query(`
         INSERT INTO entity_links
           (tenant_id, entity_type, system_a, external_id_a, system_b, external_id_b, confidence, linked_by)
         VALUES ($1, 'customer', $2, $3, $4, $5, $6, 'operator')
         RETURNING *
    `, [tenantId, 'sql_db', 'id_123', 'csv_file', 'X-123', 1.0]);
    console.log('   ✅ Inserted entity_link:', links[0] ? 'Success' : 'Failed');

    console.log(`>>> [3/4] Testing Auto Review Match Persistence`);
    // Insert a pending review (confidence = 0.88)
    const { rows: reviews } = await pool.query(`
         INSERT INTO entity_match_reviews
           (tenant_id, entity_type, system_a, external_id_a, system_b, external_id_b, confidence, match_reason)
         VALUES ($1, 'customer', $2, $3, $4, $5, $6, $7)
         RETURNING *
    `, [tenantId, 'api_crm', 'crm_444', 'csv_file', 'C-444', 0.88, 'name_similarity']);
    console.log('   ✅ Inserted entity_match_review:', reviews[0] ? 'Success' : 'Failed');

    // Fetch them back to verify memory retention
    console.log(`>>> [4/4] Verifying Data Integrity`);
    const { rows: fetchedLinks } = await pool.query(`SELECT * FROM entity_links WHERE tenant_id = $1`, [tenantId]);
    const { rows: fetchedReviews } = await pool.query(`SELECT * FROM entity_match_reviews WHERE tenant_id = $1`, [tenantId]);

    if (fetchedLinks.length > 0 && fetchedReviews.length > 0) {
      console.log('   🟢 MVP Validation: DB Persistence is WORKING natively.');
      console.log(`      Found ${fetchedLinks.length} links and ${fetchedReviews.length} pending reviews.`);
    } else {
      console.error('   🔴 MVP Validation: FAILED to persist records.');
    }

    // Cleanup
    await pool.query(`DELETE FROM tenants WHERE id = $1`, [tenantId]);
    console.log('>>> Teardown Complete');

  } catch (error) {
    console.error('Database validation encountered an error:', error);
  } finally {
    await pool.end();
  }
}

main().catch(console.error);
