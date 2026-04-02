import { SchemaBridge } from '../src/bridge';

type Report = Awaited<ReturnType<SchemaBridge['compare']>>;

type AdversarialScenario = {
  label: string;
  samplesA: Record<string, unknown>[];
  samplesB: Record<string, unknown>[];
  requiredAutoAcceptedMappings?: Array<[string, string]>;
  forbiddenAutoAcceptedMappings?: Array<[string, string]>;
  forbiddenAutoAcceptedSources?: string[];
};

type ScenarioOutcome = {
  label: string;
  incorrectAutoAccepts: string[];
  reviewCount: number;
  rejectCount: number;
  ambiguityHotspots: string[];
};

function renameMappings(report: Report): Array<{ pathA: string | null; pathB: string | null }> {
  return report.mappings
    .filter(mapping => mapping.transform.kind === 'rename')
    .map(mapping => ({ pathA: mapping.pathA, pathB: mapping.pathB }));
}

function hasRename(report: Report, pathA: string, pathB: string): boolean {
  return renameMappings(report).some(mapping => mapping.pathA === pathA && mapping.pathB === pathB);
}

function buildSparseWindow(prefix: string, realValues: string[]): Array<string | null> {
  const values: Array<string | null> = Array.from({ length: 50 }, () => null);
  for (let index = 0; index < realValues.length; index++) {
    values[index] = `${prefix}-${realValues[index]}`;
  }
  return values;
}

const sparseLegacyIds = buildSparseWindow('LEG', ['001', '002', '003', '004', '005']);
const sparseModernIds = buildSparseWindow('LEG', ['001', '002', '003', '004', '005']);

