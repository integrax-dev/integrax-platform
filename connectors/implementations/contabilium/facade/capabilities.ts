import type { ConnectorCapabilities } from '@integrax/connector-sdk';

export const contabiliumCapabilities: ConnectorCapabilities = {
  customer: { list: true, get: true, update: true, create: true },
  product:  { list: true, get: true, update: true, create: true },
  invoice:  { list: true, get: true, update: false, create: true }, // fiscal immutability: no update
};
