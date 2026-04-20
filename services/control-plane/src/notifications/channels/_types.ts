export interface NotificationPayload {
  text: string;
  eventData: Record<string, unknown>;
  incidentId?: string;
}

export interface NotificationChannel {
  deliver(payload: NotificationPayload): Promise<void>;
}
