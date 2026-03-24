import { SchemaBridge } from '../src/bridge';

function hasMapping(report: Awaited<ReturnType<SchemaBridge['compare']>>, pathA: string, pathB: string): boolean {
  return report.mappings.some(mapping => mapping.pathA === pathA && mapping.pathB === pathB);
}

function hasAnyMappingFrom(report: Awaited<ReturnType<SchemaBridge['compare']>>, pathA: string): boolean {
  return report.mappings.some(mapping => mapping.pathA === pathA);
}

async function runFlatSapScenario(bridge: SchemaBridge): Promise<void> {
  console.log('\n--- Escenario 1: SAP plano vs Coupa ---');
  const report = await bridge.compare({
    connectorAId: 'sap-erp',
    connectorBId: 'coupa-procurement',
    samplesA: [
      { BUKRS: 'NA-Corp', LIFNR: 'SUP-000100', NAME1: 'Acme Corp', ORT01: 'Berlin', WAERS: 'EUR' },
      { BUKRS: 'EU-Corp', LIFNR: 'SUP-000200', NAME1: 'Beta GmbH', ORT01: 'Munich', WAERS: 'USD' },
      { BUKRS: 'AR-Corp', LIFNR: 'SUP-000300', NAME1: 'Gamma SA', ORT01: 'Vienna', WAERS: 'GBP' },
    ],
    samplesB: [
      { companyCode: 'NA-Corp', supplierNumber: 'SUP-000100', supplierName: 'Acme Corp', city: 'Berlin', currencyCode: 'EUR' },
      { companyCode: 'EU-Corp', supplierNumber: 'SUP-000200', supplierName: 'Beta GmbH', city: 'Munich', currencyCode: 'USD' },
      { companyCode: 'AR-Corp', supplierNumber: 'SUP-000300', supplierName: 'Gamma SA', city: 'Vienna', currencyCode: 'GBP' },
    ],
  });

  const success =
    hasMapping(report, 'BUKRS', 'companyCode') &&
    hasMapping(report, 'LIFNR', 'supplierNumber') &&
    hasMapping(report, 'NAME1', 'supplierName') &&
    report.requirementsReport.llmEscalations.length === 0;

  report.mappings.forEach(mapping => {
    console.log(`[${(mapping.confidence * 100).toFixed(1)}%] ${mapping.pathA} -> ${mapping.pathB}`);
  });

  if (!success) {
    throw new Error('Escenario plano fallo: no se detectaron correctamente los campos clave de SAP.');
  }

  console.log('OK: escenario plano sin LLM.');
}

async function runDeepNestedScenario(bridge: SchemaBridge): Promise<void> {
  console.log('\n--- Escenario 2: SAP profundo con segmentos/arrays ---');
  const report = await bridge.compare({
    connectorAId: 'sap-idoc',
    connectorBId: 'target-api',
    samplesA: [
      {
        IDOC: {
          E1BPADDR1: [{ CITY: 'Berlin', POST_CODE: 'DE-10115', STREET: 'Unter den Linden 1' }],
          E1BPMATERIAL: [{ MATNR: 'MAT-001', MAKTX: 'Motor' }],
        },
      },
      {
        IDOC: {
          E1BPADDR1: [{ CITY: 'Munich', POST_CODE: 'DE-80331', STREET: 'Marienplatz 1' }],
          E1BPMATERIAL: [{ MATNR: 'MAT-002', MAKTX: 'Valve' }],
        },
      },
      {
        IDOC: {
          E1BPADDR1: [{ CITY: 'Hamburg', POST_CODE: 'DE-20095', STREET: 'Jungfernstieg 7' }],
          E1BPMATERIAL: [{ MATNR: 'MAT-003', MAKTX: 'Rotor' }],
        },
      },
    ],
    samplesB: [
      {
        addresses: [{ city: 'Berlin', postalCode: 'DE-10115', streetLine: 'Unter den Linden 1' }],
        items: [{ productCode: 'MAT-001', description: 'Motor' }],
      },
      {
        addresses: [{ city: 'Munich', postalCode: 'DE-80331', streetLine: 'Marienplatz 1' }],
        items: [{ productCode: 'MAT-002', description: 'Valve' }],
      },
      {
        addresses: [{ city: 'Hamburg', postalCode: 'DE-20095', streetLine: 'Jungfernstieg 7' }],
        items: [{ productCode: 'MAT-003', description: 'Rotor' }],
      },
    ],
  });

  const success =
    hasMapping(report, 'IDOC.E1BPADDR1[*].CITY', 'addresses[*].city') &&
    hasMapping(report, 'IDOC.E1BPADDR1[*].POST_CODE', 'addresses[*].postalCode') &&
    hasMapping(report, 'IDOC.E1BPMATERIAL[*].MATNR', 'items[*].productCode') &&
    hasMapping(report, 'IDOC.E1BPMATERIAL[*].MAKTX', 'items[*].description') &&
    report.requirementsReport.llmEscalations.length === 0;

  report.mappings.forEach(mapping => {
    console.log(`[${(mapping.confidence * 100).toFixed(1)}%] ${mapping.pathA} -> ${mapping.pathB}`);
  });

  if (!success) {
    throw new Error('Escenario profundo fallo: no se resolvieron correctamente los segmentos SAP anidados.');
  }

  console.log('OK: escenario profundo sin LLM.');
}

