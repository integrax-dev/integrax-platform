import { createLogger } from '@integrax/logger';
import { eventBus } from './event-bus.js';
import { NOTIFICATION_CHANNELS } from '../../notifications/channels/index.js';

const logger = createLogger({ service: 'notification-handler' });

const SEVERITY_EMOJI: Record<string, string> = {
  critical: '🔴',
  major:    '🟡',
  minor:    '⚪',
};

function buildText(p: Record<string, unknown>, incidentId?: string): string {
  const severity = String(p['severity'] ?? 'unknown');
  const emoji = SEVERITY_EMOJI[severity] ?? '⚪';
  return (
    `${emoji} *Schema drift detected* — \`${String(p['sourceId'] ?? '')}\`` +
    ` (${String(p['protocol'] ?? '').toUpperCase()})\n` +
    `Severity: *${severity}* · Impact: ${Math.round(Number(p['impactScore'] ?? 0) * 100)}% · ` +
    `Blast radius: ${(p['affectedTenants'] as unknown[])?.length ?? 0} tenant(s)\n` +
    `Incident ID: \`${incidentId ?? ''}\``
  );
}

export function registerNotificationHandlers(): void {
  eventBus.subscribe('conflict.detected', async (event) => {
    const p = event.payload as Record<string, unknown>;
    const payload = {
      text: buildText(p, event.entityId),
      eventData: p,
      incidentId: event.entityId,
    };

    const results = await Promise.allSettled(
      NOTIFICATION_CHANNELS.map(ch => ch.deliver(payload)),
    );

    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        logger.warn({ err: r.reason, channelIndex: i }, 'Notification delivery failed');
      }
    });
  });
}
