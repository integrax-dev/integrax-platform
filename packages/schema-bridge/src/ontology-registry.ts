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

const GENERIC_SYNONYM_PAIRS: Array<[string, string]> = [
  ['id', 'codigo'], ['id', 'identificador'], ['id', 'numero'], ['id', 'nro'],
  ['codigo', 'code'], ['codigo', 'identificador'],
  ['nombre', 'name'], ['nombre', 'first_name'], ['nombre', 'fname'], ['nick_name', 'name'], ['apellido', 'last_name'], ['apellido', 'lname'],
  ['given_name', 'first_name'], ['given_name', 'fname'], ['family_name', 'last_name'], ['family_name', 'lname'],
  ['first_name', 'fname'], ['last_name', 'lname'],
  ['cliente', 'customer'], ['cliente', 'buyer'],
  ['proveedor', 'supplier'], ['proveedor', 'vendor'],
  ['monto', 'amount'], ['monto', 'importe'], ['monto', 'total'],
  ['precio', 'price'], ['precio', 'rate'],
  ['fecha', 'date'], ['fecha_creacion', 'created_at'], ['fecha_actualizacion', 'updated_at'],
  ['email', 'mail'], ['email', 'correo'],
  ['user_handle', 'username'], ['handle', 'username'], ['login_name', 'login'], ['login_name', 'username'],
  ['account_ref', 'account_id'], ['account_ref', 'accountid'],
  ['telefono', 'phone'], ['telefono', 'mobile'],
  ['direccion', 'address'], ['calle', 'street'],
  ['factura', 'invoice'], ['pedido', 'order'], ['orden', 'order'],
  ['producto', 'product'], ['articulo', 'item'],
  ['cantidad', 'quantity'], ['cantidad', 'qty'], ['stock', 'quantity'], ['qty_value', 'quantity'], ['qty_value', 'qty'],
  ['estado', 'status'], ['estado', 'state'],
  ['moneda', 'currency'], ['moneda', 'currency_code'],
  ['descripcion', 'description'], ['descripcion', 'detail'],
  ['tipo', 'type'], ['tipo', 'kind'],
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

function sharedTokenRatio(left: string, right: string): number {
  const leftTokens = left.split('_').filter(Boolean);
  const rightTokens = right.split('_').filter(Boolean);
  if (leftTokens.length === 0 || rightTokens.length === 0) return 0;
  const shared = leftTokens.filter(token => rightTokens.includes(token)).length;
  return shared / Math.max(leftTokens.length, rightTokens.length);
}

function genericSynonymProvider(context: OntologyMatchContext): OntologyMatch | null {
  const leafA = leafToken(context.pathA);
  const leafB = leafToken(context.pathB);

  if (leafA === leafB) {
    return { score: 1, label: 'exact_leaf', reason: `Leaf token "${leafA}" matches exactly.` };
  }

  if (genericSynonymIndex.get(leafA)?.has(leafB) || genericSynonymIndex.get(leafB)?.has(leafA)) {
    return { score: 0.92, label: 'generic_synonym', reason: `Generic ontology synonym "${leafA}" <-> "${leafB}".` };
  }

  const sharedRatio = sharedTokenRatio(leafA, leafB);
  if (sharedRatio >= 0.5) {
    return {
      score: Math.min(0.8, 0.55 + sharedRatio * 0.25),
      label: 'token_overlap',
      reason: `Generic ontology token overlap between "${leafA}" and "${leafB}".`,
    };
  }

  return null;
}

export const defaultOntologyProviders: OntologyProvider[] = [
  new DictionaryOntologyProvider(),
  {
    id: 'generic-synonyms',
    match: genericSynonymProvider,
  },
];