async function runFalsePositiveScenario(bridge: SchemaBridge): Promise<void> {
  console.log('\n--- Escenario 3: hardening contra falsos positivos ---');
  const report = await bridge.compare({
    connectorAId: 'legacy-orders',
    connectorBId: 'modern-orders',
    samplesA: [
      { legacy_order_id: 'ORD-001', created_on: '2026-03-01', updated_on: '2026-03-01', note: 'N/A' },
      { legacy_order_id: 'ORD-002', created_on: '2026-03-02', updated_on: '2026-03-02', note: 'N/A' },
      { legacy_order_id: 'ORD-003', created_on: '2026-03-03', updated_on: '2026-03-03', note: 'N/A' },
    ],
    samplesB: [
      { orderId: 'ORD-001', invoiceDate: '2026-03-01', shippedDate: '2026-03-01', comment: 'N/A' },
      { orderId: 'ORD-002', invoiceDate: '2026-03-02', shippedDate: '2026-03-02', comment: 'N/A' },
      { orderId: 'ORD-003', invoiceDate: '2026-03-03', shippedDate: '2026-03-03', comment: 'N/A' },
    ],
  });

  const success =
    hasMapping(report, 'legacy_order_id', 'orderId') &&
    !hasAnyMappingFrom(report, 'created_on') &&
    !hasAnyMappingFrom(report, 'updated_on') &&
    !hasAnyMappingFrom(report, 'note');

  report.mappings.forEach(mapping => {
    console.log(`[${(mapping.confidence * 100).toFixed(1)}%] ${mapping.pathA} -> ${mapping.pathB}`);
  });

  if (!success) {
    throw new Error('Escenario de hardening fallo: se detecto un falso positivo por fechas o placeholders.');
  }

  console.log('OK: sin matches falsos por fechas/placeholders repetidos.');
}

