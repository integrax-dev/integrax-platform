import type { ConnectorCapabilities } from '@integrax/connector-sdk';

export const mercadoPagoCapabilities: ConnectorCapabilities = {
  payment: { list: true, get: true, update: false, create: true },
  order:   { list: true, get: false, update: false, create: false },
};
