// Configuración de entornos multi-tenant
export type Environment = 'dev' | 'staging' | 'prod';

export const ENV: Environment = (process.env.NODE_ENV as Environment) || 'dev';

export function getTenantEnv(tenantId: string): Environment {
  // TODO: lógica para mapear tenant a entorno
  return ENV;
}
