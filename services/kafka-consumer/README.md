# kafka-consumer

Consume topics Kafka (incluyendo Debezium CDC) y dispara workflows en Temporal.

Topics escuchados: `integrax.public.payments`, `integrax.public.orders`, `integrax.public.invoices`, `integrax.public.outbox`, `integrax.payments`, `integrax.orders`, `integrax.webhooks`.

Requiere: `KAFKA_BROKERS` (FATAL), `TEMPORAL_ADDRESS` (FATAL), `TEMPORAL_TASK_QUEUE`.
