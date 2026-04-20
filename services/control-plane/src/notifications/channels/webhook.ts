import type { NotificationChannel } from './_types.js';

export const channel: NotificationChannel = {
  async deliver({ eventData, incidentId }) {
    const url = process.env.ALERT_WEBHOOK_URL;
    if (!url) return;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'drift.incident.created', ...eventData, incidentId }),
    });
  },
};
