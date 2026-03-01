"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createOrder = createOrder;
exports.processPayment = processPayment;
exports.generateInvoice = generateInvoice;
exports.sendOrderConfirmation = sendOrderConfirmation;
exports.updateInventory = updateInventory;
exports.publishOrderEvent = publishOrderEvent;
const logger_js_1 = require("../utils/logger.js");
/**
 * Order Activities
 *
 * Activities for the order fulfillment workflow.
 */
const pg_1 = require("pg");
const kafkajs_1 = require("kafkajs");
// Database connection
let pool = null;
function getPool() {
    if (!pool) {
        if (!process.env.POSTGRES_HOST)
            throw new Error('POSTGRES_HOST is required');
        if (!process.env.POSTGRES_USER)
            throw new Error('POSTGRES_USER is required');
        if (!process.env.POSTGRES_PASSWORD)
            throw new Error('POSTGRES_PASSWORD is required');
        pool = new pg_1.Pool({
            host: process.env.POSTGRES_HOST,
            port: parseInt(process.env.POSTGRES_PORT || '5432'),
            user: process.env.POSTGRES_USER,
            password: process.env.POSTGRES_PASSWORD,
            database: process.env.POSTGRES_DB || 'integrax',
        });
    }
    return pool;
}
// Kafka
let kafka = null;
function getKafka() {
    if (!kafka) {
        if (!process.env.KAFKA_BROKERS)
            throw new Error('KAFKA_BROKERS is required');
        kafka = new kafkajs_1.Kafka({
            clientId: 'integrax-temporal-worker',
            brokers: process.env.KAFKA_BROKERS.split(','),
        });
    }
    return kafka;
}
/**
 * Create order in database
 */
async function createOrder(input) {
    const db = getPool();
    await db.query(`
    INSERT INTO orders (
      external_id, tenant_id, customer_email, customer_name,
      total_amount, currency, status, items, metadata
    ) VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $8)
    ON CONFLICT (external_id) DO UPDATE SET
      status = 'pending',
      updated_at = NOW()
    `, [
        input.orderId,
        input.tenantId,
        input.customer.email,
        input.customer.name,
        input.totalAmount,
        input.currency,
        JSON.stringify(input.items),
        JSON.stringify({
            correlationId: input.correlationId,
            customerTaxId: input.customer.taxId,
        }),
    ]);
    return { orderId: input.orderId };
}
/**
 * Process payment for order
 */
async function processPayment(input) {
    const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
    if (!accessToken) {
        throw new Error('MERCADOPAGO_ACCESS_TOKEN not configured');
    }
    // Create MercadoPago preference
    const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            items: [
                {
                    id: input.orderId,
                    title: `Orden ${input.orderId}`,
                    quantity: 1,
                    currency_id: input.currency,
                    unit_price: input.amount,
                },
            ],
            payer: {
                email: input.customer.email,
                name: input.customer.name,
            },
            external_reference: input.orderId,
            auto_return: 'approved',
        }),
    });
    if (!response.ok) {
        const error = await response.json();
        throw new Error(`MercadoPago error: ${JSON.stringify(error)}`);
    }
    const data = await response.json();
    // In a real scenario, we'd wait for the webhook. For now, return preference ID
    return {
        paymentId: data.id,
        status: 'pending',
    };
}
/**
 * Generate invoice for order
 */
