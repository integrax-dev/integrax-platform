/**
 * Configuration loader for reconciliation engine.
 * Loads default policies and conflict action metadata from JSON files.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { ReconciliationConfig, PolicyRule, ConflictActionConfig } from './types.js';
import type { InvoiceConflictType } from '../entities/invoice/diff.js';
import type { CustomerConflictType } from '../entities/customer/diff.js';
import type { ProductConflictType } from '../entities/product/diff.js';

// Resolve the config directory path relative to this file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CONFIG_DIR = join(__dirname, '../../config');

// Cache for loaded configuration
let cachedConfig: ReconciliationConfig | null = null;

/**
 * Loads a JSON file from the config directory.
 */
function loadJsonFile<T>(filename: string): T {
  const filePath = join(CONFIG_DIR, filename);
  const content = readFileSync(filePath, 'utf-8');
  return JSON.parse(content) as T;
}

/**
 * Loads the default reconciliation configuration from JSON files.
 * Results are cached after the first load.
 */
export function loadDefaultConfig(): ReconciliationConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const invoicePolicy = loadJsonFile<PolicyRule<InvoiceConflictType>[]>('default-invoice-policy.json');
  const customerPolicy = loadJsonFile<PolicyRule<CustomerConflictType>[]>('default-customer-policy.json');
  const productPolicy = loadJsonFile<PolicyRule<ProductConflictType>[]>('default-product-policy.json');
  const conflictActions = loadJsonFile<Record<string, ConflictActionConfig>>('conflict-actions.json');

  cachedConfig = {
    invoicePolicy,
    customerPolicy,
    productPolicy,
    conflictActions,
  };

  return cachedConfig;
}

/**
 * Merges tenant-specific overrides with the default configuration.
 * Tenant overrides take precedence over defaults.
 */
export function mergeConfig(
  base: ReconciliationConfig,
  overrides: Partial<ReconciliationConfig>,
): ReconciliationConfig {
  return {
    invoicePolicy: overrides.invoicePolicy ?? base.invoicePolicy,
    customerPolicy: overrides.customerPolicy ?? base.customerPolicy,
    productPolicy: overrides.productPolicy ?? base.productPolicy,
    conflictActions: overrides.conflictActions
      ? { ...base.conflictActions, ...overrides.conflictActions }
      : base.conflictActions,
    tolerances: overrides.tolerances
      ? {
          invoice: { ...base.tolerances?.invoice, ...overrides.tolerances.invoice },
          product: { ...base.tolerances?.product, ...overrides.tolerances.product },
        }
      : base.tolerances,
  };
}

/**
 * Clears the cached configuration, forcing a reload on the next call to loadDefaultConfig().
 * Useful for testing or when configuration files are updated at runtime.
 */
export function clearConfigCache(): void {
  cachedConfig = null;
}
