import { SchemaBridge } from '../src/bridge';

type Scenario = {
  label: string;
  sourceUrl?: string;
  samplesA: Record<string, unknown>[];
  samplesB: Record<string, unknown>[];
  requiredMappings: Array<[string, string]>;
  forbiddenSources?: string[];
  expectNoLlm?: boolean;
};

function hasMapping(report: Awaited<ReturnType<SchemaBridge['compare']>>, pathA: string, pathB: string): boolean {
  return report.mappings.some(mapping => mapping.pathA === pathA && mapping.pathB === pathB);
}

function hasAnyMappingFrom(report: Awaited<ReturnType<SchemaBridge['compare']>>, pathA: string): boolean {
  return report.mappings.some(mapping => mapping.pathA === pathA);
}

async function runScenario(
  bridge: SchemaBridge,
  scenario: Scenario,
  index: number,
): Promise<void> {
  console.log(`\n--- Escenario ${index}: ${scenario.label} ---`);
  if (scenario.sourceUrl) {
    console.log(`Fuente oficial: ${scenario.sourceUrl}`);
  }

  const report = await bridge.compare({
    connectorAId: `case-${index}-source`,
    connectorBId: `case-${index}-target`,
    samplesA: scenario.samplesA,
    samplesB: scenario.samplesB,
  });

  report.mappings.forEach(mapping => {
    console.log(`[${(mapping.confidence * 100).toFixed(1)}%] ${mapping.pathA} -> ${mapping.pathB}`);
  });

  const missing = scenario.requiredMappings.filter(([pathA, pathB]) => !hasMapping(report, pathA, pathB));
  const forbidden = (scenario.forbiddenSources ?? []).filter(pathA => hasAnyMappingFrom(report, pathA));
  const llmUnexpected = scenario.expectNoLlm !== false && report.requirementsReport.llmEscalations.length > 0;

  if (missing.length > 0 || forbidden.length > 0 || llmUnexpected) {
    const details = [
      missing.length > 0 ? `faltan mappings: ${missing.map(([a, b]) => `${a} -> ${b}`).join(', ')}` : '',
      forbidden.length > 0 ? `mappings prohibidos desde: ${forbidden.join(', ')}` : '',
      llmUnexpected ? `hubo ${report.requirementsReport.llmEscalations.length} escalaciones al LLM` : '',
    ].filter(Boolean).join(' | ');
    throw new Error(`Fallo en "${scenario.label}": ${details}`);
  }

  console.log('OK: escenario resuelto sin LLM.');
}

