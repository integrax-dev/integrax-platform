/** English field-name synonyms and SAP ABAP legacy mappings. */
export const GENERIC_SYNONYM_PAIRS: Array<[string, string]> = [
  ['nick_name', 'name'], ['given_name', 'first_name'], ['given_name', 'fname'],
  ['family_name', 'last_name'], ['family_name', 'lname'],
  ['first_name', 'fname'], ['last_name', 'lname'],
  ['user_handle', 'username'], ['handle', 'username'],
  ['login_name', 'login'], ['login_name', 'username'],
  ['account_ref', 'account_id'], ['account_ref', 'accountid'],
  ['email', 'mail'],
  ['stock', 'quantity'], ['qty_value', 'quantity'], ['qty_value', 'qty'],
  // SAP ABAP
  ['bukrs', 'company_code'], ['bukrs', 'company'],
  ['lifnr', 'vendor'], ['lifnr', 'supplier'],
  ['matnr', 'material'], ['matnr', 'product_id'],
];
