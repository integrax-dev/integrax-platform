import type { ConnectorCapabilities } from '@integrax/connector-sdk';

export const googleSheetsCapabilities: ConnectorCapabilities = {
  row: { list: true, get: true, update: true, create: true },
};
