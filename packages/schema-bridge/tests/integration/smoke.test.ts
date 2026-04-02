/**
 * Smoke tests — Happy path: 27 real-world API rename scenarios
 *
 * Cada escenario verifica que el motor resuelve correctamente los mappings
 * entre dos sistemas SIN escalar al LLM. Estos son los casos que el motor
 * debe resolver 100% determinísticamente en producción.
 *
 * Fuentes: documentación oficial de cada API (URLs incluidas en los labels).
 */
import { describe, it, expect } from 'vitest';
import { SchemaBridge } from '../../src/bridge.js';

const bridge = new SchemaBridge();

type Scenario = {
  label: string;
  samplesA: Record<string, unknown>[];
  samplesB: Record<string, unknown>[];
  requiredMappings: Array<[string, string]>;
  forbiddenSources?: string[];
};

function checkScenario(
  report: Awaited<ReturnType<typeof bridge.compare>>,
  scenario: Scenario,
) {
  const missingMappings = scenario.requiredMappings.filter(
    ([pathA, pathB]) => !report.mappings.some(m => m.pathA === pathA && m.pathB === pathB),
  );
  const llmEscalations = report.requirementsReport.llmEscalations;
  const forbiddenMapped = (scenario.forbiddenSources ?? []).filter(
    pathA => report.mappings.some(m => m.pathA === pathA),
  );

  return { missingMappings, llmEscalations, forbiddenMapped };
}