async function runErpVersionUpgradeScenario(bridge: SchemaBridge): Promise<void> {
  console.log('\n--- Escenario 4: cambio de version ERP con nested renames simultaneos ---');
  const report = await bridge.compare({
    connectorAId: 'erp-v1',
    connectorBId: 'erp-v2',
    samplesA: [
      {
        orders: [{
          order_uuid: '550e8400-e29b-41d4-a716-446655440000',
          buyer_email: 'ops@acme.com',
          currency: 'USD',
          ship_to: '-34.6037,-58.3816',
          items: [{ line_code: 'SKU-100', sub_items: [{ component_id: 'CMP-1', component_desc: 'Valve Core' }] }],
        }],
      },
      {
        orders: [{
          order_uuid: '550e8400-e29b-41d4-a716-446655440001',
          buyer_email: 'logistics@beta.com',
          currency: 'EUR',
          ship_to: '48.1371,11.5754',
          items: [{ line_code: 'SKU-200', sub_items: [{ component_id: 'CMP-2', component_desc: 'Rotor Assembly' }] }],
        }],
      },
      {
        orders: [{
          order_uuid: '550e8400-e29b-41d4-a716-446655440002',
          buyer_email: 'supply@gamma.com',
          currency: 'GBP',
          ship_to: '51.5074,-0.1278',
          items: [{ line_code: 'SKU-300', sub_items: [{ component_id: 'CMP-3', component_desc: 'Seal Kit' }] }],
        }],
      },
    ],
    samplesB: [
      {
        salesOrders: [{
          orderId: '550e8400-e29b-41d4-a716-446655440000',
          primaryContact: { emailAddress: 'ops@acme.com' },
          currencyCode: 'USD',
          destination: { latLon: '-34.6037,-58.3816' },
          lines: [{ sku: 'SKU-100', components: [{ id: 'CMP-1', description: 'Valve Core' }] }],
        }],
      },
      {
        salesOrders: [{
          orderId: '550e8400-e29b-41d4-a716-446655440001',
          primaryContact: { emailAddress: 'logistics@beta.com' },
          currencyCode: 'EUR',
          destination: { latLon: '48.1371,11.5754' },
          lines: [{ sku: 'SKU-200', components: [{ id: 'CMP-2', description: 'Rotor Assembly' }] }],
        }],
      },
      {
        salesOrders: [{
          orderId: '550e8400-e29b-41d4-a716-446655440002',
          primaryContact: { emailAddress: 'supply@gamma.com' },
          currencyCode: 'GBP',
          destination: { latLon: '51.5074,-0.1278' },
          lines: [{ sku: 'SKU-300', components: [{ id: 'CMP-3', description: 'Seal Kit' }] }],
        }],
      },
    ],
  });

  const success =
    hasMapping(report, 'orders[*].order_uuid', 'salesOrders[*].orderId') &&
    hasMapping(report, 'orders[*].buyer_email', 'salesOrders[*].primaryContact.emailAddress') &&
    hasMapping(report, 'orders[*].currency', 'salesOrders[*].currencyCode') &&
    hasMapping(report, 'orders[*].ship_to', 'salesOrders[*].destination.latLon') &&
    hasMapping(report, 'orders[*].items[*].line_code', 'salesOrders[*].lines[*].sku') &&
    hasMapping(report, 'orders[*].items[*].sub_items[*].component_id', 'salesOrders[*].lines[*].components[*].id') &&
    hasMapping(report, 'orders[*].items[*].sub_items[*].component_desc', 'salesOrders[*].lines[*].components[*].description') &&
    report.requirementsReport.llmEscalations.length === 0;

  report.mappings.forEach(mapping => {
    console.log(`[${(mapping.confidence * 100).toFixed(1)}%] ${mapping.pathA} -> ${mapping.pathB}`);
  });

  if (!success) {
    throw new Error('Escenario ERP v1->v2 fallo: no se resolvieron correctamente los renombrados anidados simultaneos.');
  }

  console.log('OK: upgrade de version ERP resuelto sin LLM.');
}

async function runSmokeTest() {
  console.log('--- Iniciando IntegraX Smoke Test: Similarity Engine hardening + nested support ---');

  const bridge = new SchemaBridge();

  await runFlatSapScenario(bridge);
  await runDeepNestedScenario(bridge);
  await runFalsePositiveScenario(bridge);
  await runErpVersionUpgradeScenario(bridge);

  console.log('\n--- ESTADO DEL TEST ---');
  console.log('RESULTADO: SUCCESS. El motor resolvio SAP plano, SAP profundo, un upgrade ERP nested y evito falsos positivos obvios sin depender del LLM.');
  process.exit(0);
}

runSmokeTest().catch(error => {
  console.error('\n--- ESTADO DEL TEST ---');
  console.error('RESULTADO: FAIL.', error);
  process.exit(1);
});
