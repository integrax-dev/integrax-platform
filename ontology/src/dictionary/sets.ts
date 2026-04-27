export const HIGH_CONFIDENCE_SETS: ReadonlyArray<ReadonlySet<string>> = [
  new Set(['cell', 'mobile', 'phone', 'telephone', 'mobile_number', 'cell_phone']),
  new Set(['first_name', 'given_name', 'fname']),
  new Set(['last_name', 'surname', 'family_name', 'lname']),
  new Set(['zip', 'postal', 'zipcode', 'postal_code']),
  new Set(['vat', 'tax_id', 'tax_number', 'ein']),
  new Set(['mail', 'email', 'email_address']),
  new Set(['price', 'cost', 'rate', 'unit_price']),
  new Set(['client', 'customer']),
  new Set(['provider', 'supplier', 'vendor']),
  new Set(['org', 'organization', 'company', 'business']),
  new Set(['created_at', 'date_created']),
  new Set(['updated_at', 'last_modified']),
];

export const MEDIUM_CONFIDENCE_SETS: ReadonlyArray<ReadonlySet<string>> = [
  new Set(['qty', 'quantity', 'count']),
  new Set(['desc', 'description', 'note', 'notes', 'comment', 'comments', 'remarks']),
];