const scenarios: Scenario[] = [
  {
    label: 'SAP plano vs Coupa',
    samplesA: [
      { BUKRS: 'NA-Corp', LIFNR: 'SUP-000100', NAME1: 'Acme Corp', ORT01: 'Berlin', WAERS: 'EUR' },
      { BUKRS: 'EU-Corp', LIFNR: 'SUP-000200', NAME1: 'Beta GmbH', ORT01: 'Munich', WAERS: 'USD' },
      { BUKRS: 'AR-Corp', LIFNR: 'SUP-000300', NAME1: 'Gamma SA',  ORT01: 'Vienna', WAERS: 'GBP' },
    ],
    samplesB: [
      { companyCode: 'NA-Corp', supplierNumber: 'SUP-000100', supplierName: 'Acme Corp', city: 'Berlin', currencyCode: 'EUR' },
      { companyCode: 'EU-Corp', supplierNumber: 'SUP-000200', supplierName: 'Beta GmbH', city: 'Munich', currencyCode: 'USD' },
      { companyCode: 'AR-Corp', supplierNumber: 'SUP-000300', supplierName: 'Gamma SA',  city: 'Vienna', currencyCode: 'GBP' },
    ],
    requiredMappings: [['BUKRS', 'companyCode'], ['LIFNR', 'supplierNumber'], ['NAME1', 'supplierName'], ['ORT01', 'city'], ['WAERS', 'currencyCode']],
  },
  {
    label: 'SAP IDoc profundo con segmentos y arrays',
    samplesA: [
      { IDOC: { E1BPADDR1: [{ CITY: 'Berlin', POST_CODE: 'DE-10115', STREET: 'Unter den Linden 1' }], E1BPMATERIAL: [{ MATNR: 'MAT-001', MAKTX: 'Motor' }] } },
      { IDOC: { E1BPADDR1: [{ CITY: 'Munich', POST_CODE: 'DE-80331', STREET: 'Marienplatz 1' }],   E1BPMATERIAL: [{ MATNR: 'MAT-002', MAKTX: 'Valve' }] } },
      { IDOC: { E1BPADDR1: [{ CITY: 'Hamburg', POST_CODE: 'DE-20095', STREET: 'Jungfernstieg 7' }], E1BPMATERIAL: [{ MATNR: 'MAT-003', MAKTX: 'Rotor' }] } },
    ],
    samplesB: [
      { addresses: [{ city: 'Berlin', postalCode: 'DE-10115', streetLine: 'Unter den Linden 1' }], items: [{ productCode: 'MAT-001', description: 'Motor' }] },
      { addresses: [{ city: 'Munich', postalCode: 'DE-80331', streetLine: 'Marienplatz 1' }],   items: [{ productCode: 'MAT-002', description: 'Valve' }] },
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
    label: 'Upgrade ERP con renames simultáneos en nested arrays',
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
  {
    label: 'Stripe customer object — https://docs.stripe.com/api/customers/object',
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
    requiredMappings: [['cust_id', 'id'], ['mail_addr', 'email'], ['home_city', 'address.city'], ['default_ccy', 'currency']],
  },
  {
    label: 'Shopify order — https://shopify.dev/docs/api/admin-rest/latest/resources/order',
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
    requiredMappings: [['legacy_order_no', 'name'], ['buyer_mail', 'email'], ['ship_ccy', 'currency'], ['rows[*].sku_code', 'line_items[*].sku']],
  },
  {
    label: 'HubSpot CRM contacts — https://developers.hubspot.com',
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
    requiredMappings: [['lead_mail', 'properties.email'], ['corp_name', 'properties.company'], ['mobile_phone', 'properties.phone']],
  },
  {
    label: 'Salesforce Account — https://developer.salesforce.com',
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
    requiredMappings: [['account_name', 'Name'], ['invoice_city', 'BillingCity'], ['main_phone', 'Phone'], ['site_url', 'Website']],
  },
  {
    label: 'Dataverse contact — https://learn.microsoft.com/power-apps/developer/data-platform',
    samplesA: [
      { full_name: 'Ana Costa', work_mail: 'ana@test', office_phone: '+351211111111', town_name: 'Lisbon' },
      { full_name: 'Bruno Dias', work_mail: 'bruno@test', office_phone: '+351211111112', town_name: 'Porto' },
      { full_name: 'Carla Nunes', work_mail: 'carla@test', office_phone: '+351211111113', town_name: 'Coimbra' },
    ],
    samplesB: [
      { fullname: 'Ana Costa', emailaddress1: 'ana@test', telephone1: '+351211111111', address1_city: 'Lisbon' },
      { fullname: 'Bruno Dias', emailaddress1: 'bruno@test', telephone1: '+351211111112', address1_city: 'Porto' },
      { fullname: 'Carla Nunes', emailaddress1: 'carla@test', telephone1: '+351211111113', address1_city: 'Coimbra' },
    ],
    requiredMappings: [['full_name', 'fullname'], ['work_mail', 'emailaddress1'], ['office_phone', 'telephone1'], ['town_name', 'address1_city']],
  },
  {
    label: 'QuickBooks invoice — https://developer.intuit.com',
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
    requiredMappings: [['invoice_no', 'DocNumber'], ['invoice_mail', 'BillEmail.Address'], ['fx_code', 'CurrencyRef.value'], ['rows[*].item_code', 'Line[*].SalesItemLineDetail.ItemRef.value']],
  },
  {
    label: 'Xero invoices — https://developer.xero.com',
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
    requiredMappings: [['invoice_ref', 'InvoiceNumber'], ['contact_mail', 'Contact.EmailAddress'], ['fx_code', 'CurrencyCode'], ['detail_lines[*].sku', 'LineItems[*].ItemCode']],
  },
  {
    label: 'Zoho CRM — https://www.zoho.com/crm/developer/docs/api/v6/',
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
    requiredMappings: [['lead_email', 'Email'], ['office_phone', 'Phone'], ['mailing_city', 'Mailing_City']],
  },
  {
    label: 'Freshdesk contacts — https://developers.freshdesk.com/api/#contacts',
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
    requiredMappings: [['support_email', 'email'], ['cell_phone', 'mobile'], ['org_name', 'company_name']],
  },
  {
    label: 'Mailchimp list members — https://mailchimp.com/developer/marketing/api/list-members/',
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
    requiredMappings: [['subscriber_email', 'email_address'], ['given_name', 'merge_fields.FNAME'], ['family_name', 'merge_fields.LNAME']],
  },
  {
    label: 'BigCommerce orders — https://developer.bigcommerce.com/docs/rest-management/orders',
    samplesA: [
      { buyer_mail: 'a@shop.test', store_ccy: 'USD', ship_city: 'New York', order_rows: [{ sku_code: 'SKU-100' }] },
      { buyer_mail: 'b@shop.test', store_ccy: 'EUR', ship_city: 'Paris',    order_rows: [{ sku_code: 'SKU-200' }] },
      { buyer_mail: 'c@shop.test', store_ccy: 'GBP', ship_city: 'London',   order_rows: [{ sku_code: 'SKU-300' }] },
    ],
    samplesB: [
      { billing_address: { email: 'a@shop.test' }, currency_code: 'USD', shipping_addresses: [{ city: 'New York' }], products: [{ sku: 'SKU-100' }] },
      { billing_address: { email: 'b@shop.test' }, currency_code: 'EUR', shipping_addresses: [{ city: 'Paris' }],    products: [{ sku: 'SKU-200' }] },
      { billing_address: { email: 'c@shop.test' }, currency_code: 'GBP', shipping_addresses: [{ city: 'London' }],  products: [{ sku: 'SKU-300' }] },
    ],
    requiredMappings: [['buyer_mail', 'billing_address.email'], ['store_ccy', 'currency_code'], ['ship_city', 'shipping_addresses[*].city'], ['order_rows[*].sku_code', 'products[*].sku']],
  },
  {
    label: 'Square orders — https://developer.squareup.com/reference/square/orders-api',
    samplesA: [
      { ticket_ccy: 'USD', order_rows: [{ qty_value: 'SQ-1501', catalog_code: 'CAT-100' }] },
      { ticket_ccy: 'EUR', order_rows: [{ qty_value: 'SQ-2502', catalog_code: 'CAT-200' }] },
      { ticket_ccy: 'GBP', order_rows: [{ qty_value: 'SQ-3503', catalog_code: 'CAT-300' }] },
    ],
    samplesB: [
      { line_items: [{ base_price_money: { currency: 'USD' }, quantity: 'SQ-1501', catalog_object_id: 'CAT-100' }] },
      { line_items: [{ base_price_money: { currency: 'EUR' }, quantity: 'SQ-2502', catalog_object_id: 'CAT-200' }] },
      { line_items: [{ base_price_money: { currency: 'GBP' }, quantity: 'SQ-3503', catalog_object_id: 'CAT-300' }] },
    ],
    requiredMappings: [['ticket_ccy', 'line_items[*].base_price_money.currency'], ['order_rows[*].qty_value', 'line_items[*].quantity'], ['order_rows[*].catalog_code', 'line_items[*].catalog_object_id']],
  },
  {
    label: 'SendGrid contacts — https://www.twilio.com/docs/sendgrid/api-reference/contacts',
    samplesA: [
      { email_addr: 'sg1@test.com', given_name: 'Ana', family_name: 'Costa', phone_e164: '+5491112345678' },
      { email_addr: 'sg2@test.com', given_name: 'Bruno', family_name: 'Dias', phone_e164: '+5491112345679' },
      { email_addr: 'sg3@test.com', given_name: 'Carla', family_name: 'Nunes', phone_e164: '+5491112345680' },
    ],
    samplesB: [
      { email: 'sg1@test.com', first_name: 'Ana', last_name: 'Costa', phone_number: '+5491112345678' },
      { email: 'sg2@test.com', first_name: 'Bruno', last_name: 'Dias', phone_number: '+5491112345679' },
      { email: 'sg3@test.com', first_name: 'Carla', last_name: 'Nunes', phone_number: '+5491112345680' },
    ],
    requiredMappings: [['email_addr', 'email'], ['given_name', 'first_name'], ['family_name', 'last_name'], ['phone_e164', 'phone_number']],
  },
  {
    label: 'Marketo lead — https://experienceleague.adobe.com/en/docs/marketo-developer',
    samplesA: [
      { work_mail: 'mk1@test.com', company_name: 'Acme', mobile_phone: '+12025550101' },
      { work_mail: 'mk2@test.com', company_name: 'Beta', mobile_phone: '+12025550102' },
      { work_mail: 'mk3@test.com', company_name: 'Gamma', mobile_phone: '+12025550103' },
    ],
    samplesB: [
      { email: 'mk1@test.com', company: 'Acme', phone: '+12025550101' },
      { email: 'mk2@test.com', company: 'Beta', phone: '+12025550102' },
      { email: 'mk3@test.com', company: 'Gamma', phone: '+12025550103' },
    ],
    requiredMappings: [['work_mail', 'email'], ['company_name', 'company'], ['mobile_phone', 'phone']],
  },
  {
    label: 'Notion user — https://developers.notion.com/reference/user',
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
    requiredMappings: [['display_label', 'name'], ['profile_mail', 'person.email']],
  },
  {
    label: 'GitLab users — https://docs.gitlab.com/api/users/',
    samplesA: [
      { full_name: 'Ana Costa', user_handle: 'ana.costa', profile_link: 'https://gitlab.com/ana.costa' },
      { full_name: 'Bruno Dias', user_handle: 'bruno.dias', profile_link: 'https://gitlab.com/bruno.dias' },
      { full_name: 'Carla Nunes', user_handle: 'carla.nunes', profile_link: 'https://gitlab.com/carla.nunes' },
    ],
    samplesB: [
      { name: 'Ana Costa', username: 'ana.costa', web_url: 'https://gitlab.com/ana.costa' },
      { name: 'Bruno Dias', username: 'bruno.dias', web_url: 'https://gitlab.com/bruno.dias' },
      { name: 'Carla Nunes', username: 'carla.nunes', web_url: 'https://gitlab.com/carla.nunes' },
    ],
    requiredMappings: [['full_name', 'name'], ['user_handle', 'username'], ['profile_link', 'web_url']],
  },
  {
    label: 'Slack user — https://api.slack.com/types/user',
    samplesA: [
      { nick_name: 'ana.costa', display_label: 'Ana Costa', work_mail: 'ana@slack.test' },
      { nick_name: 'bruno.dias', display_label: 'Bruno Dias', work_mail: 'bruno@slack.test' },
      { nick_name: 'carla.nunes', display_label: 'Carla Nunes', work_mail: 'carla@slack.test' },
    ],
    samplesB: [
      { name: 'ana.costa', profile: { display_name: 'Ana Costa', email: 'ana@slack.test' } },
      { name: 'bruno.dias', profile: { display_name: 'Bruno Dias', email: 'bruno@slack.test' } },
      { name: 'carla.nunes', profile: { display_name: 'Carla Nunes', email: 'carla@slack.test' } },
    ],
    requiredMappings: [['nick_name', 'name'], ['display_label', 'profile.display_name'], ['work_mail', 'profile.email']],
  },
  {
    label: 'Asana users — https://developers.asana.com/reference/users',
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
    requiredMappings: [['full_name', 'name'], ['workspace_mail', 'email']],
  },
  {
    label: 'Intercom contacts — https://developers.intercom.com',
    samplesA: [
      { work_mail: 'ic1@test.com', mobile_phone: '+12025550101', external_contact_id: 'EXT-001' },
      { work_mail: 'ic2@test.com', mobile_phone: '+12025550102', external_contact_id: 'EXT-002' },
      { work_mail: 'ic3@test.com', mobile_phone: '+12025550103', external_contact_id: 'EXT-003' },
    ],
    samplesB: [
      { email: 'ic1@test.com', phone: '+12025550101', external_id: 'EXT-001' },
      { email: 'ic2@test.com', phone: '+12025550102', external_id: 'EXT-002' },
      { email: 'ic3@test.com', phone: '+12025550103', external_id: 'EXT-003' },
    ],
    requiredMappings: [['work_mail', 'email'], ['mobile_phone', 'phone'], ['external_contact_id', 'external_id']],
  },
  {
    label: 'Microsoft Graph user — https://learn.microsoft.com/en-us/graph/api/resources/user',
    samplesA: [
      { display_label: 'Ana Costa', principal_mail: 'ana@contoso.com', mobile: '+12025550101', office_city: 'New York' },
      { display_label: 'Bruno Dias', principal_mail: 'bruno@contoso.com', mobile: '+12025550102', office_city: 'London' },
      { display_label: 'Carla Nunes', principal_mail: 'carla@contoso.com', mobile: '+12025550103', office_city: 'Berlin' },
    ],
    samplesB: [
      { displayName: 'Ana Costa', userPrincipalName: 'ana@contoso.com', mobilePhone: '+12025550101', city: 'New York' },
      { displayName: 'Bruno Dias', userPrincipalName: 'bruno@contoso.com', mobilePhone: '+12025550102', city: 'London' },
      { displayName: 'Carla Nunes', userPrincipalName: 'carla@contoso.com', mobilePhone: '+12025550103', city: 'Berlin' },
    ],
    requiredMappings: [['display_label', 'displayName'], ['principal_mail', 'userPrincipalName'], ['mobile', 'mobilePhone'], ['office_city', 'city']],
  },
  {
    label: 'FreshBooks contacts — https://developers.freshbooks.com/api/contacts',
    samplesA: [
      { client_mail: 'fb1@test.com', client_name: 'Acme' },
      { client_mail: 'fb2@test.com', client_name: 'Beta' },
      { client_mail: 'fb3@test.com', client_name: 'Gamma' },
    ],
    samplesB: [
      { email: 'fb1@test.com', organization: 'Acme' },
      { email: 'fb2@test.com', organization: 'Beta' },
      { email: 'fb3@test.com', organization: 'Gamma' },
    ],
    requiredMappings: [['client_mail', 'email'], ['client_name', 'organization']],
  },
  {
    label: 'Jira Cloud users — https://developer.atlassian.com/cloud/jira',
    samplesA: [
      { display_label: 'Ana Costa', account_ref: 'acc001', mail_box: 'ana@jira.test' },
      { display_label: 'Bruno Dias', account_ref: 'acc002', mail_box: 'bruno@jira.test' },
      { display_label: 'Carla Nunes', account_ref: 'acc003', mail_box: 'carla@jira.test' },
    ],
    samplesB: [
      { displayName: 'Ana Costa', accountId: 'acc001', emailAddress: 'ana@jira.test' },
      { displayName: 'Bruno Dias', accountId: 'acc002', emailAddress: 'bruno@jira.test' },
      { displayName: 'Carla Nunes', accountId: 'acc003', emailAddress: 'carla@jira.test' },
    ],
    requiredMappings: [['display_label', 'displayName'], ['account_ref', 'accountId'], ['mail_box', 'emailAddress']],
  },
  {
    label: 'Okta users — https://developer.okta.com/docs/api/openapi/okta-management',
    samplesA: [
      { display_label: 'Ana Costa', mobile_phone: '+12025550101', login_name: 'ana@okta.test' },
      { display_label: 'Bruno Dias', mobile_phone: '+12025550102', login_name: 'bruno@okta.test' },
      { display_label: 'Carla Nunes', mobile_phone: '+12025550103', login_name: 'carla@okta.test' },
    ],
    samplesB: [
      { profile: { displayName: 'Ana Costa', mobilePhone: '+12025550101', login: 'ana@okta.test' } },
      { profile: { displayName: 'Bruno Dias', mobilePhone: '+12025550102', login: 'bruno@okta.test' } },
      { profile: { displayName: 'Carla Nunes', mobilePhone: '+12025550103', login: 'carla@okta.test' } },
    ],
    requiredMappings: [['display_label', 'profile.displayName'], ['mobile_phone', 'profile.mobilePhone'], ['login_name', 'profile.login']],
  },
  {
    label: 'Google Merchant product — https://developers.google.com/merchant/api',
    samplesA: [
      { product_name: 'Remera Azul M', item_code: 'ITEM-001', product_link: 'https://shop.example/remera-azul-m' },
      { product_name: 'Pantalon Negro L', item_code: 'ITEM-002', product_link: 'https://shop.example/pantalon-negro-l' },
      { product_name: 'Zapatillas Blancas 42', item_code: 'ITEM-003', product_link: 'https://shop.example/zapatillas-blancas-42' },
    ],
    samplesB: [
      { title: 'Remera Azul M', offerId: 'ITEM-001', link: 'https://shop.example/remera-azul-m' },
      { title: 'Pantalon Negro L', offerId: 'ITEM-002', link: 'https://shop.example/pantalon-negro-l' },
      { title: 'Zapatillas Blancas 42', offerId: 'ITEM-003', link: 'https://shop.example/zapatillas-blancas-42' },
    ],
    requiredMappings: [['product_name', 'title'], ['item_code', 'offerId'], ['product_link', 'link']],
  },
];

describe('Smoke tests — 27 real-world API rename scenarios', () => {
  for (const [index, scenario] of scenarios.entries()) {
    it(`Scenario ${index + 1}: ${scenario.label}`, async () => {
      const report = await bridge.compare({
        connectorAId: `smoke-${index + 1}-a`,
        connectorBId: `smoke-${index + 1}-b`,
        samplesA: scenario.samplesA,
        samplesB: scenario.samplesB,
      });

      const { missingMappings, llmEscalations, forbiddenMapped } = checkScenario(report, scenario);

      expect(
        missingMappings,
        `Missing mappings: ${missingMappings.map(([a, b]) => `${a} → ${b}`).join(', ')}`,
      ).toHaveLength(0);

      expect(
        llmEscalations.length,
        `Unexpected LLM escalations: ${llmEscalations.map(e => e.diff.pathA).join(', ')}`,
      ).toBe(0);

      expect(
        forbiddenMapped,
        `Forbidden sources got mapped: ${forbiddenMapped.join(', ')}`,
      ).toHaveLength(0);
    });
  }
});
