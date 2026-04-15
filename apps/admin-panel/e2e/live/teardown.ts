import { dismissIncident, newApiContext, readLiveState } from './_shared';

export default async function globalTeardown(): Promise<void> {
  try {
    const state = readLiveState();
    const api = await newApiContext(state.apiBaseUrl, state.token);
    for (const id of state.createdIncidentIds ?? []) {
      await dismissIncident(api, id);
    }
    await api.dispose();
  } catch {
    // best-effort
  }
}
