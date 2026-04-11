import fs from 'fs';
import { 
  matchCustomer, 
  diffCustomers, 
  evaluateCustomerConflicts, 
  CanonicalCustomer 
} from '../packages/reconciliation-engine/src/index.js';

async function main() {
  console.log('>>> [1/3] Generating Synthetic Business Dataset (SQL vs CSV)');
  
  // Base memory simulated dataset
  const sqlDataset: CanonicalCustomer[] = Array.from({ length: 50 }, (_, i) => ({
    externalIds: [{ system: 'sql_db', id: `SQL-${i}` }],
    taxId: `20-1234560${i}-9`,
    name: `Empresa Comercializadora Andina S.A. ${i}`,
    email: `contacto_finanzas@empresa${i}.com.ar`,
    vatStatus: 'ResponsableInscripto',
    status: 'active',
    updatedAt: new Date(),
    sourceSystem: 'sql_db',
  }));

  // CSV generated dataset (with heavy noise)
  const csvDataset: CanonicalCustomer[] = sqlDataset.map((c, i) => {
    return {
      externalIds: [{ system: 'csv_file', id: `C-${i}` }],
      // Introduce CUIT formatting drift (remove dashes in odds)
      taxId: i % 2 === 0 ? c.taxId : c.taxId.replace(/-/g, ''),
      // Introduce Name drift (remove accents, use "SA" instead of "S.A.")
      name: i % 3 === 0 ? c.name : `Empresa Comercializadora Ándina SA ${i}`,
      // Introduce Email drift (uppercase in mults of 4, or completely new)
      email: i % 5 === 0 ? 'ventas@empresa.com' : (i % 4 === 0 ? c.email?.toUpperCase() : c.email),
      vatStatus: i % 10 === 0 ? 'Monotributista' : c.vatStatus, // introduce VAT conflict
      status: 'active',
      updatedAt: new Date(),
      sourceSystem: 'csv_file',
    };
  });

  console.log('>>> [2/3] Processing Reconciliations...');
  
  const report = {
    totalEvaluated: sqlDataset.length,
    autoMatched: 0,
    sentToReview: 0,
    noMatches: 0,
    conflictsDetected: {
      CRITICAL: 0,
      HIGH: 0,
      MEDIUM: 0,
      LOW: 0
    },
    sampleReviews: [] as any[]
  };

  // Perform reconciliation pass for each customer
  sqlDataset.forEach((sqlCustomer, idx) => {
    const targetCsv = csvDataset[idx];
    
    // 1. Evaluate Match
    const match = matchCustomer(sqlCustomer as any, targetCsv as any);
    
    if (match.decision === 'match') {
      report.autoMatched++;
    } else if (match.decision === 'review') {
      report.sentToReview++;
      if (report.sampleReviews.length < 5) {
        report.sampleReviews.push({ sqlName: sqlCustomer.name, csvName: targetCsv.name, reason: match.reason, confidence: match.confidence });
      }
    } else {
      report.noMatches++;
    }

    // 2. Evaluate Drifts/Conflicts (Assuming they did match or are being linked)
    if (match.decision !== 'no_match') {
      const drifts = diffCustomers(sqlCustomer as any, targetCsv as any);
      const evaluated = evaluateCustomerConflicts(drifts);
      evaluated.forEach(e => report.conflictsDetected[e.conflict.severity]++);
    }
  });

  console.log(`>>> [3/3] Exporting consistency-report.json`);
  fs.writeFileSync('consistency-report.json', JSON.stringify(report, null, 2));
  
  console.log('\n✅ Report Generated Successfully! Here is the summary:');
  console.log(report);
}

main().catch(console.error);
