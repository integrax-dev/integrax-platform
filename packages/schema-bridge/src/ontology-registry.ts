import type {
  OntologyMatch,
  OntologyMatchContext,
  OntologyProvider,
} from './types.js';

import { DictionaryOntologyProvider } from './dictionary-ontology.js';

function normalizeToken(value: string): string {
  if (/^[A-Z0-9_]+$/.test(value)) {
    return value.toLowerCase().replace(/__+/g, '_').replace(/^_|_$/g, '');
  }

  return value
    .replace(/([A-Z])/g, '_$1')
    .replace(/-/g, '_')
    .toLowerCase()
    .replace(/__+/g, '_')
    .replace(/^_|_$/g, '');
}

function leafToken(path: string): string {
  const segments = path.split('.');
  return normalizeToken(segments[segments.length - 1].replace(/\[\*\]/g, ''));
}

// ─── Generic English synonym pairs ───────────────────────────────────────────
// Only English-language field name variants — no country-specific terms.

const GENERIC_SYNONYM_PAIRS: Array<[string, string]> = [
  // Name variants
  ['nick_name', 'name'], ['given_name', 'first_name'], ['given_name', 'fname'],
  ['family_name', 'last_name'], ['family_name', 'lname'],
  ['first_name', 'fname'], ['last_name', 'lname'],

  // Auth / account
  ['user_handle', 'username'], ['handle', 'username'],
  ['login_name', 'login'], ['login_name', 'username'],
  ['account_ref', 'account_id'], ['account_ref', 'accountid'],

  // Contact
  ['email', 'mail'],

  // Inventory
  ['stock', 'quantity'], ['qty_value', 'quantity'], ['qty_value', 'qty'],
];

// ─── LatAm ES/PT synonym pairs ───────────────────────────────────────────────
// Inject via latamOntologyProviders when targeting Spanish/Portuguese connectors.

const LATAM_SYNONYM_PAIRS: Array<[string, string]> = [
  // IDs / codes
  ['id', 'codigo'], ['id', 'identificador'], ['id', 'numero'], ['id', 'nro'],
  ['codigo', 'code'], ['codigo', 'identificador'],

  // Names
  ['nombre', 'name'], ['nombre', 'first_name'], ['nombre', 'fname'],
  ['apellido', 'last_name'], ['apellido', 'lname'],
  ['nome', 'name'], ['nome', 'nombre'], ['nome', 'first_name'],
  ['sobrenome', 'last_name'], ['sobrenome', 'apellido'],

  // Parties
  ['cliente', 'customer'], ['cliente', 'buyer'],
  ['proveedor', 'supplier'], ['proveedor', 'vendor'],
  ['fornecedor', 'supplier'], ['fornecedor', 'vendor'], ['fornecedor', 'proveedor'],

  // Money
  ['monto', 'amount'], ['monto', 'importe'], ['monto', 'total'],
  ['precio', 'price'], ['precio', 'rate'],
  ['valor', 'amount'], ['valor', 'monto'], ['valor', 'value'],
  ['preco', 'price'], ['preco', 'precio'],
  ['montante', 'amount'], ['montante', 'monto'],
  ['importe', 'amount'], ['importe', 'monto'],

  // Dates
  ['fecha', 'date'], ['fecha_creacion', 'created_at'], ['fecha_actualizacion', 'updated_at'],
  ['data', 'date'], ['data', 'fecha'],
  ['criado_em', 'created_at'], ['criado_em', 'fecha_creacion'],
  ['atualizado_em', 'updated_at'], ['atualizado_em', 'fecha_actualizacion'],

  // Contact
  ['email', 'correo'],
  ['telefono', 'phone'], ['telefono', 'mobile'],
  ['telefone', 'phone'], ['telefone', 'telefono'],
  ['direccion', 'address'], ['calle', 'street'],
  ['endereco', 'address'], ['endereco', 'direccion'],

  // Documents
  ['factura', 'invoice'], ['pedido', 'order'], ['orden', 'order'],
  ['nota_fiscal', 'invoice'], ['nota_fiscal', 'factura'],
  ['fatura', 'invoice'], ['fatura', 'factura'],

  // Products / inventory
  ['producto', 'product'], ['articulo', 'item'],
  ['produto', 'product'], ['produto', 'producto'],
  ['quantidade', 'quantity'], ['quantidade', 'qty'], ['quantidade', 'cantidad'],
  ['cantidad', 'quantity'], ['cantidad', 'qty'],

  // Status / type
  ['estado', 'status'], ['estado', 'state'],
  ['situacao', 'status'], ['situacao', 'estado'],
  ['moneda', 'currency'], ['moneda', 'currency_code'],
  ['moeda', 'currency'], ['moeda', 'moneda'],
  ['descripcion', 'description'], ['descripcion', 'detail'],
  ['descricao', 'description'], ['descricao', 'descripcion'],
  ['tipo', 'type'], ['tipo', 'kind'],

  // Tax identifiers (cross-language labels)
  ['cuit', 'tax_id'], ['cuit', 'fiscal_id'], ['cuit', 'rut'],
  ['cnpj', 'tax_id'], ['cnpj', 'fiscal_id'],
  ['cpf', 'tax_id'], ['cpf', 'fiscal_id'],
  ['rfc', 'tax_id'], ['rfc', 'fiscal_id'],
  ['nit', 'tax_id'], ['nit', 'fiscal_id'],
  ['rut', 'tax_id'], ['rut', 'cuit'],
];

