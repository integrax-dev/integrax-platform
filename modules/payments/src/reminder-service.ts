/**
 * ReminderService
 *
 * Sends payment reminders via notification channels (email, WhatsApp, SMS).
 * Actual message dispatch is delegated to the notification connector (email / whatsapp)
 * through the event-bus. This service only records the reminder action in the timeline.
 */

import { ulid } from '@integrax/entities';
import type { EventBus } from '@integrax/event-bus';
import type { TimelineStore } from '@integrax/timeline';
import type { SendPaymentReminderInput } from './types.js';

export class ReminderService {
  constructor(
    private readonly bus: EventBus,
    private readonly timeline?: TimelineStore,
  ) {}

  async sendPaymentReminder(input: SendPaymentReminderInput): Promise<void> {
    const now = new Date();

    // Emit a notification event; the email or WhatsApp connector subscribes to it.
    await this.bus.publish({
      id: ulid(),
      type: 'payment.reminder.sent',
      tenantId: input.tenantId,
      sourceSystem: 'module-payments',
      entityType: 'payment',
      entityId: input.paymentId,
      payload: {
        paymentId: input.paymentId,
        channel: input.channel,
        recipientId: input.recipientId,
        recipientContact: input.recipientContact,
        message: input.message,
      },
      occurredAt: now,
    });

    await this.timeline?.append(input.tenantId, {
      kind: 'sync',
      tenantId: input.tenantId,
      occurredAt: now,
      sourceSystem: 'module-payments',
      trigger: 'manual',
      entityType: 'payment',
      recordsFetched: 0,
      recordsChanged: 0,
      cursor: null,
      cursorAfter: null,
      durationMs: 0,
      note: `Reminder sent via ${input.channel} for payment ${input.paymentId}`,
    });
  }
}
