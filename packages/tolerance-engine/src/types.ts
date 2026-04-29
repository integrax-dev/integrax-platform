export type ToleranceStrategy =
  | 'absolute'    // |a - b| <= value
  | 'relative'    // |a - b| / max(|a|, |b|) <= value  (0..1)
  | 'percentage'  // same as relative but value expressed as 0..100
  | 'exact'       // must be strictly equal
  | 'always_pass' // never flag divergence for this field

export interface TolerancePolicy {
  id: string;
  /** undefined = platform-wide default */
  tenantId?: string;
  /** undefined = applies to all entity types */
  entityType?: string;
  /** undefined = applies to all fields */
  field?: string;
  /** undefined = applies to all connector pairs */
  connectorPair?: readonly [string, string];
  /** ISO 3166-1 alpha-2 country code — narrows scope to a specific country */
  country?: string;
  /** ISO 4217 currency code — narrows scope to a specific currency (e.g. 'ARS', 'USD') */
  currency?: string;
  strategy: ToleranceStrategy;
  /** Threshold value — meaning depends on strategy */
  value: number;
  /** Informational only (%, ARS, USD, …) */
  unit?: string;
  /** Higher priority is evaluated first; first matching policy wins */
  priority: number;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type ToleranceEvaluationResult =
  | { pass: true;  policy: TolerancePolicy | null }
  | { pass: false; policy: TolerancePolicy | null; deviation: number; threshold: number };

export interface ToleranceLookupKey {
  tenantId: string;
  entityType?: string;
  field?: string;
  connectorA?: string;
  connectorB?: string;
  /** ISO 3166-1 alpha-2 country code of the operation context */
  country?: string;
  /** ISO 4217 currency code of the field being evaluated */
  currency?: string;
}