function buildSynonymIndex(pairs: Array<[string, string]>): Map<string, Set<string>> {
  const index = new Map<string, Set<string>>();

  for (const [left, right] of pairs) {
    const normalizedLeft = normalizeToken(left);
    const normalizedRight = normalizeToken(right);
    if (!index.has(normalizedLeft)) index.set(normalizedLeft, new Set());
    if (!index.has(normalizedRight)) index.set(normalizedRight, new Set());
    index.get(normalizedLeft)!.add(normalizedRight);
    index.get(normalizedRight)!.add(normalizedLeft);
  }

  return index;
}

const genericSynonymIndex = buildSynonymIndex(GENERIC_SYNONYM_PAIRS);
const latamSynonymIndex = buildSynonymIndex(LATAM_SYNONYM_PAIRS);

function sharedTokenRatio(left: string, right: string): number {
  const leftTokens = left.split('_').filter(Boolean);
  const rightTokens = right.split('_').filter(Boolean);
  if (leftTokens.length === 0 || rightTokens.length === 0) return 0;
  const shared = leftTokens.filter(token => rightTokens.includes(token)).length;
  return shared / Math.max(leftTokens.length, rightTokens.length);
}

function makeSynonymProvider(
  id: string,
  index: Map<string, Set<string>>,
): OntologyProvider {
  return {
    id,
    match(context: OntologyMatchContext): OntologyMatch | null {
      const leafA = leafToken(context.pathA);
      const leafB = leafToken(context.pathB);

      if (leafA === leafB) {
        return { score: 1, label: 'exact_leaf', reason: `Leaf token "${leafA}" matches exactly.` };
      }

      if (index.get(leafA)?.has(leafB) || index.get(leafB)?.has(leafA)) {
        return { score: 0.92, label: 'synonym', reason: `Synonym "${leafA}" <-> "${leafB}".` };
      }

      const sharedRatio = sharedTokenRatio(leafA, leafB);
      if (sharedRatio >= 0.5) {
        return {
          score: Math.min(0.8, 0.55 + sharedRatio * 0.25),
          label: 'token_overlap',
          reason: `Token overlap between "${leafA}" and "${leafB}".`,
        };
      }

      return null;
    },
  };
}

// ─── Exports ──────────────────────────────────────────────────────────────────

export const defaultOntologyProviders: OntologyProvider[] = [
  new DictionaryOntologyProvider(),
  makeSynonymProvider('generic-synonyms', genericSynonymIndex),
];

/** Inject these when comparing connectors that use Spanish or Portuguese field names. */
export const latamOntologyProviders: OntologyProvider[] = [
  makeSynonymProvider('latam-synonyms', latamSynonymIndex),
];