const adversarialScenarios: AdversarialScenario[] = [
  {
    label: 'Sparse Data',
    samplesA: Array.from({ length: 50 }, (_, index) => ({
      legacy_customer_id: sparseLegacyIds[index],
      note: index < 45 ? 'N/A' : `manual-${index}`,
      comments: null,
    })),
    samplesB: Array.from({ length: 50 }, (_, index) => ({
      customerId: sparseModernIds[index],
      comment: index < 45 ? 'N/A' : `manual-${index}`,
      remarks: null,
    })),
    forbiddenAutoAcceptedSources: ['note', 'comments'],
    forbiddenAutoAcceptedMappings: [
      ['note', 'comment'],
      ['comments', 'remarks'],
    ],
  },
  {
    label: 'Placeholder Swamping',
    samplesA: Array.from({ length: 50 }, (_, index) => ({
      order_ref: `ORD-${(index + 1).toString().padStart(3, '0')}`,
      note: 'N/A',
      comment: index % 10 === 0 ? 'TBD' : '-',
    })),
    samplesB: Array.from({ length: 50 }, (_, index) => ({
      orderId: `ORD-${(index + 1).toString().padStart(3, '0')}`,
      internalNote: 'N/A',
      freeText: index % 10 === 0 ? 'TBD' : '-',
    })),
    requiredAutoAcceptedMappings: [['order_ref', 'orderId']],
    forbiddenAutoAcceptedSources: ['note', 'comment'],
  },
  {
    label: 'Zero-Overlap Windows',
    samplesA: Array.from({ length: 50 }, (_, index) => ({
      legacy_customer_id: `CUST-A-${(index + 1).toString().padStart(3, '0')}`,
      tenant_code: `TENANT-${(index % 5) + 1}`,
    })),
    samplesB: Array.from({ length: 50 }, (_, index) => ({
      customerId: `CUST-B-${(index + 51).toString().padStart(3, '0')}`,
      tenantId: `TENANT-${(index % 5) + 1}`,
    })),
    forbiddenAutoAcceptedMappings: [['legacy_customer_id', 'customerId']],
  },
  {
    label: 'Multiple High-Entropy IDs',
    samplesA: [
      { buyer_uuid: '550e8400-e29b-41d4-a716-446655440000', seller_uuid: '660e8400-e29b-41d4-a716-446655440000', tenant_uuid: '770e8400-e29b-41d4-a716-446655440000' },
      { buyer_uuid: '550e8400-e29b-41d4-a716-446655440001', seller_uuid: '660e8400-e29b-41d4-a716-446655440001', tenant_uuid: '770e8400-e29b-41d4-a716-446655440001' },
      { buyer_uuid: '550e8400-e29b-41d4-a716-446655440002', seller_uuid: '660e8400-e29b-41d4-a716-446655440002', tenant_uuid: '770e8400-e29b-41d4-a716-446655440002' },
      { buyer_uuid: '550e8400-e29b-41d4-a716-446655440003', seller_uuid: '660e8400-e29b-41d4-a716-446655440003', tenant_uuid: '770e8400-e29b-41d4-a716-446655440003' },
      { buyer_uuid: '550e8400-e29b-41d4-a716-446655440004', seller_uuid: '660e8400-e29b-41d4-a716-446655440004', tenant_uuid: '770e8400-e29b-41d4-a716-446655440004' },
    ],
    samplesB: [
      { buyerId: '550e8400-e29b-41d4-a716-446655440000', sellerId: '660e8400-e29b-41d4-a716-446655440000', tenantId: '770e8400-e29b-41d4-a716-446655440000' },
      { buyerId: '550e8400-e29b-41d4-a716-446655440001', sellerId: '660e8400-e29b-41d4-a716-446655440001', tenantId: '770e8400-e29b-41d4-a716-446655440001' },
      { buyerId: '550e8400-e29b-41d4-a716-446655440002', sellerId: '660e8400-e29b-41d4-a716-446655440002', tenantId: '770e8400-e29b-41d4-a716-446655440002' },
      { buyerId: '550e8400-e29b-41d4-a716-446655440003', sellerId: '660e8400-e29b-41d4-a716-446655440003', tenantId: '770e8400-e29b-41d4-a716-446655440003' },
      { buyerId: '550e8400-e29b-41d4-a716-446655440004', sellerId: '660e8400-e29b-41d4-a716-446655440004', tenantId: '770e8400-e29b-41d4-a716-446655440004' },
    ],
    requiredAutoAcceptedMappings: [
      ['buyer_uuid', 'buyerId'],
      ['seller_uuid', 'sellerId'],
      ['tenant_uuid', 'tenantId'],
    ],
    forbiddenAutoAcceptedMappings: [
      ['buyer_uuid', 'sellerId'],
      ['buyer_uuid', 'tenantId'],
      ['seller_uuid', 'buyerId'],
    ],
  },
  {
    label: 'Flattened vs Nested',
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
    requiredAutoAcceptedMappings: [
      ['order_lines[*].sku_code', 'order.lines[*].sku'],
      ['order_lines[*].component_code', 'order.lines[*].components[*].id'],
      ['order_lines[*].component_desc', 'order.lines[*].components[*].description'],
    ],
  },
  {
    label: 'Sparse Arrays',
    samplesA: [
      { orders: [{ items: [{ sub_items: [{ component_id: 'CMP-100' }, null] }, { sub_items: [] }] }] },
      { orders: [{ items: [{ sub_items: [{ component_id: 'CMP-200' }] }] }] },
      { orders: [{ items: [{ sub_items: [{ component_id: 'CMP-300' }, null] }] }] },
      { orders: [{ items: [] }] },
      { orders: [] },
    ],
    samplesB: [
      { orders: [{ lines: [{ components: [{ id: 'CMP-100' }] }, { components: [] }] }] },
      { orders: [{ lines: [{ components: [{ id: 'CMP-200' }] }] }] },
      { orders: [{ lines: [{ components: [{ id: 'CMP-300' }] }] }] },
      { orders: [{ lines: [] }] },
      { orders: [] },
    ],
  },
  {
    label: 'Mixed-Type Noise',
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
    forbiddenAutoAcceptedMappings: [['quality_flag', 'confidenceFlag']],
  },
  {
    label: 'Low-Entropy Collisions',
    samplesA: Array.from({ length: 20 }, (_, index) => ({
      lifecycle_status: index % 2 === 0 ? 'ACTIVE' : 'INACTIVE',
      support_comment: index % 3 === 0 ? 'N/A' : 'ACTIVE',
      record_id: `REC-${(index + 1).toString().padStart(3, '0')}`,
    })),
    samplesB: Array.from({ length: 20 }, (_, index) => ({
      state: index % 2 === 0 ? 'ACTIVE' : 'INACTIVE',
      note: index % 3 === 0 ? 'N/A' : 'ACTIVE',
      recordId: `REC-${(index + 1).toString().padStart(3, '0')}`,
    })),
    requiredAutoAcceptedMappings: [['record_id', 'recordId']],
    forbiddenAutoAcceptedSources: ['lifecycle_status', 'support_comment'],
  },
];

