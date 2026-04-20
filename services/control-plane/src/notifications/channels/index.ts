/**
 * Notification channel registry
 *
 * To add a new channel:
 *   1. Create src/notifications/channels/<name>.ts
 *   2. Export `channel: NotificationChannel`
 *   3. Add one import line below — nothing else changes
 */

import type { NotificationChannel } from './_types.js';
export type { NotificationChannel, NotificationPayload } from './_types.js';

import { channel as slack }   from './slack.js';
import { channel as webhook } from './webhook.js';

export const NOTIFICATION_CHANNELS: NotificationChannel[] = [
  slack,
  webhook,
];
