/**
 * Mapping Generator
 *
 * Convierte ResolvedConflict[] en:
 *  1. Lista de FieldMapping
 *  2. Función TypeScript A→B (y B→A) generada como string seguro (sin eval)
 */

import type { FieldMapping, ResolvedConflict } from './types.js';

// ─── Generador de acceso seguro a propiedades anidadas ───────────────────────

/**
 * Convierte "order.customer.email" en:
 *   input?.['order']?.['customer']?.['email']
 */
function safeAccess(path: string, inputVar = 'input'): string {
  const parts = path.split('.').flatMap(p => {
    // Manejar arrays [*]
    if (p.endsWith('[*]')) {
      return [p.replace('[*]', ''), '[*]'];
    }
    return [p];
  });

  let expr = inputVar;
  for (const part of parts) {
    if (part === '[*]') {
      expr = `${expr}?.map((item: unknown) => item)`;
    } else {
      expr = `${expr}?.['${part}']`;
    }
  }
  return expr;
}

/**
 * Convierte "order.customer.email" en una asignación anidada:
 *   output['order'] = output['order'] ?? {};
 *   output['order']['customer'] = output['order']['customer'] ?? {};
 *   output['order']['customer']['email'] = <value>;
 */
function buildNestedAssignment(path: string, valueExpr: string, indent = '  '): string {
  const parts = path.split('.');
  if (parts.length === 1) {
    return `${indent}output['${parts[0]}'] = ${valueExpr};`;
  }

  const lines: string[] = [];
  let objExpr = 'output';
  for (let i = 0; i < parts.length - 1; i++) {
    lines.push(`${indent}${objExpr}['${parts[i]}'] = (${objExpr}['${parts[i]}'] ?? {}) as Record<string, unknown>;`);
    objExpr = `(${objExpr}['${parts[i]}'] as Record<string, unknown>)`;
  }
  const lastPart = parts[parts.length - 1];
  lines.push(`${indent}${objExpr}['${lastPart}'] = ${valueExpr};`);
  return lines.join('\n');
}

// ─── MappingGenerator ────────────────────────────────────────────────────────

export class MappingGenerator {
  /**
   * Extrae los FieldMappings de los conflictos resueltos.
   */
  generate(resolvedConflicts: ResolvedConflict[]): FieldMapping[] {
    return resolvedConflicts
      .filter(rc => rc.mapping !== null)
      .map(rc => rc.mapping!);
  }

