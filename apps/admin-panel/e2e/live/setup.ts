import { getAdminCreds, getApiBaseUrl, getWebBaseUrl, loginAdmin, newApiContext, writeLiveState, type LiveSeedState } from './_shared';

export default async function globalSetup(): Promise<void> {
  const apiBaseUrl = getApiBaseUrl();
  const webBaseUrl = getWebBaseUrl();
  const { email, password } = getAdminCreds();
  const runId = `incidents-${Date.now()}`;

  const apiAnon = await newApiContext(apiBaseUrl);
  const { user, token } = await loginAdmin(apiAnon, email, password);
  await apiAnon.dispose();

  const state: LiveSeedState = {
    apiBaseUrl,
    webBaseUrl,
    adminEmail: email,
    token,
    user,
    runId,
    sources: {},
    createdIncidentIds: [],
  };

  writeLiveState(state);
}