const baselineScenarios: Scenario[] = [
  {
    label: 'SAP plano vs Coupa',
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
    requiredMappings: [
      ['BUKRS', 'companyCode'],
      ['LIFNR', 'supplierNumber'],
      ['NAME1', 'supplierName'],
      ['ORT01', 'city'],
      ['WAERS', 'currencyCode'],
    ],
  },
  {
    label: 'SAP profundo con segmentos y arrays',
    samplesA: [
      { IDOC: { E1BPADDR1: [{ CITY: 'Berlin', POST_CODE: 'DE-10115', STREET: 'Unter den Linden 1' }], E1BPMATERIAL: [{ MATNR: 'MAT-001', MAKTX: 'Motor' }] } },
      { IDOC: { E1BPADDR1: [{ CITY: 'Munich', POST_CODE: 'DE-80331', STREET: 'Marienplatz 1' }], E1BPMATERIAL: [{ MATNR: 'MAT-002', MAKTX: 'Valve' }] } },
      { IDOC: { E1BPADDR1: [{ CITY: 'Hamburg', POST_CODE: 'DE-20095', STREET: 'Jungfernstieg 7' }], E1BPMATERIAL: [{ MATNR: 'MAT-003', MAKTX: 'Rotor' }] } },
    ],
    samplesB: [
      { addresses: [{ city: 'Berlin', postalCode: 'DE-10115', streetLine: 'Unter den Linden 1' }], items: [{ productCode: 'MAT-001', description: 'Motor' }] },
      { addresses: [{ city: 'Munich', postalCode: 'DE-80331', streetLine: 'Marienplatz 1' }], items: [{ productCode: 'MAT-002', description: 'Valve' }] },
      { addresses: [{ city: 'Hamburg', postalCode: 'DE-20095', streetLine: 'Jungfernstieg 7' }], items: [{ productCode: 'MAT-003', description: 'Rotor' }] },
    ],
    requiredMappings: [
      ['IDOC.E1BPADDR1[*].CITY', 'addresses[*].city'],
      ['IDOC.E1BPADDR1[*].POST_CODE', 'addresses[*].postalCode'],
      ['IDOC.E1BPADDR1[*].STREET', 'addresses[*].streetLine'],
      ['IDOC.E1BPMATERIAL[*].MATNR', 'items[*].productCode'],
      ['IDOC.E1BPMATERIAL[*].MAKTX', 'items[*].description'],
    ],
  },
  {
    label: 'Upgrade ERP con nested renames simultaneos',
    samplesA: [
      { orders: [{ order_uuid: '550e8400-e29b-41d4-a716-446655440000', buyer_email: 'ops@acme.com', currency: 'USD', ship_to: '-34.6037,-58.3816', items: [{ line_code: 'SKU-100', sub_items: [{ component_id: 'CMP-1', component_desc: 'Valve Core' }] }] }] },
      { orders: [{ order_uuid: '550e8400-e29b-41d4-a716-446655440001', buyer_email: 'logistics@beta.com', currency: 'EUR', ship_to: '48.1371,11.5754', items: [{ line_code: 'SKU-200', sub_items: [{ component_id: 'CMP-2', component_desc: 'Rotor Assembly' }] }] }] },
      { orders: [{ order_uuid: '550e8400-e29b-41d4-a716-446655440002', buyer_email: 'supply@gamma.com', currency: 'GBP', ship_to: '51.5074,-0.1278', items: [{ line_code: 'SKU-300', sub_items: [{ component_id: 'CMP-3', component_desc: 'Seal Kit' }] }] }] },
    ],
    samplesB: [
      { salesOrders: [{ orderId: '550e8400-e29b-41d4-a716-446655440000', primaryContact: { emailAddress: 'ops@acme.com' }, currencyCode: 'USD', destination: { latLon: '-34.6037,-58.3816' }, lines: [{ sku: 'SKU-100', components: [{ id: 'CMP-1', description: 'Valve Core' }] }] }] },
      { salesOrders: [{ orderId: '550e8400-e29b-41d4-a716-446655440001', primaryContact: { emailAddress: 'logistics@beta.com' }, currencyCode: 'EUR', destination: { latLon: '48.1371,11.5754' }, lines: [{ sku: 'SKU-200', components: [{ id: 'CMP-2', description: 'Rotor Assembly' }] }] }] },
      { salesOrders: [{ orderId: '550e8400-e29b-41d4-a716-446655440002', primaryContact: { emailAddress: 'supply@gamma.com' }, currencyCode: 'GBP', destination: { latLon: '51.5074,-0.1278' }, lines: [{ sku: 'SKU-300', components: [{ id: 'CMP-3', description: 'Seal Kit' }] }] }] },
    ],
    requiredMappings: [
      ['orders[*].order_uuid', 'salesOrders[*].orderId'],
      ['orders[*].buyer_email', 'salesOrders[*].primaryContact.emailAddress'],
      ['orders[*].currency', 'salesOrders[*].currencyCode'],
      ['orders[*].ship_to', 'salesOrders[*].destination.latLon'],
      ['orders[*].items[*].line_code', 'salesOrders[*].lines[*].sku'],
      ['orders[*].items[*].sub_items[*].component_id', 'salesOrders[*].lines[*].components[*].id'],
      ['orders[*].items[*].sub_items[*].component_desc', 'salesOrders[*].lines[*].components[*].description'],
    ],
  },
];

