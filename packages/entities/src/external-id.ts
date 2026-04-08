/** Referencia a una entidad en un sistema externo. */
export interface ExternalId {
  /** Identificador del conector o sistema, por ejemplo 'mercadopago', 'contabilium' o 'afip'. */
  system: string;
  /** Valor del ID tal como lo provee ese sistema. */
  id: string;
}
