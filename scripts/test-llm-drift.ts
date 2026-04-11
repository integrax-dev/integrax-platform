import { DriftAnalyzer } from '../services/llm-orchestrator/src/drift-analyzer.js';

async function main() {
  console.log('>>> [1/3] Instantiating Drift Analyzer (Claude-3.5-Sonnet)');
  
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('🔴 Error: ANTHROPIC_API_KEY not found in environment.');
    console.log('Please run: export ANTHROPIC_API_KEY=sk-ant-api03-... && pnpm exec tsx scripts/test-llm-drift.ts');
    return;
  }

  const analyzer = new DriftAnalyzer({
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    maxTokens: 1500,
  });

  console.log('>>> [2/3] Simulating Financial Discrepancy EvidencePack');
  
  const complexConflict = {
    id: "evt_123",
    connectorId: "mercadopago_to_erp",
    drift: {
      severity: "high",
      detectedAt: new Date().toISOString(),
      baseline: { version: "v1.0.0" },
      current: { version: "v1.1.0" },
      changes: [
        {
          severity: "high",
          type: "type_change",
          description: "Currency mismatch detected (ARS vs USD) pushing amounts to incompatible bounds.",
          path: "invoice.amount_total"
        }
      ]
    },
    httpSamples: [
      {
        method: "POST",
        url: "/api/invoices",
        responseStatus: 400,
        latencyMs: 150,
        error: "Validation failed: amount_total exceeds allowed threshold for currency USD"
      }
    ]
  };

  const payloadStr = JSON.stringify(complexConflict, null, 2);
  console.log('Analyzing Conflict Profile:\n', payloadStr);

  try {
    console.log('\n>>> [3/3] Sending to LLM Engine...');
    console.log('⏳ Waiting for Claude inference...\n');
    
    // Bypass the env check directly here so it definitely tests the API
    process.env.ENABLE_LLM_DRIFT_ANALYSIS = 'true';
    const result = await analyzer.analyze(complexConflict as any);

    console.log('✅ Final Review Payload Generated from AI:\n');
    console.log(JSON.stringify(result, null, 2));

  } catch (err: any) {
    console.error('🔴 Analysis Failed:', err?.message || err);
  }
}

main().catch(console.error);