async function runScenario(bridge: SchemaBridge, scenario: AdversarialScenario, index: number): Promise<ScenarioOutcome> {
  console.log(`\n--- Adversarial Scenario ${index}: ${scenario.label} ---`);

  const report = await bridge.compare({
    connectorAId: `adv-${index}-source`,
    connectorBId: `adv-${index}-target`,
    samplesA: scenario.samplesA,
    samplesB: scenario.samplesB,
  });

  const acceptedMappings = renameMappings(report);
  acceptedMappings.forEach(mapping => {
    console.log(`[auto-accept] ${mapping.pathA} -> ${mapping.pathB}`);
  });

  const incorrectAutoAccepts: string[] = [];

  for (const [pathA, pathB] of scenario.requiredAutoAcceptedMappings ?? []) {
    if (!hasRename(report, pathA, pathB)) {
      incorrectAutoAccepts.push(`faltó auto-accept esperado: ${pathA} -> ${pathB}`);
    }
  }

  for (const [pathA, pathB] of scenario.forbiddenAutoAcceptedMappings ?? []) {
    if (hasRename(report, pathA, pathB)) {
      incorrectAutoAccepts.push(`auto-accept incorrecto: ${pathA} -> ${pathB}`);
    }
  }

  for (const pathA of scenario.forbiddenAutoAcceptedSources ?? []) {
    const bad = acceptedMappings.find(mapping => mapping.pathA === pathA);
    if (bad) {
      incorrectAutoAccepts.push(`source no debía auto-aceptarse: ${pathA} -> ${bad.pathB}`);
    }
  }

  const reviewCount = report.resolvedConflicts.filter(conflict => conflict.resolution === 'heuristic').length;
  const rejectCount = report.resolvedConflicts.filter(conflict => conflict.resolution === 'ambiguous').length;
  const ambiguityHotspots = report.resolvedConflicts
    .filter(conflict => conflict.resolution !== 'deterministic')
    .slice(0, 5)
    .map(conflict => `${conflict.diff.pathA ?? conflict.diff.pathB}: ${conflict.llmReason ?? 'review needed'}`);

  if (incorrectAutoAccepts.length > 0) {
    throw new Error(incorrectAutoAccepts.join(' | '));
  }

  console.log(`OK: review=${reviewCount}, reject=${rejectCount}`);

  return {
    label: scenario.label,
    incorrectAutoAccepts,
    reviewCount,
    rejectCount,
    ambiguityHotspots,
  };
}

async function runAdversarialSuite() {
  console.log('--- Iniciando IntegraX Adversarial Suite: statistical resilience + deep arrays ---');

const bridge = new SchemaBridge({
  autoAcceptThreshold: 0.88,
  decisionPolicy: { autoAcceptThreshold: 0.88 },
});
  const outcomes: ScenarioOutcome[] = [];

  for (const [index, scenario] of adversarialScenarios.entries()) {
    outcomes.push(await runScenario(bridge, scenario, index + 1));
  }

  const incorrectAutoAcceptCount = outcomes.reduce((sum, outcome) => sum + outcome.incorrectAutoAccepts.length, 0);
  const reviewCount = outcomes.reduce((sum, outcome) => sum + outcome.reviewCount, 0);
  const rejectCount = outcomes.reduce((sum, outcome) => sum + outcome.rejectCount, 0);
  const ambiguityHotspots = outcomes.flatMap(outcome => outcome.ambiguityHotspots).slice(0, 10);

  console.log('\n--- ADVERSARIAL REPORT ---');
  console.log(`incorrectAutoAccepts: ${incorrectAutoAcceptCount}`);
  console.log(`reviewCount: ${reviewCount}`);
  console.log(`rejectCount: ${rejectCount}`);
  console.log('topAmbiguityHotspots:');
  ambiguityHotspots.forEach(hotspot => console.log(`- ${hotspot}`));
  console.log('\nRESULTADO: SUCCESS. La suite adversarial no detectó auto-accepts incorrectos.');
}

runAdversarialSuite().catch(error => {
  console.error('\n--- ADVERSARIAL REPORT ---');
  console.error('RESULTADO: FAIL.', error);
  process.exit(1);
});
