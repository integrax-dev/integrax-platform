import type { ConnectorCapabilities } from '@integrax/connector-sdk';

export const afipWsfeCapabilities: ConnectorCapabilities = {
  invoice: { list: false, get: true, update: false, create: true }, // authorize = create; CAE is immutable
};
