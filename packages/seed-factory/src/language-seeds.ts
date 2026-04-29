/**
 * Field name synonym pairs for the ontology registry.
 * Each tuple is [termA, termB] where both represent the same semantic concept
 * across Spanish, Portuguese, and English field naming conventions.
 */

export interface LanguageSeed {
  /** Semantic concept this pair represents */
  concept: string;
  /** ISO 639-1 language codes for each term */
  langA: string;
  langB: string;
  termA: string;
  termB: string;
}

/** Spanish ↔ English field name synonym pairs */
export const ES_EN_SYNONYMS: Array<[string, string]> = [
  // Financial amounts
  ['importe',        'amount'],
  ['monto',          'amount'],
  ['total',          'total'],
  ['imp_total',      'amount'],
  ['precio',         'price'],
  ['valor',          'value'],
  ['subtotal',       'subtotal'],
  ['descuento',      'discount'],
  ['impuesto',       'tax'],
  ['iva',            'vat'],
  ['tasa',           'rate'],

  // Currency
  ['moneda',         'currency'],
  ['divisa',         'currency'],

  // Identification
  ['codigo',         'code'],
  ['numero',         'number'],
  ['identificador',  'id'],
  ['referencia',     'reference'],
  ['clave',          'key'],

  // Entity names
  ['nombre',         'name'],
  ['descripcion',    'description'],
  ['detalle',        'detail'],

  // Status / state
  ['estado',         'status'],
  ['resultado',      'result'],
  ['condicion',      'condition'],

  // Dates
  ['fecha',          'date'],
  ['fecha_creacion', 'created_at'],
  ['fecha_modificacion', 'updated_at'],
  ['fecha_emision',  'issued_at'],
  ['fecha_vencimiento', 'due_date'],

  // Person / contact
  ['cliente',        'customer'],
  ['proveedor',      'supplier'],
  ['vendedor',       'seller'],
  ['comprador',      'buyer'],
  ['correo',         'email'],
  ['correo_electronico', 'email'],
  ['telefono',       'phone'],
  ['direccion',      'address'],

  // Products / inventory
  ['producto',       'product'],
  ['articulo',       'item'],
  ['unidad',         'unit'],
  ['cantidad',       'quantity'],
  ['stock',          'stock'],
  ['inventario',     'inventory'],
  ['categoria',      'category'],

  // Invoice specific (AR / AFIP)
  ['comprobante',    'invoice'],
  ['factura',        'invoice'],
  ['nota_credito',   'credit_note'],
  ['autorizacion',   'authorization'],
  ['cae',            'authorization_code'],
  ['cuit',           'tax_id'],
  ['cuil',           'tax_id'],
  ['razon_social',   'company_name'],
  ['domicilio',      'address'],

  // Payment
  ['pago',           'payment'],
  ['cobro',          'payment'],
  ['cuota',          'installment'],
  ['cuotas',         'installments'],
  ['medio_de_pago',  'payment_method'],
];

/** Portuguese (BR) ↔ English field name synonym pairs */
export const PT_EN_SYNONYMS: Array<[string, string]> = [
  ['valor',          'amount'],
  ['preco',          'price'],
  ['moeda',          'currency'],
  ['codigo',         'code'],
  ['numero',         'number'],
  ['nome',           'name'],
  ['descricao',      'description'],
  ['status',         'status'],
  ['situacao',       'status'],
  ['data',           'date'],
  ['data_criacao',   'created_at'],
  ['data_atualizacao', 'updated_at'],
  ['cliente',        'customer'],
  ['fornecedor',     'supplier'],
  ['email',          'email'],
  ['telefone',       'phone'],
  ['endereco',       'address'],
  ['produto',        'product'],
  ['item',           'item'],
  ['quantidade',     'quantity'],
  ['nota_fiscal',    'invoice'],
  ['nf',             'invoice'],
  ['nfe',            'invoice'],
  ['cnpj',           'tax_id'],
  ['cpf',            'tax_id'],
  ['parcela',        'installment'],
  ['parcelas',       'installments'],
  ['pagamento',      'payment'],
];

/** Spanish ↔ Portuguese field name synonym pairs */
export const ES_PT_SYNONYMS: Array<[string, string]> = [
  ['importe',        'valor'],
  ['monto',          'valor'],
  ['moneda',         'moeda'],
  ['nombre',         'nome'],
  ['descripcion',    'descricao'],
  ['estado',         'status'],
  ['fecha',          'data'],
  ['cliente',        'cliente'],
  ['correo',         'email'],
  ['telefono',       'telefone'],
  ['direccion',      'endereco'],
  ['producto',       'produto'],
  ['cantidad',       'quantidade'],
  ['factura',        'nota_fiscal'],
  ['cuit',           'cnpj'],
  ['cuotas',         'parcelas'],
  ['pago',           'pagamento'],
];

/** SAP ABAP field name ↔ English / Spanish semantic synonym pairs */
export const SAP_SYNONYMS: Array<[string, string]> = [
  ['matnr',          'material_num'],
  ['matnr',          'material_number'],
  ['matnr',          'sku'],
  ['maktx',          'description'],
  ['werks',          'plant'],
  ['lgort',          'storage_location'],
  ['menge',          'quantity'],
  ['meins',          'unit'],
  ['netpr',          'net_price'],
  ['kbetr',          'condition_rate'],
  ['bukrs',          'company_code'],
  ['bukrs',          'company'],
  ['vkorg',          'sales_org'],
  ['vtweg',          'distribution_channel'],
  ['spart',          'division'],
  ['augdt',          'clearing_date'],
  ['bldat',          'document_date'],
  ['waers',          'currency'],
  ['dmbtr',          'amount'],
  ['wrbtr',          'amount'],
  ['kunnr',          'customer_id'],
  ['lifnr',          'vendor_id'],
  ['ebeln',          'purchase_order'],
  ['ebelp',          'purchase_order_item'],
  ['vbeln',          'sales_order'],
  ['posnr',          'item_number'],
  ['erdat',          'created_at'],
  ['aedat',          'updated_at'],
];

/** All synonym pairs concatenated for easy consumption by buildSynonymIndex */
export const ALL_SYNONYM_PAIRS: Array<[string, string]> = [
  ...ES_EN_SYNONYMS,
  ...PT_EN_SYNONYMS,
  ...ES_PT_SYNONYMS,
  ...SAP_SYNONYMS,
];

export const LANGUAGE_SEEDS: LanguageSeed[] = [
  ...ES_EN_SYNONYMS.map(([termA, termB]) => ({ concept: termB, langA: 'es', langB: 'en', termA, termB })),
  ...PT_EN_SYNONYMS.map(([termA, termB]) => ({ concept: termB, langA: 'pt', langB: 'en', termA, termB })),
  ...ES_PT_SYNONYMS.map(([termA, termB]) => ({ concept: termA, langA: 'es', langB: 'pt', termA, termB })),
  ...SAP_SYNONYMS.map(([termA, termB]) => ({ concept: termB, langA: 'sap', langB: 'en', termA, termB })),
];
