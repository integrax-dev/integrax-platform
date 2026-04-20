/**
 * Module handler registry
 *
 * To add a new module handler:
 *   1. Create src/platform/container/module-handlers/<module>.ts
 *   2. Export `moduleId: string` and `handle: ModuleHandlerFn`
 *   3. Add one import line below — nothing else changes
 */

import type { ModuleHandlerFn } from './_types.js';
export type { ModuleHandlerFn, ModuleHandlerDef } from './_types.js';

import * as billing   from './billing.js';
import * as inventory from './inventory.js';
import * as payments  from './payments.js';
import * as ecommerce from './ecommerce.js';

const handlers = [billing, inventory, payments, ecommerce];

export const moduleHandlers: Record<string, ModuleHandlerFn> = Object.fromEntries(
  handlers.map(h => [h.moduleId, h.handle]),
);
