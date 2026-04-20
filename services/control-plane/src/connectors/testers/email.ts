import { ok, fail, connErr, type ConnectorTesterFn } from './_types.js';

export const connectorId = 'email';

export const testConnection: ConnectorTesterFn = async (credentials) => {
  const start = Date.now();
  const { smtp_host, smtp_port, smtp_user, smtp_password } = credentials;
  if (!smtp_host || !smtp_user || !smtp_password) return fail(start, 'MISSING_CREDENTIALS', 'smtp_host, smtp_user, smtp_password required');
  try {
    const nodemailer = await import('nodemailer');
    const transport = nodemailer.createTransport({
      host: smtp_host,
      port: parseInt(smtp_port ?? '587', 10),
      secure: smtp_port === '465',
      auth: { user: smtp_user, pass: smtp_password },
      connectionTimeout: 10000,
    });
    await transport.verify();
    transport.close();
    return ok(start, { host: smtp_host, user: smtp_user });
  } catch (e) { return connErr(start, e); }
};
