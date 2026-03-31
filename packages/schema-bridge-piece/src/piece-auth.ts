/**
 * Tipo del contexto de autenticación que IntegraX inyecta en los pieces de Activepieces.
 * El framework tipifica ctx.auth como unknown — este contrato define la forma esperada.
 */
export interface SchemaBridgePieceAuth {
  /** ID interno del tenant en IntegraX (equivale al project/workspace del engine). */
  tenantRef: string;
  /** URL base del Control Plane (ej: https://api.integrax.io). */
  controlPlaneUrl: string;
  /** API key del tenant para autenticarse contra el Control Plane. */
  apiKey: string;
}