const officialWebScenarios: Scenario[] = [
  {
    label: 'Stripe customer object',
    sourceUrl: 'https://docs.stripe.com/api/customers/object',
    samplesA: [
      { cust_id: 'cus_A100', mail_addr: 'ops@acme.com', home_city: 'Berlin', default_ccy: 'EUR' },
      { cust_id: 'cus_B200', mail_addr: 'supply@beta.com', home_city: 'Paris', default_ccy: 'USD' },
      { cust_id: 'cus_C300', mail_addr: 'finance@gamma.com', home_city: 'Madrid', default_ccy: 'GBP' },
    ],
    samplesB: [
      { id: 'cus_A100', email: 'ops@acme.com', address: { city: 'Berlin' }, currency: 'EUR' },
      { id: 'cus_B200', email: 'supply@beta.com', address: { city: 'Paris' }, currency: 'USD' },
      { id: 'cus_C300', email: 'finance@gamma.com', address: { city: 'Madrid' }, currency: 'GBP' },
    ],
    requiredMappings: [
      ['cust_id', 'id'],
      ['mail_addr', 'email'],
      ['home_city', 'address.city'],
      ['default_ccy', 'currency'],
    ],
  },
  {
    label: 'Shopify order resource',
    sourceUrl: 'https://shopify.dev/docs/api/admin-rest/latest/resources/order',
    samplesA: [
      { legacy_order_no: '#1001', buyer_mail: 'a@shop.test', ship_ccy: 'USD', rows: [{ sku_code: 'SKU-100' }] },
      { legacy_order_no: '#1002', buyer_mail: 'b@shop.test', ship_ccy: 'EUR', rows: [{ sku_code: 'SKU-200' }] },
      { legacy_order_no: '#1003', buyer_mail: 'c@shop.test', ship_ccy: 'GBP', rows: [{ sku_code: 'SKU-300' }] },
    ],
    samplesB: [
      { name: '#1001', email: 'a@shop.test', currency: 'USD', line_items: [{ sku: 'SKU-100' }] },
      { name: '#1002', email: 'b@shop.test', currency: 'EUR', line_items: [{ sku: 'SKU-200' }] },
      { name: '#1003', email: 'c@shop.test', currency: 'GBP', line_items: [{ sku: 'SKU-300' }] },
    ],
    requiredMappings: [
      ['legacy_order_no', 'name'],
      ['buyer_mail', 'email'],
      ['ship_ccy', 'currency'],
      ['rows[*].sku_code', 'line_items[*].sku'],
    ],
  },
  {
    label: 'HubSpot CRM contacts',
    sourceUrl: 'https://developers.hubspot.com/docs/api-reference/crm-contacts-v3/guide',
    samplesA: [
      { lead_mail: 'one@hub.test', corp_name: 'Acme', mobile_phone: '+49111111111' },
      { lead_mail: 'two@hub.test', corp_name: 'Beta', mobile_phone: '+49111111112' },
      { lead_mail: 'three@hub.test', corp_name: 'Gamma', mobile_phone: '+49111111113' },
    ],
    samplesB: [
      { properties: { email: 'one@hub.test', company: 'Acme', phone: '+49111111111' } },
      { properties: { email: 'two@hub.test', company: 'Beta', phone: '+49111111112' } },
      { properties: { email: 'three@hub.test', company: 'Gamma', phone: '+49111111113' } },
    ],
    requiredMappings: [
      ['lead_mail', 'properties.email'],
      ['corp_name', 'properties.company'],
      ['mobile_phone', 'properties.phone'],
    ],
  },
  {
    label: 'Salesforce account object',
    sourceUrl: 'https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/sforce_api_objects_account.htm',
    samplesA: [
      { account_name: 'Acme GmbH', invoice_city: 'Berlin', main_phone: '+49301234561', site_url: 'https://acme.example' },
      { account_name: 'Beta SAS', invoice_city: 'Paris', main_phone: '+33142223344', site_url: 'https://beta.example' },
      { account_name: 'Gamma Ltd', invoice_city: 'London', main_phone: '+442012340000', site_url: 'https://gamma.example' },
    ],
    samplesB: [
      { Name: 'Acme GmbH', BillingCity: 'Berlin', Phone: '+49301234561', Website: 'https://acme.example' },
      { Name: 'Beta SAS', BillingCity: 'Paris', Phone: '+33142223344', Website: 'https://beta.example' },
      { Name: 'Gamma Ltd', BillingCity: 'London', Phone: '+442012340000', Website: 'https://gamma.example' },
    ],
    requiredMappings: [
      ['account_name', 'Name'],
      ['invoice_city', 'BillingCity'],
      ['main_phone', 'Phone'],
      ['site_url', 'Website'],
    ],
  },
  {
    label: 'Dataverse contact entity',
    sourceUrl: 'https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/contact?view=dataverse-latest',
    samplesA: [
      { full_name: 'Ana Costa', work_mail: 'ana@dataverse.test', office_phone: '+351211111111', town_name: 'Lisbon' },
      { full_name: 'Bruno Dias', work_mail: 'bruno@dataverse.test', office_phone: '+351211111112', town_name: 'Porto' },
      { full_name: 'Carla Nunes', work_mail: 'carla@dataverse.test', office_phone: '+351211111113', town_name: 'Coimbra' },
    ],
    samplesB: [
      { fullname: 'Ana Costa', emailaddress1: 'ana@dataverse.test', telephone1: '+351211111111', address1_city: 'Lisbon' },
      { fullname: 'Bruno Dias', emailaddress1: 'bruno@dataverse.test', telephone1: '+351211111112', address1_city: 'Porto' },
      { fullname: 'Carla Nunes', emailaddress1: 'carla@dataverse.test', telephone1: '+351211111113', address1_city: 'Coimbra' },
    ],
    requiredMappings: [
      ['full_name', 'fullname'],
      ['work_mail', 'emailaddress1'],
      ['office_phone', 'telephone1'],
      ['town_name', 'address1_city'],
    ],
  },
  {
    label: 'QuickBooks invoice entity',
    sourceUrl: 'https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/invoice',
    samplesA: [
      { invoice_no: 'INV-100', invoice_mail: 'ap@acme.test', fx_code: 'USD', rows: [{ item_code: 'ITM-100' }] },
      { invoice_no: 'INV-200', invoice_mail: 'ap@beta.test', fx_code: 'EUR', rows: [{ item_code: 'ITM-200' }] },
      { invoice_no: 'INV-300', invoice_mail: 'ap@gamma.test', fx_code: 'GBP', rows: [{ item_code: 'ITM-300' }] },
    ],
    samplesB: [
      { DocNumber: 'INV-100', BillEmail: { Address: 'ap@acme.test' }, CurrencyRef: { value: 'USD' }, Line: [{ SalesItemLineDetail: { ItemRef: { value: 'ITM-100' } } }] },
      { DocNumber: 'INV-200', BillEmail: { Address: 'ap@beta.test' }, CurrencyRef: { value: 'EUR' }, Line: [{ SalesItemLineDetail: { ItemRef: { value: 'ITM-200' } } }] },
      { DocNumber: 'INV-300', BillEmail: { Address: 'ap@gamma.test' }, CurrencyRef: { value: 'GBP' }, Line: [{ SalesItemLineDetail: { ItemRef: { value: 'ITM-300' } } }] },
    ],
    requiredMappings: [
      ['invoice_no', 'DocNumber'],
      ['invoice_mail', 'BillEmail.Address'],
      ['fx_code', 'CurrencyRef.value'],
      ['rows[*].item_code', 'Line[*].SalesItemLineDetail.ItemRef.value'],
    ],
  },
  {
    label: 'Xero invoices',
    sourceUrl: 'https://developer.xero.com/documentation/api/accounting/invoices',
    samplesA: [
      { invoice_ref: 'X-001', contact_mail: 'billing@acme.test', fx_code: 'USD', detail_lines: [{ sku: 'SKU-1' }] },
      { invoice_ref: 'X-002', contact_mail: 'billing@beta.test', fx_code: 'EUR', detail_lines: [{ sku: 'SKU-2' }] },
      { invoice_ref: 'X-003', contact_mail: 'billing@gamma.test', fx_code: 'GBP', detail_lines: [{ sku: 'SKU-3' }] },
    ],
    samplesB: [
      { InvoiceNumber: 'X-001', Contact: { EmailAddress: 'billing@acme.test' }, CurrencyCode: 'USD', LineItems: [{ ItemCode: 'SKU-1' }] },
      { InvoiceNumber: 'X-002', Contact: { EmailAddress: 'billing@beta.test' }, CurrencyCode: 'EUR', LineItems: [{ ItemCode: 'SKU-2' }] },
      { InvoiceNumber: 'X-003', Contact: { EmailAddress: 'billing@gamma.test' }, CurrencyCode: 'GBP', LineItems: [{ ItemCode: 'SKU-3' }] },
    ],
    requiredMappings: [
      ['invoice_ref', 'InvoiceNumber'],
      ['contact_mail', 'Contact.EmailAddress'],
      ['fx_code', 'CurrencyCode'],
      ['detail_lines[*].sku', 'LineItems[*].ItemCode'],
    ],
  },
  {
    label: 'Zoho CRM records',
    sourceUrl: 'https://www.zoho.com/crm/developer/docs/api/v6/get-records.html',
    samplesA: [
      { lead_email: 'zoho1@test.com', office_phone: '+541111111111', mailing_city: 'Buenos Aires' },
      { lead_email: 'zoho2@test.com', office_phone: '+541111111112', mailing_city: 'Cordoba' },
      { lead_email: 'zoho3@test.com', office_phone: '+541111111113', mailing_city: 'Rosario' },
    ],
    samplesB: [
      { Email: 'zoho1@test.com', Phone: '+541111111111', Mailing_City: 'Buenos Aires' },
      { Email: 'zoho2@test.com', Phone: '+541111111112', Mailing_City: 'Cordoba' },
      { Email: 'zoho3@test.com', Phone: '+541111111113', Mailing_City: 'Rosario' },
    ],
    requiredMappings: [
      ['lead_email', 'Email'],
      ['office_phone', 'Phone'],
      ['mailing_city', 'Mailing_City'],
    ],
  },
  {
    label: 'Freshdesk contacts',
    sourceUrl: 'https://developers.freshdesk.com/api/#contacts',
    samplesA: [
      { support_email: 'help@acme.test', cell_phone: '+12025550101', org_name: 'Acme Support' },
      { support_email: 'help@beta.test', cell_phone: '+12025550102', org_name: 'Beta Support' },
      { support_email: 'help@gamma.test', cell_phone: '+12025550103', org_name: 'Gamma Support' },
    ],
    samplesB: [
      { email: 'help@acme.test', mobile: '+12025550101', company_name: 'Acme Support' },
      { email: 'help@beta.test', mobile: '+12025550102', company_name: 'Beta Support' },
      { email: 'help@gamma.test', mobile: '+12025550103', company_name: 'Gamma Support' },
    ],
    requiredMappings: [
      ['support_email', 'email'],
      ['cell_phone', 'mobile'],
      ['org_name', 'company_name'],
    ],
  },
  {
    label: 'Mailchimp list members',
    sourceUrl: 'https://mailchimp.com/developer/marketing/api/list-members/',
    samplesA: [
      { subscriber_email: 'mc1@test.com', given_name: 'Ana', family_name: 'Costa' },
      { subscriber_email: 'mc2@test.com', given_name: 'Bruno', family_name: 'Dias' },
      { subscriber_email: 'mc3@test.com', given_name: 'Carla', family_name: 'Nunes' },
    ],
    samplesB: [
      { email_address: 'mc1@test.com', merge_fields: { FNAME: 'Ana', LNAME: 'Costa' } },
      { email_address: 'mc2@test.com', merge_fields: { FNAME: 'Bruno', LNAME: 'Dias' } },
      { email_address: 'mc3@test.com', merge_fields: { FNAME: 'Carla', LNAME: 'Nunes' } },
    ],
    requiredMappings: [
      ['subscriber_email', 'email_address'],
      ['given_name', 'merge_fields.FNAME'],
      ['family_name', 'merge_fields.LNAME'],
    ],
  },
  {
    label: 'BigCommerce orders',
    sourceUrl: 'https://developer.bigcommerce.com/docs/rest-management/orders',
    samplesA: [
      { buyer_mail: 'bc1@test.com', store_ccy: 'USD', ship_city: 'Austin', order_rows: [{ sku_code: 'BC-SKU-1' }] },
      { buyer_mail: 'bc2@test.com', store_ccy: 'EUR', ship_city: 'Berlin', order_rows: [{ sku_code: 'BC-SKU-2' }] },
      { buyer_mail: 'bc3@test.com', store_ccy: 'GBP', ship_city: 'London', order_rows: [{ sku_code: 'BC-SKU-3' }] },
    ],
    samplesB: [
      { billing_address: { email: 'bc1@test.com' }, currency_code: 'USD', shipping_addresses: [{ city: 'Austin' }], products: [{ sku: 'BC-SKU-1' }] },
      { billing_address: { email: 'bc2@test.com' }, currency_code: 'EUR', shipping_addresses: [{ city: 'Berlin' }], products: [{ sku: 'BC-SKU-2' }] },
      { billing_address: { email: 'bc3@test.com' }, currency_code: 'GBP', shipping_addresses: [{ city: 'London' }], products: [{ sku: 'BC-SKU-3' }] },
    ],
    requiredMappings: [
      ['buyer_mail', 'billing_address.email'],
      ['store_ccy', 'currency_code'],
      ['ship_city', 'shipping_addresses[*].city'],
      ['order_rows[*].sku_code', 'products[*].sku'],
    ],
  },
  {
    label: 'Square orders API',
    sourceUrl: 'https://developer.squareup.com/reference/square/orders-api',
    samplesA: [
      { ticket_ccy: 'USD', order_rows: [{ catalog_code: 'SQ-100', qty_value: 'SQ-1501' }] },
      { ticket_ccy: 'EUR', order_rows: [{ catalog_code: 'SQ-200', qty_value: 'SQ-2502' }] },
      { ticket_ccy: 'GBP', order_rows: [{ catalog_code: 'SQ-300', qty_value: 'SQ-3503' }] },
    ],
    samplesB: [
      { line_items: [{ catalog_object_id: 'SQ-100', quantity: 'SQ-1501', base_price_money: { currency: 'USD' } }] },
      { line_items: [{ catalog_object_id: 'SQ-200', quantity: 'SQ-2502', base_price_money: { currency: 'EUR' } }] },
      { line_items: [{ catalog_object_id: 'SQ-300', quantity: 'SQ-3503', base_price_money: { currency: 'GBP' } }] },
    ],
    requiredMappings: [
      ['ticket_ccy', 'line_items[*].base_price_money.currency'],
      ['order_rows[*].catalog_code', 'line_items[*].catalog_object_id'],
      ['order_rows[*].qty_value', 'line_items[*].quantity'],
    ],
  },
  {
    label: 'Twilio SendGrid contacts',
    sourceUrl: 'https://www.twilio.com/docs/sendgrid/api-reference/contacts',
    samplesA: [
      { email_addr: 'sg1@test.com', given_name: 'Mia', family_name: 'Stone', phone_e164: '+447000000001' },
      { email_addr: 'sg2@test.com', given_name: 'Noah', family_name: 'Shaw', phone_e164: '+447000000002' },
      { email_addr: 'sg3@test.com', given_name: 'Olivia', family_name: 'Hart', phone_e164: '+447000000003' },
    ],
    samplesB: [
      { email: 'sg1@test.com', first_name: 'Mia', last_name: 'Stone', phone_number: '+447000000001' },
      { email: 'sg2@test.com', first_name: 'Noah', last_name: 'Shaw', phone_number: '+447000000002' },
      { email: 'sg3@test.com', first_name: 'Olivia', last_name: 'Hart', phone_number: '+447000000003' },
    ],
    requiredMappings: [
      ['email_addr', 'email'],
      ['given_name', 'first_name'],
      ['family_name', 'last_name'],
      ['phone_e164', 'phone_number'],
    ],
  },
  {
    label: 'Adobe Marketo lead database',
    sourceUrl: 'https://experienceleague.adobe.com/en/docs/marketo-developer/marketo/rest/lead-database/lead-database',
    samplesA: [
      { work_mail: 'mk1@test.com', mobile_phone: '+331000000001', company_name: 'Acme Media' },
      { work_mail: 'mk2@test.com', mobile_phone: '+331000000002', company_name: 'Beta Media' },
      { work_mail: 'mk3@test.com', mobile_phone: '+331000000003', company_name: 'Gamma Media' },
    ],
    samplesB: [
      { email: 'mk1@test.com', phone: '+331000000001', company: 'Acme Media' },
      { email: 'mk2@test.com', phone: '+331000000002', company: 'Beta Media' },
      { email: 'mk3@test.com', phone: '+331000000003', company: 'Gamma Media' },
    ],
    requiredMappings: [
      ['work_mail', 'email'],
      ['mobile_phone', 'phone'],
      ['company_name', 'company'],
    ],
  },
  {
    label: 'Notion user object',
    sourceUrl: 'https://developers.notion.com/reference/user',
    samplesA: [
      { display_label: 'Ana Costa', profile_mail: 'ana@notion.test' },
      { display_label: 'Bruno Dias', profile_mail: 'bruno@notion.test' },
      { display_label: 'Carla Nunes', profile_mail: 'carla@notion.test' },
    ],
    samplesB: [
      { name: 'Ana Costa', person: { email: 'ana@notion.test' } },
      { name: 'Bruno Dias', person: { email: 'bruno@notion.test' } },
      { name: 'Carla Nunes', person: { email: 'carla@notion.test' } },
    ],
    requiredMappings: [
      ['display_label', 'name'],
      ['profile_mail', 'person.email'],
    ],
  },
  {
    label: 'GitLab users API',
    sourceUrl: 'https://docs.gitlab.com/api/users/',
    samplesA: [
      { user_handle: 'acosta', full_name: 'Ana Costa', profile_link: 'https://gitlab.test/acosta' },
      { user_handle: 'bdias', full_name: 'Bruno Dias', profile_link: 'https://gitlab.test/bdias' },
      { user_handle: 'cnunes', full_name: 'Carla Nunes', profile_link: 'https://gitlab.test/cnunes' },
    ],
    samplesB: [
      { username: 'acosta', name: 'Ana Costa', web_url: 'https://gitlab.test/acosta' },
      { username: 'bdias', name: 'Bruno Dias', web_url: 'https://gitlab.test/bdias' },
      { username: 'cnunes', name: 'Carla Nunes', web_url: 'https://gitlab.test/cnunes' },
    ],
    requiredMappings: [
      ['user_handle', 'username'],
      ['full_name', 'name'],
      ['profile_link', 'web_url'],
    ],
  },
  {
    label: 'Slack user type',
    sourceUrl: 'https://api.slack.com/types/user',
    samplesA: [
      { nick_name: 'ana.c', display_label: 'Ana Costa', work_mail: 'ana@slack.test' },
      { nick_name: 'bruno.d', display_label: 'Bruno Dias', work_mail: 'bruno@slack.test' },
      { nick_name: 'carla.n', display_label: 'Carla Nunes', work_mail: 'carla@slack.test' },
    ],
    samplesB: [
      { name: 'ana.c', profile: { display_name: 'Ana Costa', email: 'ana@slack.test' } },
      { name: 'bruno.d', profile: { display_name: 'Bruno Dias', email: 'bruno@slack.test' } },
      { name: 'carla.n', profile: { display_name: 'Carla Nunes', email: 'carla@slack.test' } },
    ],
    requiredMappings: [
      ['nick_name', 'name'],
      ['display_label', 'profile.display_name'],
      ['work_mail', 'profile.email'],
    ],
  },
  {
    label: 'Asana users',
    sourceUrl: 'https://developers.asana.com/reference/users',
    samplesA: [
      { full_name: 'Ana Costa', workspace_mail: 'ana@asana.test' },
      { full_name: 'Bruno Dias', workspace_mail: 'bruno@asana.test' },
      { full_name: 'Carla Nunes', workspace_mail: 'carla@asana.test' },
    ],
    samplesB: [
      { name: 'Ana Costa', email: 'ana@asana.test' },
      { name: 'Bruno Dias', email: 'bruno@asana.test' },
      { name: 'Carla Nunes', email: 'carla@asana.test' },
    ],
    requiredMappings: [
      ['full_name', 'name'],
      ['workspace_mail', 'email'],
    ],
  },
  {
    label: 'Intercom contacts',
    sourceUrl: 'https://developers.intercom.com/docs/references/rest-api/api.intercom.io/contacts/contact',
    samplesA: [
      { external_contact_id: 'ext-100', work_mail: 'ana@intercom.test', mobile_phone: '+358400000001' },
      { external_contact_id: 'ext-200', work_mail: 'bruno@intercom.test', mobile_phone: '+358400000002' },
      { external_contact_id: 'ext-300', work_mail: 'carla@intercom.test', mobile_phone: '+358400000003' },
    ],
    samplesB: [
      { external_id: 'ext-100', email: 'ana@intercom.test', phone: '+358400000001' },
      { external_id: 'ext-200', email: 'bruno@intercom.test', phone: '+358400000002' },
      { external_id: 'ext-300', email: 'carla@intercom.test', phone: '+358400000003' },
    ],
    requiredMappings: [
      ['external_contact_id', 'external_id'],
      ['work_mail', 'email'],
      ['mobile_phone', 'phone'],
    ],
  },
  {
    label: 'Microsoft Graph user',
    sourceUrl: 'https://learn.microsoft.com/en-us/graph/api/resources/user?view=graph-rest-1.0',
    samplesA: [
      { display_label: 'Ana Costa', principal_mail: 'ana@graph.test', office_city: 'Lisbon', mobile: '+351911111111' },
      { display_label: 'Bruno Dias', principal_mail: 'bruno@graph.test', office_city: 'Porto', mobile: '+351911111112' },
      { display_label: 'Carla Nunes', principal_mail: 'carla@graph.test', office_city: 'Coimbra', mobile: '+351911111113' },
    ],
    samplesB: [
      { displayName: 'Ana Costa', userPrincipalName: 'ana@graph.test', city: 'Lisbon', mobilePhone: '+351911111111' },
      { displayName: 'Bruno Dias', userPrincipalName: 'bruno@graph.test', city: 'Porto', mobilePhone: '+351911111112' },
      { displayName: 'Carla Nunes', userPrincipalName: 'carla@graph.test', city: 'Coimbra', mobilePhone: '+351911111113' },
    ],
    requiredMappings: [
      ['display_label', 'displayName'],
      ['principal_mail', 'userPrincipalName'],
      ['office_city', 'city'],
      ['mobile', 'mobilePhone'],
    ],
  },
  {
    label: 'FreshBooks contacts',
    sourceUrl: 'https://developers.freshbooks.com/api/contacts',
    samplesA: [
      { client_name: 'Acme Studio', client_mail: 'hello@fresh.test', work_phone: '+16135550001' },
      { client_name: 'Beta Studio', client_mail: 'hi@fresh.test', work_phone: '+16135550002' },
      { client_name: 'Gamma Studio', client_mail: 'team@fresh.test', work_phone: '+16135550003' },
    ],
    samplesB: [
      { organization: 'Acme Studio', email: 'hello@fresh.test', work_phone: '+16135550001' },
      { organization: 'Beta Studio', email: 'hi@fresh.test', work_phone: '+16135550002' },
      { organization: 'Gamma Studio', email: 'team@fresh.test', work_phone: '+16135550003' },
    ],
    requiredMappings: [
      ['client_name', 'organization'],
      ['client_mail', 'email'],
    ],
  },
  {
    label: 'Jira Cloud users',
    sourceUrl: 'https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-users/',
    samplesA: [
      { account_ref: 'acct-1', display_label: 'Ana Costa', mail_box: 'ana@jira.test' },
      { account_ref: 'acct-2', display_label: 'Bruno Dias', mail_box: 'bruno@jira.test' },
      { account_ref: 'acct-3', display_label: 'Carla Nunes', mail_box: 'carla@jira.test' },
    ],
    samplesB: [
      { accountId: 'acct-1', displayName: 'Ana Costa', emailAddress: 'ana@jira.test' },
      { accountId: 'acct-2', displayName: 'Bruno Dias', emailAddress: 'bruno@jira.test' },
      { accountId: 'acct-3', displayName: 'Carla Nunes', emailAddress: 'carla@jira.test' },
    ],
    requiredMappings: [
      ['account_ref', 'accountId'],
      ['display_label', 'displayName'],
      ['mail_box', 'emailAddress'],
    ],
  },
  {
    label: 'Okta users',
    sourceUrl: 'https://developer.okta.com/docs/api/openapi/okta-management/management/tags/user',
    samplesA: [
      { login_name: 'ana@okta.test', display_label: 'Ana Costa', mobile_phone: '+349100000001' },
      { login_name: 'bruno@okta.test', display_label: 'Bruno Dias', mobile_phone: '+349100000002' },
      { login_name: 'carla@okta.test', display_label: 'Carla Nunes', mobile_phone: '+349100000003' },
    ],
    samplesB: [
      { profile: { login: 'ana@okta.test', displayName: 'Ana Costa', mobilePhone: '+349100000001' } },
      { profile: { login: 'bruno@okta.test', displayName: 'Bruno Dias', mobilePhone: '+349100000002' } },
      { profile: { login: 'carla@okta.test', displayName: 'Carla Nunes', mobilePhone: '+349100000003' } },
    ],
    requiredMappings: [
      ['login_name', 'profile.login'],
      ['display_label', 'profile.displayName'],
      ['mobile_phone', 'profile.mobilePhone'],
    ],
  },
  {
    label: 'Google Merchant product input',
    sourceUrl: 'https://developers.google.com/merchant/api/reference/rest/Shared.Types/ProductInput',
    samplesA: [
      { product_name: 'Mountain Bike', product_link: 'https://shop.test/p/1', item_code: 'GM-100' },
      { product_name: 'Road Bike', product_link: 'https://shop.test/p/2', item_code: 'GM-200' },
      { product_name: 'City Bike', product_link: 'https://shop.test/p/3', item_code: 'GM-300' },
    ],
    samplesB: [
      { title: 'Mountain Bike', link: 'https://shop.test/p/1', offerId: 'GM-100' },
      { title: 'Road Bike', link: 'https://shop.test/p/2', offerId: 'GM-200' },
      { title: 'City Bike', link: 'https://shop.test/p/3', offerId: 'GM-300' },
    ],
    requiredMappings: [
      ['product_name', 'title'],
      ['product_link', 'link'],
      ['item_code', 'offerId'],
    ],
  },
];

async function runSmokeTest() {
  console.log('--- Iniciando IntegraX Smoke Test: business happy path + casos web oficiales ---');

  const bridge = new SchemaBridge();
  let scenarioIndex = 1;

  for (const scenario of baselineScenarios) {
    await runScenario(bridge, scenario, scenarioIndex++);
  }

  for (const scenario of officialWebScenarios) {
    await runScenario(bridge, scenario, scenarioIndex++);
  }

  console.log('\n--- ESTADO DEL TEST ---');
  console.log(
    `RESULTADO: SUCCESS. El motor resolvio ${baselineScenarios.length + officialWebScenarios.length} escenarios; ` +
    `${officialWebScenarios.length} casos basados en documentacion oficial quedaron resueltos sin LLM ` +
    'manteniendo cobertura de negocio en el camino feliz.'
  );
  process.exit(0);
}

runSmokeTest().catch(error => {
  console.error('\n--- ESTADO DEL TEST ---');
  console.error('RESULTADO: FAIL.', error);
  process.exit(1);
});