async function generateInvoice(input) {
    const db = getPool();
    // Generate invoice number (simple version)
    const invoiceNumber = `INV-${Date.now()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
    const invoiceId = crypto.randomUUID();
    // Get order ID from database
    const orderResult = await db.query('SELECT id FROM orders WHERE external_id = $1', [input.orderId]);
    const orderId = orderResult.rows[0]?.id;
    await db.query(`
    INSERT INTO invoices (
      external_id, tenant_id, order_id, invoice_number,
      customer_email, customer_name, customer_tax_id,
      total_amount, tax_amount, currency, status, issued_at, metadata
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'issued', NOW(), $11)
    `, [
        invoiceId,
        input.tenantId,
        orderId,
        invoiceNumber,
        input.customer.email,
        input.customer.name,
        input.customer.taxId,
        input.totalAmount,
        Math.round(input.totalAmount * 0.21 * 100) / 100, // 21% IVA
        input.currency,
        JSON.stringify({
            correlationId: input.correlationId,
            items: input.items,
        }),
    ]);
    // In the future, this would call AFIP WSFE for electronic invoicing
    logger_js_1.logger.info(`[INVOICE] Generated invoice ${invoiceNumber} for order ${input.orderId}`);
    return {
        invoiceId,
        invoiceNumber,
    };
}
/**
 * Send order confirmation email
 */
async function sendOrderConfirmation(input) {
    // Placeholder: In production, this would integrate with an email service
    logger_js_1.logger.info(`[EMAIL] Sending confirmation to ${input.customer.email}`);
    logger_js_1.logger.info(`  Order: ${input.orderId}`);
    logger_js_1.logger.info(`  Total: ${input.currency} ${input.totalAmount}`);
    logger_js_1.logger.info(`  Items: ${input.items.map(i => `${i.name} x${i.quantity}`).join(', ')}`);
    if (input.invoiceId) {
        logger_js_1.logger.info(`  Invoice: ${input.invoiceId}`);
    }
    // Publish notification event
    const kafka = getKafka();
    const producer = kafka.producer();
    await producer.connect();
    try {
        await producer.send({
            topic: 'integrax.notifications',
            messages: [
                {
                    key: input.tenantId,
                    value: JSON.stringify({
                        type: 'order_confirmation',
                        tenantId: input.tenantId,
                        to: input.customer.email,
                        data: {
                            orderId: input.orderId,
                            customerName: input.customer.name,
                            items: input.items,
                            total: `${input.currency} ${input.totalAmount}`,
                            invoiceId: input.invoiceId,
                            paymentId: input.paymentId,
                        },
                        timestamp: new Date().toISOString(),
                    }),
                },
            ],
        });
    }
    finally {
        await producer.disconnect();
    }
}
/**
 * Update inventory
 */
async function updateInventory(input) {
    // Placeholder: In production, this would update an inventory service
    logger_js_1.logger.info(`[INVENTORY] Updating inventory for tenant ${input.tenantId}`);
    for (const item of input.items) {
        const delta = input.action === 'decrease' ? -item.quantity : item.quantity;
        logger_js_1.logger.info(`  Product ${item.productId}: ${delta > 0 ? '+' : ''}${delta}`);
    }
    // Publish inventory event
    const kafka = getKafka();
    const producer = kafka.producer();
    await producer.connect();
    try {
        await producer.send({
            topic: 'integrax.inventory',
            messages: [
                {
                    key: input.tenantId,
                    value: JSON.stringify({
                        type: `inventory.${input.action}`,
                        tenantId: input.tenantId,
                        items: input.items,
                        timestamp: new Date().toISOString(),
                    }),
                },
            ],
        });
    }
    finally {
        await producer.disconnect();
    }
}
/**
 * Publish order event to Kafka
 */
async function publishOrderEvent(input) {
    const kafka = getKafka();
    const producer = kafka.producer();
    await producer.connect();
    try {
        await producer.send({
            topic: 'integrax.orders',
            messages: [
                {
                    key: input.orderId,
                    value: JSON.stringify({
                        eventId: crypto.randomUUID(),
                        eventType: input.eventType,
                        tenantId: input.tenantId,
                        correlationId: input.correlationId,
                        timestamp: new Date().toISOString(),
                        data: {
                            orderId: input.orderId,
                            ...input.data,
                        },
                    }),
                    headers: {
                        'correlation-id': input.correlationId,
                        'tenant-id': input.tenantId,
                    },
                },
            ],
        });
    }
    finally {
        await producer.disconnect();
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoib3JkZXItYWN0aXZpdGllcy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIm9yZGVyLWFjdGl2aXRpZXMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFzSUEsa0NBNkJDO0FBS0Qsd0NBK0NDO0FBS0QsMENBa0RDO0FBS0Qsc0RBMENDO0FBS0QsMENBZ0NDO0FBS0QsOENBZ0NDO0FBdllELGtEQUE0QztBQUM1Qzs7OztHQUlHO0FBRUgsMkJBQTBCO0FBQzFCLHFDQUFnQztBQXlGaEMsc0JBQXNCO0FBQ3RCLElBQUksSUFBSSxHQUFnQixJQUFJLENBQUM7QUFFN0IsU0FBUyxPQUFPO0lBQ2QsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDO1FBQ1YsSUFBSSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsYUFBYTtZQUFFLE1BQU0sSUFBSSxLQUFLLENBQUMsMkJBQTJCLENBQUMsQ0FBQztRQUM3RSxJQUFJLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxhQUFhO1lBQUUsTUFBTSxJQUFJLEtBQUssQ0FBQywyQkFBMkIsQ0FBQyxDQUFDO1FBQzdFLElBQUksQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLGlCQUFpQjtZQUFFLE1BQU0sSUFBSSxLQUFLLENBQUMsK0JBQStCLENBQUMsQ0FBQztRQUVyRixJQUFJLEdBQUcsSUFBSSxTQUFJLENBQUM7WUFDZCxJQUFJLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxhQUFhO1lBQy9CLElBQUksRUFBRSxRQUFRLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxhQUFhLElBQUksTUFBTSxDQUFDO1lBQ25ELElBQUksRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLGFBQWE7WUFDL0IsUUFBUSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsaUJBQWlCO1lBQ3ZDLFFBQVEsRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLFdBQVcsSUFBSSxVQUFVO1NBQ2hELENBQUMsQ0FBQztJQUNMLENBQUM7SUFDRCxPQUFPLElBQUksQ0FB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R0FBRyxLQUFLLENBQUMsUUFBUSxFQUFFLENBQUM7SUFDbEMsTUFBTSxRQUFRLENBQUMsT0FBTyxFQUFFLENBQUM7SUFFekIsSUFBSSxDQUFDO1FBQ0gsTUFBTSxRQUFRLENBQUMsSUFBSSxDQUFDO1lBQ2xCLEtBQUssRUFBRSxpQkFBaUI7WUFDeEIsUUFBUSxFQUFFO2dCQUNSO29CQUNFLEdBQUcsRUFBRSxLQUFLLENBQUMsT0FBTztvQkFDbEIsS0FBSyxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUM7d0JBQ3BCLE9BQU8sRUFBRSxNQUFNLENBQUMsVUFBVSxFQUFFO3dCQUM1QixTQUFTLEVBQUUsS0FBSyxDQUFDLFNBQVM7d0JBQzFCLFFBQVEsRUFBRSxLQUFLLENBQUMsUUFBUTt3QkFDeEIsYUFBYSxFQUFFLEtBQUssQ0FBQyxhQUFhO3dCQUNsQyxTQUFTLEVBQUUsSUFBSSxJQUFJLEVBQUUsQ0FBQyxXQUFXLEVBQUU7d0JBQ25DLElBQUksRUFBRTs0QkFDSixPQUFPLEVBQUUsS0FBSyxDQUFDLE9BQU87NEJBQ3RCLEdBQUcsS0FBSyxDQUFDLElBQUk7eUJBQ2Q7cUJBQ0YsQ0FBQztvQkFDRixPQUFPLEVBQUU7d0JBQ1AsZ0JBQWdCLEVBQUUsS0FBSyxDQUFDLGFBQWE7d0JBQ3JDLFdBQVcsRUFBRSxLQUFLLENBQUMsUUFBUTtxQkFDNUI7aUJBQ0Y7YUFDRjtTQUNGLENBQUMsQ0FBQztJQUNMLENBQUM7WUFBUyxDQUFDO1FBQ1QsTUFBTSxRQUFRLENBQUMsVUFBVSxFQUFFLENBQUM7SUFDOUIsQ0FBQztBQUNILENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBsb2dnZXIgfSBmcm9tICcuLi91dGlscy9sb2dnZXIuanMnO1xyXG4vKipcclxuICogT3JkZXIgQWN0aXZpdGllc1xyXG4gKlxyXG4gKiBBY3Rpdml0aWVzIGZvciB0aGUgb3JkZXIgZnVsZmlsbG1lbnQgd29ya2Zsb3cuXHJcbiAqL1xyXG5cclxuaW1wb3J0IHsgUG9vbCB9IGZyb20gJ3BnJztcclxuaW1wb3J0IHsgS2Fma2EgfSBmcm9tICdrYWZrYWpzJztcclxuXHJcbi8vIFR5cGVzXHJcbmV4cG9ydCBpbnRlcmZhY2UgQ3JlYXRlT3JkZXJJbnB1dCB7XHJcbiAgb3JkZXJJZDogc3RyaW5nO1xyXG4gIHRlbmFudElkOiBzdHJpbmc7XHJcbiAgY29ycmVsYXRpb25JZDogc3RyaW5nO1xyXG4gIGN1c3RvbWVyOiB7XHJcbiAgICBlbWFpbDogc3RyaW5nO1xyXG4gICAgbmFtZTogc3RyaW5nO1xyXG4gICAgdGF4SWQ/OiBzdHJpbmc7XHJcbiAgfTtcclxuICBpdGVtczogQXJyYXk8e1xyXG4gICAgcHJvZHVjdElkOiBzdHJpbmc7XHJcbiAgICBuYW1lOiBzdHJpbmc7XHJcbiAgICBxdWFudGl0eTogbnVtYmVyO1xyXG4gICAgdW5pdFByaWNlOiBudW1iZXI7XHJcbiAgfT47XHJcbiAgdG90YWxBbW91bnQ6IG51bWJlcjtcclxuICBjdXJyZW5jeTogc3RyaW5nO1xyXG59XHJcblxyXG5leHBvcnQgaW50ZXJmYWNlIFByb2Nlc3NQYXltZW50SW5wdXQge1xyXG4gIG9yZGVySWQ6IHN0cmluZztcclxuICB0ZW5hbnRJZDogc3RyaW5nO1xyXG4gIGFtb3VudDogbnVtYmVyO1xyXG4gIGN1cnJlbmN5OiBzdHJpbmc7XHJcbiAgbWV0aG9kOiBzdHJpbmc7XHJcbiAgY3VzdG9tZXI6IHtcclxuICAgIGVtYWlsOiBzdHJpbmc7XHJcbiAgICBuYW1lOiBzdHJpbmc7XHJcbiAgfTtcclxufVxyXG5cclxuZXhwb3J0IGludGVyZmFjZSBHZW5lcmF0ZUludm9pY2VJbnB1dCB7XHJcbiAgb3JkZXJJZDogc3RyaW5nO1xyXG4gIHRlbmFudElkOiBzdHJpbmc7XHJcbiAgY29ycmVsYXRpb25JZDogc3RyaW5nO1xyXG4gIGN1c3RvbWVyOiB7XHJcbiAgICBlbWFpbDogc3RyaW5nO1xyXG4gICAgbmFtZTogc3RyaW5nO1xyXG4gICAgdGF4SWQ/OiBzdHJpbmc7XHJcbiAgfTtcclxuICBpdGVtczogQXJyYXk8e1xyXG4gICAgcHJvZHVjdElkOiBzdHJpbmc7XHJcbiAgICBuYW1lOiBzdHJpbmc7XHJcbiAgICBxdWFudGl0eTogbnVtYmVyO1xyXG4gICAgdW5pdFByaWNlOiBudW1iZXI7XHJcbiAgfT47XHJcbiAgdG90YWxBbW91bnQ6IG51bWJlcjtcclxuICBjdXJyZW5jeTogc3RyaW5nO1xyXG59XHJcblxyXG5leHBvcnQgaW50ZXJmYWNlIFNlbmRPcmRlckNvbmZpcm1hdGlvbklucHV0IHtcclxuICBvcmRlcklkOiBzdHJpbmc7XHJcbiAgdGVuYW50SWQ6IHN0cmluZztcclxuICBjdXN0b21lcjoge1xyXG4gICAgZW1haWw6IHN0cmluZztcclxuICAgIG5hbWU6IHN0cmluZztcclxuICB9O1xyXG4gIGl0ZW1zOiBBcnJheTx7XHJcbiAgICBwcm9kdWN0SWQ6IHN0cmluZztcclxuICAgIG5hbWU6IHN0cmluZztcclxuICAgIHF1YW50aXR5OiBudW1iZXI7XHJcbiAgICB1bml0UHJpY2U6IG51bWJlcjtcclxuICB9PjtcclxuICB0b3RhbEFtb3VudDogbnVtYmVyO1xyXG4gIGN1cnJlbmN5OiBzdHJpbmc7XHJcbiAgaW52b2ljZUlkPzogc3RyaW5nO1xyXG4gIHBheW1lbnRJZD86IHN0cmluZztcclxufVxyXG5cclxuZXhwb3J0IGludGVyZmFjZSBVcGRhdGVJbnZlbnRvcnlJbnB1dCB7XHJcbiAgdGVuYW50SWQ6IHN0cmluZztcclxuICBpdGVtczogQXJyYXk8e1xyXG4gICAgcHJvZHVjdElkOiBzdHJpbmc7XHJcbiAgICBxdWFudGl0eTogbnVtYmVyO1xyXG4gIH0+O1xyXG4gIGFjdGlvbjogJ2luY3JlYXNlJyB8ICdkZWNyZWFzZSc7XHJcbn1cclxuXHJcbmV4cG9ydCBpbnRlcmZhY2UgUHVibGlzaE9yZGVyRXZlbnRJbnB1dCB7XHJcbiAgb3JkZXJJZDogc3RyaW5nO1xyXG4gIHRlbmFudElkOiBzdHJpbmc7XHJcbiAgY29ycmVsYXRpb25JZDogc3RyaW5nO1xyXG4gIGV2ZW50VHlwZTogc3RyaW5nO1xyXG4gIGRhdGE6IFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xyXG59XHJcblxyXG4vLyBEYXRhYmFzZSBjb25uZWN0aW9uXHJcbmxldCBwb29sOiBQb29sIHwgbnVsbCA9IG51bGw7XHJcblxyXG5mdW5jdGlvbiBnZXRQb29sKCk6IFBvb2wge1xyXG4gIGlmICghcG9vbCkge1xyXG4gICAgaWYgKCFwcm9jZXNzLmVudi5QT1NUR1JFU19IT1NUKSB0aHJvdyBuZXcgRXJyb3IoJ1BPU1RHUkVTX0hPU1QgaXMgcmVxdWlyZWQnKTtcclxuICAgIGlmICghcHJvY2Vzcy5lbnYuUE9TVEdSRVNfVVNFUikgdGhyb3cgbmV3IEVycm9yKCdQT1NUR1JFU19VU0VSIGlzIHJlcXVpcmVkJyk7XHJcbiAgICBpZiAoIXByb2Nlc3MuZW52LlBPU1RHUkVTX1BBU1NXT1JEKSB0aHJvdyBuZXcgRXJyb3IoJ1BPU1RHUkVTX1BBU1NXT1JEIGlzIHJlcXVpcmVkJyk7XHJcblxyXG4gICAgcG9vbCA9IG5ldyBQb29sKHtcclxuICAgICAgaG9zdDogcHJvY2Vzcy5lbnYuUE9TVEdSRVNfSE9TVCxcclxuICAgICAgcG9ydDogcGFyc2VJbnQocHJvY2Vzcy5lbnYuUE9TVEdSRVNfUE9SVCB8fCAnNTQzMicpLFxyXG4gICAgICB1c2VyOiBwcm9jZXNzLmVudi5QT1NUR1JFU19VU0VSLFxyXG4gICAgICBwYXNzd29yZDogcHJvY2Vzcy5lbnYuUE9TVEdSRVNfUEFTU1dPUkQsXHJcbiAgICAgIGRhdGFiYXNlOiBwcm9jZXNzLmVudi5QT1NUR1JFU19EQiB8fCAnaW50ZWdyYXgnLFxyXG4gICAgfSk7XHJcbiAgfVxyXG4gIHJldHVybiBwb29sO1xyXG59XHJcblxyXG4vLyBLYWZrYVxyXG5sZXQga2Fma2E6IEthZmthIHwgbnVsbCA9IG51bGw7XHJcblxyXG5mdW5jdGlvbiBnZXRLYWZrYSgpOiBLYWZrYSB7XHJcbiAgaWYgKCFrYWZrYSkge1xyXG4gICAgaWYgKCFwcm9jZXNzLmVudi5LQUZLQV9CUk9LRVJTKSB0aHJvdyBuZXcgRXJyb3IoJ0tBRktBX0JST0tFUlMgaXMgcmVxdWlyZWQnKTtcclxuICAgIGthZmthID0gbmV3IEthZmthKHtcclxuICAgICAgY2xpZW50SWQ6ICdpbnRlZ3JheC10ZW1wb3JhbC13b3JrZXInLFxyXG4gICAgICBicm9rZXJzOiBwcm9jZXNzLmVudi5LQUZLQV9CUk9LRVJTLnNwbGl0KCcsJyksXHJcbiAgICB9KTtcclxuICB9XHJcbiAgcmV0dXJuIGthZmthO1xyXG59XHJcblxyXG4vKipcclxuICogQ3JlYXRlIG9yZGVyIGluIGRhdGFiYXNlXHJcbiAqL1xyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gY3JlYXRlT3JkZXIoaW5wdXQ6IENyZWF0ZU9yZGVySW5wdXQpOiBQcm9taXNlPHsgb3JkZXJJZDogc3RyaW5nIH0+IHtcclxuICBjb25zdCBkYiA9IGdldFBvb2woKTtcclxuXHJcbiAgYXdhaXQgZGIucXVlcnkoXHJcbiAgICBgXHJcbiAgICBJTlNFUlQgSU5UTyBvcmRlcnMgKFxyXG4gICAgICBleHRlcm5hbF9pZCwgdGVuYW50X2lkLCBjdXN0b21lcl9lbWFpbCwgY3VzdG9tZXJfbmFtZSxcclxuICAgICAgdG90YWxfYW1vdW50LCBjdXJyZW5jeSwgc3RhdHVzLCBpdGVtcywgbWV0YWRhdGFcclxuICAgICkgVkFMVUVTICgkMSwgJDIsICQzLCAkNCwgJDUsICQ2LCAncGVuZGluZycsICQ3LCAkOClcclxuICAgIE9OIENPTkZMSUNUIChleHRlcm5hbF9pZCkgRE8gVVBEQVRFIFNFVFxyXG4gICAgICBzdGF0dXMgPSAncGVuZGluZycsXHJcbiAgICAgIHVwZGF0ZWRfYXQgPSBOT1coKVxyXG4gICAgYCxcclxuICAgIFtcclxuICAgICAgaW5wdXQub3JkZXJJZCxcclxuICAgICAgaW5wdXQudGVuYW50SWQsXHJcbiAgICAgIGlucHV0LmN1c3RvbWVyLmVtYWlsLFxyXG4gICAgICBpbnB1dC5jdXN0b21lci5uYW1lLFxyXG4gICAgICBpbnB1dC50b3RhbEFtb3VudCxcclxuICAgICAgaW5wdXQuY3VycmVuY3ksXHJcbiAgICAgIEpTT04uc3RyaW5naWZ5KGlucHV0Lml0ZW1zKSxcclxuICAgICAgSlNPTi5zdHJpbmdpZnkoe1xyXG4gICAgICAgIGNvcnJlbGF0aW9uSWQ6IGlucHV0LmNvcnJlbGF0aW9uSWQsXHJcbiAgICAgICAgY3VzdG9tZXJUYXhJZDogaW5wdXQuY3VzdG9tZXIudGF4SWQsXHJcbiAgICAgIH0pLFxyXG4gICAgXVxyXG4gICk7XHJcblxyXG4gIHJldHVybiB7IG9yZGVySWQ6IGlucHV0Lm9yZGVySWQgfTtcclxufVxyXG5cclxuLyoqXHJcbiAqIFByb2Nlc3MgcGF5bWVudCBmb3Igb3JkZXJcclxuICovXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBwcm9jZXNzUGF5bWVudChcclxuICBpbnB1dDogUHJvY2Vzc1BheW1lbnRJbnB1dFxyXG4pOiBQcm9taXNlPHsgcGF5bWVudElkOiBzdHJpbmc7IHN0YXR1czogc3RyaW5nIH0+IHtcclxuICBjb25zdCBhY2Nlc3NUb2tlbiA9IHByb2Nlc3MuZW52Lk1FUkNBRE9QQUdPX0FDQ0VTU19UT0tFTjtcclxuXHJcbiAgaWYgKCFhY2Nlc3NUb2tlbikge1xyXG4gICAgdGhyb3cgbmV3IEVycm9yKCdNRVJDQURPUEFHT19BQ0NFU1NfVE9LRU4gbm90IGNvbmZpZ3VyZWQnKTtcclxuICB9XHJcblxyXG4gIC8vIENyZWF0ZSBNZXJjYWRvUGFnbyBwcmVmZXJlbmNlXHJcbiAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaCgnaHR0cHM6Ly9hcGkubWVyY2Fkb3BhZ28uY29tL2NoZWNrb3V0L3ByZWZlcmVuY2VzJywge1xyXG4gICAgbWV0aG9kOiAnUE9TVCcsXHJcbiAgICBoZWFkZXJzOiB7XHJcbiAgICAgIEF1dGhvcml6YXRpb246IGBCZWFyZXIgJHthY2Nlc3NUb2tlbn1gLFxyXG4gICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxyXG4gICAgfSxcclxuICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcclxuICAgICAgaXRlbXM6IFtcclxuICAgICAgICB7XHJcbiAgICAgICAgICBpZDogaW5wdXQub3JkZXJJZCxcclxuICAgICAgICAgIHRpdGxlOiBgT3JkZW4gJHtpbnB1dC5vcmRlcklkfWAsXHJcbiAgICAgICAgICBxdWFudGl0eTogMSxcclxuICAgICAgICAgIGN1cnJlbmN5X2lkOiBpbnB1dC5jdXJyZW5jeSxcclxuICAgICAgICAgIHVuaXRfcHJpY2U6IGlucHV0LmFtb3VudCxcclxuICAgICAgICB9LFxyXG4gICAgICBdLFxyXG4gICAgICBwYXllcjoge1xyXG4gICAgICAgIGVtYWlsOiBpbnB1dC5jdXN0b21lci5lbWFpbCxcclxuICAgICAgICBuYW1lOiBpbnB1dC5jdXN0b21lci5uYW1lLFxyXG4gICAgICB9LFxyXG4gICAgICBleHRlcm5hbF9yZWZlcmVuY2U6IGlucHV0Lm9yZGVySWQsXHJcbiAgICAgIGF1dG9fcmV0dXJuOiAnYXBwcm92ZWQnLFxyXG4gICAgfSksXHJcbiAgfSk7XHJcblxyXG4gIGlmICghcmVzcG9uc2Uub2spIHtcclxuICAgIGNvbnN0IGVycm9yID0gYXdhaXQgcmVzcG9uc2UuanNvbigpO1xyXG4gICAgdGhyb3cgbmV3IEVycm9yKGBNZXJjYWRvUGFnbyBlcnJvcjogJHtKU09OLnN0cmluZ2lmeShlcnJvcil9YCk7XHJcbiAgfVxyXG5cclxuICBjb25zdCBkYXRhID0gYXdhaXQgcmVzcG9uc2UuanNvbigpIGFzIHsgaWQ6IHN0cmluZyB9O1xyXG5cclxuICAvLyBJbiBhIHJlYWwgc2NlbmFyaW8sIHdlJ2Qgd2FpdCBmb3IgdGhlIHdlYmhvb2suIEZvciBub3csIHJldHVybiBwcmVmZXJlbmNlIElEXHJcbiAgcmV0dXJuIHtcclxuICAgIHBheW1lbnRJZDogZGF0YS5pZCxcclxuICAgIHN0YXR1czogJ3BlbmRpbmcnLFxyXG4gIH07XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBHZW5lcmF0ZSBpbnZvaWNlIGZvciBvcmRlclxyXG4gKi9cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGdlbmVyYXRlSW52b2ljZShcclxuICBpbnB1dDogR2VuZXJhdGVJbnZvaWNlSW5wdXRcclxuKTogUHJvbWlzZTx7IGludm9pY2VJZDogc3RyaW5nOyBpbnZvaWNlTnVtYmVyOiBzdHJpbmcgfT4ge1xyXG4gIGNvbnN0IGRiID0gZ2V0UG9vbCgpO1xyXG5cclxuICAvLyBHZW5lcmF0ZSBpbnZvaWNlIG51bWJlciAoc2ltcGxlIHZlcnNpb24pXHJcbiAgY29uc3QgaW52b2ljZU51bWJlciA9IGBJTlYtJHtEYXRlLm5vdygpfS0ke01hdGgucmFuZG9tKCkudG9TdHJpbmcoMzYpLnN1YnN0cigyLCA0KS50b1VwcGVyQ2FzZSgpfWA7XHJcbiAgY29uc3QgaW52b2ljZUlkID0gY3J5cHRvLnJhbmRvbVVVSUQoKTtcclxuXHJcbiAgLy8gR2V0IG9yZGVyIElEIGZyb20gZGF0YWJhc2VcclxuICBjb25zdCBvcmRlclJlc3VsdCA9IGF3YWl0IGRiLnF1ZXJ5KFxyXG4gICAgJ1NFTEVDVCBpZCBGUk9NIG9yZGVycyBXSEVSRSBleHRlcm5hbF9pZCA9ICQxJyxcclxuICAgIFtpbnB1dC5vcmRlcklkXVxyXG4gICk7XHJcblxyXG4gIGNvbnN0IG9yZGVySWQgPSBvcmRlclJlc3VsdC5yb3dzWzBdPy5pZDtcclxuXHJcbiAgYXdhaXQgZGIucXVlcnkoXHJcbiAgICBgXHJcbiAgICBJTlNFUlQgSU5UTyBpbnZvaWNlcyAoXHJcbiAgICAgIGV4dGVybmFsX2lkLCB0ZW5hbnRfaWQsIG9yZGVyX2lkLCBpbnZvaWNlX251bWJlcixcclxuICAgICAgY3VzdG9tZXJfZW1haWwsIGN1c3RvbWVyX25hbWUsIGN1c3RvbWVyX3RheF9pZCxcclxuICAgICAgdG90YWxfYW1vdW50LCB0YXhfYW1vdW50LCBjdXJyZW5jeSwgc3RhdHVzLCBpc3N1ZWRfYXQsIG1ldGFkYXRhXHJcbiAgICApIFZBTFVFUyAoJDEsICQyLCAkMywgJDQsICQ1LCAkNiwgJDcsICQ4LCAkOSwgJDEwLCAnaXNzdWVkJywgTk9XKCksICQxMSlcclxuICAgIGAsXHJcbiAgICBbXHJcbiAgICAgIGludm9pY2VJZCxcclxuICAgICAgaW5wdXQudGVuYW50SWQsXHJcbiAgICAgIG9yZGVySWQsXHJcbiAgICAgIGludm9pY2VOdW1iZXIsXHJcbiAgICAgIGlucHV0LmN1c3RvbWVyLmVtYWlsLFxyXG4gICAgICBpbnB1dC5jdXN0b21lci5uYW1lLFxyXG4gICAgICBpbnB1dC5jdXN0b21lci50YXhJZCxcclxuICAgICAgaW5wdXQudG90YWxBbW91bnQsXHJcbiAgICAgIE1hdGgucm91bmQoaW5wdXQudG90YWxBbW91bnQgKiAwLjIxICogMTAwKSAvIDEwMCwgLy8gMjElIElWQVxyXG4gICAgICBpbnB1dC5jdXJyZW5jeSxcclxuICAgICAgSlNPTi5zdHJpbmdpZnkoe1xyXG4gICAgICAgIGNvcnJlbGF0aW9uSWQ6IGlucHV0LmNvcnJlbGF0aW9uSWQsXHJcbiAgICAgICAgaXRlbXM6IGlucHV0Lml0ZW1zLFxyXG4gICAgICB9KSxcclxuICAgIF1cclxuICApO1xyXG5cclxuICAvLyBJbiB0aGUgZnV0dXJlLCB0aGlzIHdvdWxkIGNhbGwgQUZJUCBXU0ZFIGZvciBlbGVjdHJvbmljIGludm9pY2luZ1xyXG4gIGxvZ2dlci5pbmZvKGBbSU5WT0lDRV0gR2VuZXJhdGVkIGludm9pY2UgJHtpbnZvaWNlTnVtYmVyfSBmb3Igb3JkZXIgJHtpbnB1dC5vcmRlcklkfWApO1xyXG5cclxuICByZXR1cm4ge1xyXG4gICAgaW52b2ljZUlkLFxyXG4gICAgaW52b2ljZU51bWJlcixcclxuICB9O1xyXG59XHJcblxyXG4vKipcclxuICogU2VuZCBvcmRlciBjb25maXJtYXRpb24gZW1haWxcclxuICovXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzZW5kT3JkZXJDb25maXJtYXRpb24oaW5wdXQ6IFNlbmRPcmRlckNvbmZpcm1hdGlvbklucHV0KTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgLy8gUGxhY2Vob2xkZXI6IEluIHByb2R1Y3Rpb24sIHRoaXMgd291bGQgaW50ZWdyYXRlIHdpdGggYW4gZW1haWwgc2VydmljZVxyXG4gIGxvZ2dlci5pbmZvKGBbRU1BSUxdIFNlbmRpbmcgY29uZmlybWF0aW9uIHRvICR7aW5wdXQuY3VzdG9tZXIuZW1haWx9YCk7XHJcbiAgbG9nZ2VyLmluZm8oYCAgT3JkZXI6ICR7aW5wdXQub3JkZXJJZH1gKTtcclxuICBsb2dnZXIuaW5mbyhgICBUb3RhbDogJHtpbnB1dC5jdXJyZW5jeX0gJHtpbnB1dC50b3RhbEFtb3VudH1gKTtcclxuICBsb2dnZXIuaW5mbyhgICBJdGVtczogJHtpbnB1dC5pdGVtcy5tYXAoaSA9PiBgJHtpLm5hbWV9IHgke2kucXVhbnRpdHl9YCkuam9pbignLCAnKX1gKTtcclxuXHJcbiAgaWYgKGlucHV0Lmludm9pY2VJZCkge1xyXG4gICAgbG9nZ2VyLmluZm8oYCAgSW52b2ljZTogJHtpbnB1dC5pbnZvaWNlSWR9YCk7XHJcbiAgfVxyXG5cclxuICAvLyBQdWJsaXNoIG5vdGlmaWNhdGlvbiBldmVudFxyXG4gIGNvbnN0IGthZmthID0gZ2V0S2Fma2EoKTtcclxuICBjb25zdCBwcm9kdWNlciA9IGthZmthLnByb2R1Y2VyKCk7XHJcbiAgYXdhaXQgcHJvZHVjZXIuY29ubmVjdCgpO1xyXG5cclxuICB0cnkge1xyXG4gICAgYXdhaXQgcHJvZHVjZXIuc2VuZCh7XHJcbiAgICAgIHRvcGljOiAnaW50ZWdyYXgubm90aWZpY2F0aW9ucycsXHJcbiAgICAgIG1lc3NhZ2VzOiBbXHJcbiAgICAgICAge1xyXG4gICAgICAgICAga2V5OiBpbnB1dC50ZW5hbnRJZCxcclxuICAgICAgICAgIHZhbHVlOiBKU09OLnN0cmluZ2lmeSh7XHJcbiAgICAgICAgICAgIHR5cGU6ICdvcmRlcl9jb25maXJtYXRpb24nLFxyXG4gICAgICAgICAgICB0ZW5hbnRJZDogaW5wdXQudGVuYW50SWQsXHJcbiAgICAgICAgICAgIHRvOiBpbnB1dC5jdXN0b21lci5lbWFpbCxcclxuICAgICAgICAgICAgZGF0YToge1xyXG4gICAgICAgICAgICAgIG9yZGVySWQ6IGlucHV0Lm9yZGVySWQsXHJcbiAgICAgICAgICAgICAgY3VzdG9tZXJOYW1lOiBpbnB1dC5jdXN0b21lci5uYW1lLFxyXG4gICAgICAgICAgICAgIGl0ZW1zOiBpbnB1dC5pdGVtcyxcclxuICAgICAgICAgICAgICB0b3RhbDogYCR7aW5wdXQuY3VycmVuY3l9ICR7aW5wdXQudG90YWxBbW91bnR9YCxcclxuICAgICAgICAgICAgICBpbnZvaWNlSWQ6IGlucHV0Lmludm9pY2VJZCxcclxuICAgICAgICAgICAgICBwYXltZW50SWQ6IGlucHV0LnBheW1lbnRJZCxcclxuICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgdGltZXN0YW1wOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXHJcbiAgICAgICAgICB9KSxcclxuICAgICAgICB9LFxyXG4gICAgICBdLFxyXG4gICAgfSk7XHJcbiAgfSBmaW5hbGx5IHtcclxuICAgIGF3YWl0IHByb2R1Y2VyLmRpc2Nvbm5lY3QoKTtcclxuICB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBVcGRhdGUgaW52ZW50b3J5XHJcbiAqL1xyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gdXBkYXRlSW52ZW50b3J5KGlucHV0OiBVcGRhdGVJbnZlbnRvcnlJbnB1dCk6IFByb21pc2U8dm9pZD4ge1xyXG4gIC8vIFBsYWNlaG9sZGVyOiBJbiBwcm9kdWN0aW9uLCB0aGlzIHdvdWxkIHVwZGF0ZSBhbiBpbnZlbnRvcnkgc2VydmljZVxyXG4gIGxvZ2dlci5pbmZvKGBbSU5WRU5UT1JZXSBVcGRhdGluZyBpbnZlbnRvcnkgZm9yIHRlbmFudCAke2lucHV0LnRlbmFudElkfWApO1xyXG5cclxuICBmb3IgKGNvbnN0IGl0ZW0gb2YgaW5wdXQuaXRlbXMpIHtcclxuICAgIGNvbnN0IGRlbHRhID0gaW5wdXQuYWN0aW9uID09PSAnZGVjcmVhc2UnID8gLWl0ZW0ucXVhbnRpdHkgOiBpdGVtLnF1YW50aXR5O1xyXG4gICAgbG9nZ2VyLmluZm8oYCAgUHJvZHVjdCAke2l0ZW0ucHJvZHVjdElkfTogJHtkZWx0YSA+IDAgPyAnKycgOiAnJ30ke2RlbHRhfWApO1xyXG4gIH1cclxuXHJcbiAgLy8gUHVibGlzaCBpbnZlbnRvcnkgZXZlbnRcclxuICBjb25zdCBrYWZrYSA9IGdldEthZmthKCk7XHJcbiAgY29uc3QgcHJvZHVjZXIgPSBrYWZrYS5wcm9kdWNlcigpO1xyXG4gIGF3YWl0IHByb2R1Y2VyLmNvbm5lY3QoKTtcclxuXHJcbiAgdHJ5IHtcclxuICAgIGF3YWl0IHByb2R1Y2VyLnNlbmQoe1xyXG4gICAgICB0b3BpYzogJ2ludGVncmF4LmludmVudG9yeScsXHJcbiAgICAgIG1lc3NhZ2VzOiBbXHJcbiAgICAgICAge1xyXG4gICAgICAgICAga2V5OiBpbnB1dC50ZW5hbnRJZCxcclxuICAgICAgICAgIHZhbHVlOiBKU09OLnN0cmluZ2lmeSh7XHJcbiAgICAgICAgICAgIHR5cGU6IGBpbnZlbnRvcnkuJHtpbnB1dC5hY3Rpb259YCxcclxuICAgICAgICAgICAgdGVuYW50SWQ6IGlucHV0LnRlbmFudElkLFxyXG4gICAgICAgICAgICBpdGVtczogaW5wdXQuaXRlbXMsXHJcbiAgICAgICAgICAgIHRpbWVzdGFtcDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxyXG4gICAgICAgICAgfSksXHJcbiAgICAgICAgfSxcclxuICAgICAgXSxcclxuICAgIH0pO1xyXG4gIH0gZmluYWxseSB7XHJcbiAgICBhd2FpdCBwcm9kdWNlci5kaXNjb25uZWN0KCk7XHJcbiAgfVxyXG59XHJcblxyXG4vKipcclxuICogUHVibGlzaCBvcmRlciBldmVudCB0byBLYWZrYVxyXG4gKi9cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHB1Ymxpc2hPcmRlckV2ZW50KGlucHV0OiBQdWJsaXNoT3JkZXJFdmVudElucHV0KTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgY29uc3Qga2Fma2EgPSBnZXRLYWZrYSgpO1xyXG4gIGNvbnN0IHByb2R1Y2VyID0ga2Fma2EucHJvZHVjZXIoKTtcclxuICBhd2FpdCBwcm9kdWNlci5jb25uZWN0KCk7XHJcblxyXG4gIHRyeSB7XHJcbiAgICBhd2FpdCBwcm9kdWNlci5zZW5kKHtcclxuICAgICAgdG9waWM6ICdpbnRlZ3JheC5vcmRlcnMnLFxyXG4gICAgICBtZXNzYWdlczogW1xyXG4gICAgICAgIHtcclxuICAgICAgICAgIGtleTogaW5wdXQub3JkZXJJZCxcclxuICAgICAgICAgIHZhbHVlOiBKU09OLnN0cmluZ2lmeSh7XHJcbiAgICAgICAgICAgIGV2ZW50SWQ6IGNyeXB0by5yYW5kb21VVUlEKCksXHJcbiAgICAgICAgICAgIGV2ZW50VHlwZTogaW5wdXQuZXZlbnRUeXBlLFxyXG4gICAgICAgICAgICB0ZW5hbnRJZDogaW5wdXQudGVuYW50SWQsXHJcbiAgICAgICAgICAgIGNvcnJlbGF0aW9uSWQ6IGlucHV0LmNvcnJlbGF0aW9uSWQsXHJcbiAgICAgICAgICAgIHRpbWVzdGFtcDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxyXG4gICAgICAgICAgICBkYXRhOiB7XHJcbiAgICAgICAgICAgICAgb3JkZXJJZDogaW5wdXQub3JkZXJJZCxcclxuICAgICAgICAgICAgICAuLi5pbnB1dC5kYXRhLFxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgfSksXHJcbiAgICAgICAgICBoZWFkZXJzOiB7XHJcbiAgICAgICAgICAgICdjb3JyZWxhdGlvbi1pZCc6IGlucHV0LmNvcnJlbGF0aW9uSWQsXHJcbiAgICAgICAgICAgICd0ZW5hbnQtaWQnOiBpbnB1dC50ZW5hbnRJZCxcclxuICAgICAgICAgIH0sXHJcbiAgICAgICAgfSxcclxuICAgICAgXSxcclxuICAgIH0pO1xyXG4gIH0gZmluYWxseSB7XHJcbiAgICBhd2FpdCBwcm9kdWNlci5kaXNjb25uZWN0KCk7XHJcbiAgfVxyXG59XHJcbiJdfQ==