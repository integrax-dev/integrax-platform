import { SchemaBridge } from '../src/bridge';

async function runSmokeTest() {
  console.log('--- Iniciando IntegraX Smoke Test: Similarity Engine (SAP vs Coupa) ---');

  const bridge = new SchemaBridge();

  console.log('Generando reporte entre SAP Schema y Coupa Schema en base a muestras...');
  const report = await bridge.compare({
    connectorAId: 'sap-erp',
    connectorBId: 'coupa-procurement',
    samplesA: [
      { "BUKRS": "NA-Corp", "LIFNR": "SUP-000100", "NAME1": "Acme Corp",     "ORT01": "Berlin",    "WAERS": "EUR" },
      { "BUKRS": "EU-Corp", "LIFNR": "SUP-000200", "NAME1": "Beta GmbH",     "ORT01": "Munich",    "WAERS": "USD" },
      { "BUKRS": "AR-Corp", "LIFNR": "SUP-000300", "NAME1": "Gamma SA",      "ORT01": "Vienna",    "WAERS": "GBP" },
    ],
    samplesB: [
      { "companyCode": "NA-Corp", "supplierNumber": "SUP-000100", "supplierName": "Acme Corp",  "city": "Berlin", "currencyCode": "EUR" },
      { "companyCode": "EU-Corp", "supplierNumber": "SUP-000200", "supplierName": "Beta GmbH",  "city": "Munich", "currencyCode": "USD" },
      { "companyCode": "AR-Corp", "supplierNumber": "SUP-000300", "supplierName": "Gamma SA",   "city": "Vienna", "currencyCode": "GBP" },
    ],
  });

  console.log('\n--- MAPEOS ENCONTRADOS ---');
  if (report.mappings.length === 0) {
    console.warn('⚠️ No se encontraron mapeos.');
  } else {
    report.mappings.forEach(m => {
      console.log(`[${(m.confidence * 100).toFixed(1)}%] ${m.pathA}  ->  ${m.pathB} (${m.transform.kind})`);
    });
  }

  console.log('\n--- CONFLICTOS O ESCALACIONES LLM ---');
  if (report.requirementsReport.llmEscalations.length === 0) {
    console.log('✅ 0 dependencias al LLM. El motor resolvió todo de forma determinista/heurística.');
  } else {
    report.requirementsReport.llmEscalations.forEach(e => {
      console.log(`❌ Escalando a LLM: ${e.reason} (Path A: ${e.diff.pathA}, Path B: ${e.diff.pathB})`);
    });
  }

  console.log('\n--- ESTADO DEL TEST ---');
  const hasMatchedKeyFields = report.mappings.some(m => m.pathA === 'BUKRS' && m.pathB === 'companyCode');
  const hasMatchedName = report.mappings.some(m => m.pathA === 'NAME1' && m.pathB === 'supplierName');

  if (hasMatchedKeyFields && hasMatchedName) {
    console.log('✅ RESULTADO: SUCCESS. El motor identificó correctamente BUKRS->companyCode y NAME1->supplierName.');
    process.exit(0);
  } else {
    console.error('❌ RESULTADO: FAIL. El motor no logró mapear correctamente los campos clave de SAP contra Coupa.');
    // Sugerencia para Claude Code:
    console.log('-> Claude Code: Verifica que el `similarity-engine.ts` incluya sinónimos o diccionarios corporativos como BUKRS=companyCode, LIFNR=supplierNumber.');
    process.exit(1);
  }
}

runSmokeTest().catch(console.error);
