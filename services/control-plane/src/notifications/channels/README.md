# notifications/channels/

Canal de notificación = un archivo. Cada archivo exporta `channel: NotificationChannel`.

`index.ts` construye el array `NOTIFICATION_CHANNELS`. `container/notification-handler.ts` suscribe al event-bus y hace loop sobre todos los canales.

**Para agregar un canal (ej. email):**
1. Crear `email.ts` exportando `channel: NotificationChannel`
2. Agregar un import en `index.ts`
3. Nada más cambia.

Canales actuales: `slack.ts` (env `SLACK_WEBHOOK_URL`), `webhook.ts` (env `ALERT_WEBHOOK_URL`).