  /**
   * Genera una función TypeScript auto-contenida para transformar A→B (y B→A).
   * El output es un string seguro — nunca usa eval.
   */
  generateTypeScript(
    mappings: FieldMapping[],
    connectorAId: string,
    connectorBId: string,
  ): string {
    const now = new Date().toISOString();
    const atoBLines: string[] = [];
    const btoaLines: string[] = [];

    for (const mapping of mappings) {
      const { pathA, pathB, transform } = mapping;

      // A → B
      if (pathA && pathB) {
        const accessA = safeAccess(pathA);
        let valueExpr: string;

        switch (transform.kind) {
          case 'identity':
          case 'rename':
            valueExpr = `${accessA} ?? null`;
            break;
          case 'coerce_type':
            if (transform.coercionFn) {
              valueExpr = `((_v) => _v != null ? (${transform.coercionFn.replace(/\bv\b/g, '_v')}) : null)(${accessA})`;
            } else {
              valueExpr = `${accessA} ?? null`;
            }
            break;
          case 'constant':
            valueExpr = JSON.stringify(transform.constant ?? null);
            break;
          case 'split': {
            atoBLines.push(`  // ${transform.description}`);
            atoBLines.push(`  (() => {`);
            atoBLines.push(`    const _src = String(${accessA} ?? '').trim();`);
            atoBLines.push(`    if (!_src) return;`);
            if (transform.splitStrategy === 'regex' && transform.splitRegex) {
              atoBLines.push(`    const _parts = _src.split(new RegExp('${transform.splitRegex}'));`);
            } else {
              atoBLines.push(`    const _spaceIdx = _src.indexOf(' ');`);
              atoBLines.push(`    const _parts = _spaceIdx === -1 ? [_src, ''] : [_src.substring(0, _spaceIdx), _src.substring(_spaceIdx + 1)];`);
            }
            const targets = transform.toPaths ?? [pathB];
            targets.forEach((targetPath, i) => {
               atoBLines.push(buildNestedAssignment((targetPath as string), `_parts[${i}]`, '    '));
            });
            atoBLines.push(`  })();`);
            continue;
          }
          case 'merge': {
            atoBLines.push(`  // ${transform.description}`);
            if (transform.mergeStrategy === 'concat') {
              const sep = transform.mergeSeparator ?? ' ';
              const joinExpr = (transform.fromPaths ?? [pathA]).map(p => `(${safeAccess(p as string)} ?? '')`).join(` + '${sep}' + `);
              atoBLines.push(buildNestedAssignment(pathB, `(${joinExpr}).trim() || null`));
            } else {
              const fromParts = (transform.fromPaths ?? [pathA]).map(
                p => `'${(p as string).split('.').pop()}': ${safeAccess(p as string)}`,
              ).join(', ');
              atoBLines.push(buildNestedAssignment(pathB, `{ ${fromParts} }`));
            }
            continue;
          }
          default:
            throw new Error(`Unhandled transform kind: '${(transform as { kind: string }).kind}'`);
        }

        atoBLines.push(`  // ${transform.description}`);
        atoBLines.push(buildNestedAssignment(pathB, valueExpr));
      } else if (!pathA && pathB && transform.kind === 'constant') {
        // Campo solo en B con valor constante
        atoBLines.push(`  // ${transform.description}`);
        atoBLines.push(buildNestedAssignment(pathB, JSON.stringify(transform.constant ?? null)));
      } else if (!pathA && pathB) {
        // Campo nuevo en B — sin valor en A
        atoBLines.push(`  // ${transform.description}`);
        atoBLines.push(`  // output['${pathB}'] = undefined; // sin contraparte en A`);
      }

      // B → A (solo para mappings bidireccionales)
      if (mapping.bidirectional && pathA && pathB) {
        const accessB = safeAccess(pathB);
        let inverseExpr: string;

        if (mapping.inverseCoercionFn) {
          inverseExpr = `((_v) => _v != null ? (${mapping.inverseCoercionFn.replace(/\bv\b/g, '_v')}) : null)(${accessB})`;
        } else if (transform.kind === 'coerce_type' && transform.coercionFn) {
          // Inverso aproximado — marcar con comentario
          inverseExpr = `${accessB} ?? null /* inversa aproximada — verificar */`;
        } else {
          inverseExpr = `${accessB} ?? null`;
        }

        btoaLines.push(`  // ${transform.description} (inverso)`);
        btoaLines.push(buildNestedAssignment(pathA, inverseExpr));
      }
    }

    const header = `/**
 * Auto-generado por @integrax/schema-bridge
 * Conector A: ${connectorAId}  →  Conector B: ${connectorBId}
 * Generado: ${now}
 *
 * NO editar manualmente — regenerar con POST /api/connectors/compare
 */`;

    const aToBFn = `export function transform${pascal(connectorAId)}To${pascal(connectorBId)}(
  input: Record<string, unknown>
): Record<string, unknown> {
  const output: Record<string, unknown> = {};
${atoBLines.join('\n') || '  // Sin mapeos automáticos generados'}
  return output;
}`;

    const bToAFn = `export function transform${pascal(connectorBId)}To${pascal(connectorAId)}(
  input: Record<string, unknown>
): Record<string, unknown> {
  const output: Record<string, unknown> = {};
${btoaLines.join('\n') || '  // Sin mapeos bidireccionales disponibles'}
  return output;
}`;

    return [header, '', aToBFn, '', bToAFn].join('\n');
  }
}

function pascal(s: string): string {
  return s
    .replace(/[-_](.)/g, (_, c) => (c as string).toUpperCase())
    .replace(/^(.)/, (_, c) => (c as string).toUpperCase());
}

export function createMappingGenerator(): MappingGenerator {
  return new MappingGenerator();
}
