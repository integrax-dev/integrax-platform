"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.validatePayment = validatePayment;
exports.persistPayment = persistPayment;
exports.publishPaymentEvent = publishPaymentEvent;
exports.syncToGoogleSheets = syncToGoogleSheets;
exports.sendNotification = sendNotification;
const logger_js_1 = require("../utils/logger.js");
/**
 * Payment Activities
 *
 * Activities for the payment processing workflow.
 * Each activity is an independent unit of work that can be retried.
 */
const pg_1 = require("pg");
const kafkajs_1 = require("kafkajs");
// Database connection (lazy initialized)
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
// Kafka producer (lazy initialized)
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
 * Validate payment with MercadoPago API
 */
async function validatePayment(input) {
    const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
    if (!accessToken) {
        throw new Error('MERCADOPAGO_ACCESS_TOKEN not configured');
    }
    const response = await fetch(`https://api.mercadopago.com/v1/payments/${input.paymentId}`, {
        headers: {
            Authorization: `Bearer ${accessToken}`,
        },
    });
    if (!response.ok) {
        const error = await response.json();
        throw new Error(`MercadoPago API error: ${JSON.stringify(error)}`);
    }
    const data = await response.json();
    return {
        id: data.id.toString(),
        status: data.status,
        amount: data.transaction_amount,
        currency: data.currency_id,
        payerEmail: data.payer?.email,
        payerName: data.payer?.first_name,
        paymentMethod: data.payment_method_id,
        createdAt: data.date_created,
    };
}
/**
 * Persist payment to database
 */
async function persistPayment(input) {
    const db = getPool();
    await db.query(`
    INSERT INTO payments (
      external_id, tenant_id, amount, currency, status,
      provider, provider_payment_id, payer_email, payer_name,
      metadata, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
    ON CONFLICT (external_id) DO UPDATE SET
      status = EXCLUDED.status,
      updated_at = NOW()
    `, [
        input.paymentId,
        input.tenantId,
        input.paymentData.amount,
        input.paymentData.currency,
        input.paymentData.status,
        'mercadopago',
        input.paymentData.id,
        input.paymentData.payerEmail,
        input.paymentData.payerName,
        JSON.stringify({
            correlationId: input.correlationId,
            paymentMethod: input.paymentData.paymentMethod,
        }),
        input.paymentData.createdAt,
    ]);
    // Also insert into audit_logs
    await db.query(`
    INSERT INTO audit_logs (
      event_id, event_type, tenant_id, correlation_id, payload, status
    ) VALUES ($1, $2, $3, $4, $5, 'processed')
    `, [
        crypto.randomUUID(),
        `payment.${input.paymentData.status}`,
        input.tenantId,
        input.correlationId,
        JSON.stringify(input.paymentData),
    ]);
}
/**
 * Publish payment event to Kafka
 */
async function publishPaymentEvent(input) {
    const kafka = getKafka();
    const producer = kafka.producer();
    await producer.connect();
    try {
        await producer.send({
            topic: 'integrax.payments',
            messages: [
                {
                    key: input.paymentId,
                    value: JSON.stringify({
                        eventId: crypto.randomUUID(),
                        eventType: input.eventType,
                        tenantId: input.tenantId,
                        correlationId: input.correlationId,
                        timestamp: new Date().toISOString(),
                        data: {
                            paymentId: input.paymentId,
                            status: input.status,
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
/**
 * Sync payment to Google Sheets
 */
async function syncToGoogleSheets(input) {
    const credentials = process.env.GOOGLE_SHEETS_CREDENTIALS;
    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    if (!credentials || !spreadsheetId) {
        logger_js_1.logger.info('Google Sheets not configured, skipping sync');
        return;
    }
    // Dynamic import for google-auth-library
    const { GoogleAuth } = await Promise.resolve().then(() => __importStar(require('google-auth-library')));
    const auth = new GoogleAuth({
        credentials: JSON.parse(credentials),
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const client = await auth.getClient();
    const tokenResponse = await client.getAccessToken();
    const accessToken = tokenResponse.token;
    if (!accessToken) {
        throw new Error('Failed to get Google access token');
    }
    // Append row to spreadsheet
    const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Pagos!A:F:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            values: [
                [
                    input.paymentData.id,
                    input.paymentData.amount,
                    input.paymentData.currency,
                    input.paymentData.status,
                    input.paymentData.payerEmail || '',
                    new Date().toISOString(),
                ],
            ],
        }),
    });
    if (!response.ok) {
        const error = await response.json();
        throw new Error(`Google Sheets API error: ${JSON.stringify(error)}`);
    }
}
/**
 * Send notification to tenant
 */
async function sendNotification(input) {
    // For now, just log. In production, this would send via webhook, email, etc.
    logger_js_1.logger.info(`[NOTIFICATION] Tenant: ${input.tenantId}, Type: ${input.type} Data: ${JSON.stringify(input.data)}`);
    // Could publish to a notifications topic in Kafka
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
                        tenantId: input.tenantId,
                        type: input.type,
                        data: input.data,
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGF5bWVudC1hY3Rpdml0aWVzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsicGF5bWVudC1hY3Rpdml0aWVzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBNEZBLDBDQXlDQztBQUtELHdDQStDQztBQUtELGtEQWlDQztBQUtELGdEQXFEQztBQUtELDRDQTRCQztBQTFURCxrREFBNEM7QUFDNUM7Ozs7O0dBS0c7QUFFSCwyQkFBMEI7QUFDMUIscUNBQWdDO0FBOENoQyx5Q0FBeUM7QUFDekMsSUFBSSxJQUFJLEdBQWdCLElBQUksQ0FBQztBQUU3QixTQUFTLE9BQU87SUFDZCxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDVixJQUFJLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxhQUFhO1lBQUUsTUFBTSxJQUFJLEtBQUssQ0FBQywyQkFBMkIsQ0FBQyxDQUFDO1FBQzdFLElBQUksQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLGFBQWE7WUFBRSxNQUFNLElBQUksS0FBSyxDQUFDLDJCQUEyQixDQUFDLENBQUM7UUFDN0UsSUFBSSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsaUJBQWlCO1lBQUUsTUFBTSxJQUFJLEtBQUssQ0FBQywrQkFBK0IsQ0FBQyxDQUFDO1FBRXJGLElBQUksR0FBRyxJQUFJLFNBQUksQ0FBQztZQUNkLElBQUksRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLGFBQWE7WUFDL0IsSUFBSSxFQUFFLFFBQVEsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLGFBQWEsSUFBSSxNQUFNLENBQUM7WUFDbkQsSUFBSSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsYUFBYTtZQUMvQixRQUFRLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxpQkFBaUI7WUFDdkMsUUFBUSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsV0FBVyxJQUFJLFVBQVU7U0FDaEQsQ0FBQyxDQUFDO0lB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LEtBQUssRUFBRSx3QkFBd0I7WUFDL0IsUUFBUSxFQUFFO2dCQUNSO29CQUNFLEdBQUcsRUFBRSxLQUFLLENBQUMsUUFBUTtvQkFDbkIsS0FBSyxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUM7d0JBQ3BCLFFBQVEsRUFBRSxLQUFLLENBQUMsUUFBUTt3QkFDeEIsSUFBSSxFQUFFLEtBQUssQ0FBQyxJQUFJO3dCQUNoQixJQUFJLEVBQUUsS0FBSyxDQUFDLElBQUk7d0JBQ2hCLFNBQVMsRUFBRSxJQUFJLElBQUksRUFBRSxDQUFDLFdBQVcsRUFBRTtxQkFDcEMsQ0FBQztpQkFDSDthQUNGO1NBQ0YsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztZQUFTLENBQUM7UUFDVCxNQUFNLFFBQVEsQ0FBQyxVQUFVLEVBQUUsQ0FBQztJQUM5QixDQUFDO0FBQ0gsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IGxvZ2dlciB9IGZyb20gJy4uL3V0aWxzL2xvZ2dlci5qcyc7XHJcbi8qKlxyXG4gKiBQYXltZW50IEFjdGl2aXRpZXNcclxuICpcclxuICogQWN0aXZpdGllcyBmb3IgdGhlIHBheW1lbnQgcHJvY2Vzc2luZyB3b3JrZmxvdy5cclxuICogRWFjaCBhY3Rpdml0eSBpcyBhbiBpbmRlcGVuZGVudCB1bml0IG9mIHdvcmsgdGhhdCBjYW4gYmUgcmV0cmllZC5cclxuICovXHJcblxyXG5pbXBvcnQgeyBQb29sIH0gZnJvbSAncGcnO1xyXG5pbXBvcnQgeyBLYWZrYSB9IGZyb20gJ2thZmthanMnO1xyXG5cclxuLy8gVHlwZXNcclxuZXhwb3J0IGludGVyZmFjZSBWYWxpZGF0ZVBheW1lbnRJbnB1dCB7XHJcbiAgcGF5bWVudElkOiBzdHJpbmc7XHJcbiAgdGVuYW50SWQ6IHN0cmluZztcclxufVxyXG5cclxuZXhwb3J0IGludGVyZmFjZSBQYXltZW50RGF0YSB7XHJcbiAgaWQ6IHN0cmluZztcclxuICBzdGF0dXM6IHN0cmluZztcclxuICBhbW91bnQ6IG51bWJlcjtcclxuICBjdXJyZW5jeTogc3RyaW5nO1xyXG4gIHBheWVyRW1haWw/OiBzdHJpbmc7XHJcbiAgcGF5ZXJOYW1lPzogc3RyaW5nO1xyXG4gIHBheW1lbnRNZXRob2Q6IHN0cmluZztcclxuICBjcmVhdGVkQXQ6IHN0cmluZztcclxufVxyXG5cclxuZXhwb3J0IGludGVyZmFjZSBQZXJzaXN0UGF5bWVudElucHV0IHtcclxuICBwYXltZW50SWQ6IHN0cmluZztcclxuICB0ZW5hbnRJZDogc3RyaW5nO1xyXG4gIGNvcnJlbGF0aW9uSWQ6IHN0cmluZztcclxuICBwYXltZW50RGF0YTogUGF5bWVudERhdGE7XHJcbn1cclxuXHJcbmV4cG9ydCBpbnRlcmZhY2UgUHVibGlzaFBheW1lbnRFdmVudElucHV0IHtcclxuICBwYXltZW50SWQ6IHN0cmluZztcclxuICB0ZW5hbnRJZDogc3RyaW5nO1xyXG4gIGNvcnJlbGF0aW9uSWQ6IHN0cmluZztcclxuICBzdGF0dXM6IHN0cmluZztcclxuICBldmVudFR5cGU6IHN0cmluZztcclxufVxyXG5cclxuZXhwb3J0IGludGVyZmFjZSBTeW5jVG9Hb29nbGVTaGVldHNJbnB1dCB7XHJcbiAgcGF5bWVudElkOiBzdHJpbmc7XHJcbiAgdGVuYW50SWQ6IHN0cmluZztcclxuICBwYXltZW50RGF0YTogUGF5bWVudERhdGE7XHJcbn1cclxuXHJcbmV4cG9ydCBpbnRlcmZhY2UgU2VuZE5vdGlmaWNhdGlvbklucHV0IHtcclxuICB0ZW5hbnRJZDogc3RyaW5nO1xyXG4gIHR5cGU6IHN0cmluZztcclxuICBkYXRhOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcclxufVxyXG5cclxuLy8gRGF0YWJhc2UgY29ubmVjdGlvbiAobGF6eSBpbml0aWFsaXplZClcclxubGV0IHBvb2w6IFBvb2wgfCBudWxsID0gbnVsbDtcclxuXHJcbmZ1bmN0aW9uIGdldFBvb2woKTogUG9vbCB7XHJcbiAgaWYgKCFwb29sKSB7XHJcbiAgICBpZiAoIXByb2Nlc3MuZW52LlBPU1RHUkVTX0hPU1QpIHRocm93IG5ldyBFcnJvcignUE9TVEdSRVNfSE9TVCBpcyByZXF1aXJlZCcpO1xyXG4gICAgaWYgKCFwcm9jZXNzLmVudi5QT1NUR1JFU19VU0VSKSB0aHJvdyBuZXcgRXJyb3IoJ1BPU1RHUkVTX1VTRVIgaXMgcmVxdWlyZWQnKTtcclxuICAgIGlmICghcHJvY2Vzcy5lbnYuUE9TVEdSRVNfUEFTU1dPUkQpIHRocm93IG5ldyBFcnJvcignUE9TVEdSRVNfUEFTU1dPUkQgaXMgcmVxdWlyZWQnKTtcclxuXHJcbiAgICBwb29sID0gbmV3IFBvb2woe1xyXG4gICAgICBob3N0OiBwcm9jZXNzLmVudi5QT1NUR1JFU19IT1NULFxyXG4gICAgICBwb3J0OiBwYXJzZUludChwcm9jZXNzLmVudi5QT1NUR1JFU19QT1JUIHx8ICc1NDMyJyksXHJcbiAgICAgIHVzZXI6IHByb2Nlc3MuZW52LlBPU1RHUkVTX1VTRVIsXHJcbiAgICAgIHBhc3N3b3JkOiBwcm9jZXNzLmVudi5QT1NUR1JFU19QQVNTV09SRCxcclxuICAgICAgZGF0YWJhc2U6IHByb2Nlc3MuZW52LlBPU1RHUkVTX0RCIHx8ICdpbnRlZ3JheCcsXHJcbiAgICB9KTtcclxuICB9XHJcbiAgcmV0dXJuIHBvb2w7XHJcbn1cclxuXHJcbi8vIEthZmthIHByb2R1Y2VyIChsYXp5IGluaXRpYWxpemVkKVxyXG5sZXQga2Fma2E6IEthZmthIHwgbnVsbCA9IG51bGw7XHJcblxyXG5mdW5jdGlvbiBnZXRLYWZrYSgpOiBLYWZrYSB7XHJcbiAgaWYgKCFrYWZrYSkge1xyXG4gICAgaWYgKCFwcm9jZXNzLmVudi5LQUZLQV9CUk9LRVJTKSB0aHJvdyBuZXcgRXJyb3IoJ0tBRktBX0JST0tFUlMgaXMgcmVxdWlyZWQnKTtcclxuICAgIGthZmthID0gbmV3IEthZmthKHtcclxuICAgICAgY2xpZW50SWQ6ICdpbnRlZ3JheC10ZW1wb3JhbC13b3JrZXInLFxyXG4gICAgICBicm9rZXJzOiBwcm9jZXNzLmVudi5LQUZLQV9CUk9LRVJTLnNwbGl0KCcsJyksXHJcbiAgICB9KTtcclxuICB9XHJcbiAgcmV0dXJuIGthZmthO1xyXG59XHJcblxyXG4vKipcclxuICogVmFsaWRhdGUgcGF5bWVudCB3aXRoIE1lcmNhZG9QYWdvIEFQSVxyXG4gKi9cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHZhbGlkYXRlUGF5bWVudChpbnB1dDogVmFsaWRhdGVQYXltZW50SW5wdXQpOiBQcm9taXNlPFBheW1lbnREYXRhPiB7XHJcbiAgY29uc3QgYWNjZXNzVG9rZW4gPSBwcm9jZXNzLmVudi5NRVJDQURPUEFHT19BQ0NFU1NfVE9LRU47XHJcblxyXG4gIGlmICghYWNjZXNzVG9rZW4pIHtcclxuICAgIHRocm93IG5ldyBFcnJvcignTUVSQ0FET1BBR09fQUNDRVNTX1RPS0VOIG5vdCBjb25maWd1cmVkJyk7XHJcbiAgfVxyXG5cclxuICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKFxyXG4gICAgYGh0dHBzOi8vYXBpLm1lcmNhZG9wYWdvLmNvbS92MS9wYXltZW50cy8ke2lucHV0LnBheW1lbnRJZH1gLFxyXG4gICAge1xyXG4gICAgICBoZWFkZXJzOiB7XHJcbiAgICAgICAgQXV0aG9yaXphdGlvbjogYEJlYXJlciAke2FjY2Vzc1Rva2VufWAsXHJcbiAgICAgIH0sXHJcbiAgICB9XHJcbiAgKTtcclxuXHJcbiAgaWYgKCFyZXNwb25zZS5vaykge1xyXG4gICAgY29uc3QgZXJyb3IgPSBhd2FpdCByZXNwb25zZS5qc29uKCk7XHJcbiAgICB0aHJvdyBuZXcgRXJyb3IoYE1lcmNhZG9QYWdvIEFQSSBlcnJvcjogJHtKU09OLnN0cmluZ2lmeShlcnJvcil9YCk7XHJcbiAgfVxyXG5cclxuICBjb25zdCBkYXRhID0gYXdhaXQgcmVzcG9uc2UuanNvbigpIGFzIHtcclxuICAgIGlkOiBudW1iZXI7XHJcbiAgICBzdGF0dXM6IHN0cmluZztcclxuICAgIHRyYW5zYWN0aW9uX2Ftb3VudDogbnVtYmVyO1xyXG4gICAgY3VycmVuY3lfaWQ6IHN0cmluZztcclxuICAgIHBheWVyPzogeyBlbWFpbD86IHN0cmluZzsgZmlyc3RfbmFtZT86IHN0cmluZyB9O1xyXG4gICAgcGF5bWVudF9tZXRob2RfaWQ6IHN0cmluZztcclxuICAgIGRhdGVfY3JlYXRlZDogc3RyaW5nO1xyXG4gIH07XHJcblxyXG4gIHJldHVybiB7XHJcbiAgICBpZDogZGF0YS5pZC50b1N0cmluZygpLFxyXG4gICAgc3RhdHVzOiBkYXRhLnN0YXR1cyxcclxuICAgIGFtb3VudDogZGF0YS50cmFuc2FjdGlvbl9hbW91bnQsXHJcbiAgICBjdXJyZW5jeTogZGF0YS5jdXJyZW5jeV9pZCxcclxuICAgIHBheWVyRW1haWw6IGRhdGEucGF5ZXI/LmVtYWlsLFxyXG4gICAgcGF5ZXJOYW1lOiBkYXRhLnBheWVyPy5maXJzdF9uYW1lLFxyXG4gICAgcGF5bWVudE1ldGhvZDogZGF0YS5wYXltZW50X21ldGhvZF9pZCxcclxuICAgIGNyZWF0ZWRBdDogZGF0YS5kYXRlX2NyZWF0ZWQsXHJcbiAgfTtcclxufVxyXG5cclxuLyoqXHJcbiAqIFBlcnNpc3QgcGF5bWVudCB0byBkYXRhYmFzZVxyXG4gKi9cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHBlcnNpc3RQYXltZW50KGlucHV0OiBQZXJzaXN0UGF5bWVudElucHV0KTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgY29uc3QgZGIgPSBnZXRQb29sKCk7XHJcblxyXG4gIGF3YWl0IGRiLnF1ZXJ5KFxyXG4gICAgYFxyXG4gICAgSU5TRVJUIElOVE8gcGF5bWVudHMgKFxyXG4gICAgICBleHRlcm5hbF9pZCwgdGVuYW50X2lkLCBhbW91bnQsIGN1cnJlbmN5LCBzdGF0dXMsXHJcbiAgICAgIHByb3ZpZGVyLCBwcm92aWRlcl9wYXltZW50X2lkLCBwYXllcl9lbWFpbCwgcGF5ZXJfbmFtZSxcclxuICAgICAgbWV0YWRhdGEsIGNyZWF0ZWRfYXQsIHVwZGF0ZWRfYXRcclxuICAgICkgVkFMVUVTICgkMSwgJDIsICQzLCAkNCwgJDUsICQ2LCAkNywgJDgsICQ5LCAkMTAsICQxMSwgTk9XKCkpXHJcbiAgICBPTiBDT05GTElDVCAoZXh0ZXJuYWxfaWQpIERPIFVQREFURSBTRVRcclxuICAgICAgc3RhdHVzID0gRVhDTFVERUQuc3RhdHVzLFxyXG4gICAgICB1cGRhdGVkX2F0ID0gTk9XKClcclxuICAgIGAsXHJcbiAgICBbXHJcbiAgICAgIGlucHV0LnBheW1lbnRJZCxcclxuICAgICAgaW5wdXQudGVuYW50SWQsXHJcbiAgICAgIGlucHV0LnBheW1lbnREYXRhLmFtb3VudCxcclxuICAgICAgaW5wdXQucGF5bWVudERhdGEuY3VycmVuY3ksXHJcbiAgICAgIGlucHV0LnBheW1lbnREYXRhLnN0YXR1cyxcclxuICAgICAgJ21lcmNhZG9wYWdvJyxcclxuICAgICAgaW5wdXQucGF5bWVudERhdGEuaWQsXHJcbiAgICAgIGlucHV0LnBheW1lbnREYXRhLnBheWVyRW1haWwsXHJcbiAgICAgIGlucHV0LnBheW1lbnREYXRhLnBheWVyTmFtZSxcclxuICAgICAgSlNPTi5zdHJpbmdpZnkoe1xyXG4gICAgICAgIGNvcnJlbGF0aW9uSWQ6IGlucHV0LmNvcnJlbGF0aW9uSWQsXHJcbiAgICAgICAgcGF5bWVudE1ldGhvZDogaW5wdXQucGF5bWVudERhdGEucGF5bWVudE1ldGhvZCxcclxuICAgICAgfSksXHJcbiAgICAgIGlucHV0LnBheW1lbnREYXRhLmNyZWF0ZWRBdCxcclxuICAgIF1cclxuICApO1xyXG5cclxuICAvLyBBbHNvIGluc2VydCBpbnRvIGF1ZGl0X2xvZ3NcclxuICBhd2FpdCBkYi5xdWVyeShcclxuICAgIGBcclxuICAgIElOU0VSVCBJTlRPIGF1ZGl0X2xvZ3MgKFxyXG4gICAgICBldmVudF9pZCwgZXZlbnRfdHlwZSwgdGVuYW50X2lkLCBjb3JyZWxhdGlvbl9pZCwgcGF5bG9hZCwgc3RhdHVzXHJcbiAgICApIFZBTFVFUyAoJDEsICQyLCAkMywgJDQsICQ1LCAncHJvY2Vzc2VkJylcclxuICAgIGAsXHJcbiAgICBbXHJcbiAgICAgIGNyeXB0by5yYW5kb21VVUlEKCksXHJcbiAgICAgIGBwYXltZW50LiR7aW5wdXQucGF5bWVudERhdGEuc3RhdHVzfWAsXHJcbiAgICAgIGlucHV0LnRlbmFudElkLFxyXG4gICAgICBpbnB1dC5jb3JyZWxhdGlvbklkLFxyXG4gICAgICBKU09OLnN0cmluZ2lmeShpbnB1dC5wYXltZW50RGF0YSksXHJcbiAgICBdXHJcbiAgKTtcclxufVxyXG5cclxuLyoqXHJcbiAqIFB1Ymxpc2ggcGF5bWVudCBldmVudCB0byBLYWZrYVxyXG4gKi9cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHB1Ymxpc2hQYXltZW50RXZlbnQoaW5wdXQ6IFB1Ymxpc2hQYXltZW50RXZlbnRJbnB1dCk6IFByb21pc2U8dm9pZD4ge1xyXG4gIGNvbnN0IGthZmthID0gZ2V0S2Fma2EoKTtcclxuICBjb25zdCBwcm9kdWNlciA9IGthZmthLnByb2R1Y2VyKCk7XHJcblxyXG4gIGF3YWl0IHByb2R1Y2VyLmNvbm5lY3QoKTtcclxuXHJcbiAgdHJ5IHtcclxuICAgIGF3YWl0IHByb2R1Y2VyLnNlbmQoe1xyXG4gICAgICB0b3BpYzogJ2ludGVncmF4LnBheW1lbnRzJyxcclxuICAgICAgbWVzc2FnZXM6IFtcclxuICAgICAgICB7XHJcbiAgICAgICAgICBrZXk6IGlucHV0LnBheW1lbnRJZCxcclxuICAgICAgICAgIHZhbHVlOiBKU09OLnN0cmluZ2lmeSh7XHJcbiAgICAgICAgICAgIGV2ZW50SWQ6IGNyeXB0by5yYW5kb21VVUlEKCksXHJcbiAgICAgICAgICAgIGV2ZW50VHlwZTogaW5wdXQuZXZlbnRUeXBlLFxyXG4gICAgICAgICAgICB0ZW5hbnRJZDogaW5wdXQudGVuYW50SWQsXHJcbiAgICAgICAgICAgIGNvcnJlbGF0aW9uSWQ6IGlucHV0LmNvcnJlbGF0aW9uSWQsXHJcbiAgICAgICAgICAgIHRpbWVzdGFtcDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxyXG4gICAgICAgICAgICBkYXRhOiB7XHJcbiAgICAgICAgICAgICAgcGF5bWVudElkOiBpbnB1dC5wYXltZW50SWQsXHJcbiAgICAgICAgICAgICAgc3RhdHVzOiBpbnB1dC5zdGF0dXMsXHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICB9KSxcclxuICAgICAgICAgIGhlYWRlcnM6IHtcclxuICAgICAgICAgICAgJ2NvcnJlbGF0aW9uLWlkJzogaW5wdXQuY29ycmVsYXRpb25JZCxcclxuICAgICAgICAgICAgJ3RlbmFudC1pZCc6IGlucHV0LnRlbmFudElkLFxyXG4gICAgICAgICAgfSxcclxuICAgICAgICB9LFxyXG4gICAgICBdLFxyXG4gICAgfSk7XHJcbiAgfSBmaW5hbGx5IHtcclxuICAgIGF3YWl0IHByb2R1Y2VyLmRpc2Nvbm5lY3QoKTtcclxuICB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBTeW5jIHBheW1lbnQgdG8gR29vZ2xlIFNoZWV0c1xyXG4gKi9cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHN5bmNUb0dvb2dsZVNoZWV0cyhpbnB1dDogU3luY1RvR29vZ2xlU2hlZXRzSW5wdXQpOiBQcm9taXNlPHZvaWQ+IHtcclxuICBjb25zdCBjcmVkZW50aWFscyA9IHByb2Nlc3MuZW52LkdPT0dMRV9TSEVFVFNfQ1JFREVOVElBTFM7XHJcbiAgY29uc3Qgc3ByZWFkc2hlZXRJZCA9IHByb2Nlc3MuZW52LkdPT0dMRV9TSEVFVFNfU1BSRUFEU0hFRVRfSUQ7XHJcblxyXG4gIGlmICghY3JlZGVudGlhbHMgfHwgIXNwcmVhZHNoZWV0SWQpIHtcclxuICAgIGxvZ2dlci5pbmZvKCdHb29nbGUgU2hlZXRzIG5vdCBjb25maWd1cmVkLCBza2lwcGluZyBzeW5jJyk7XHJcbiAgICByZXR1cm47XHJcbiAgfVxyXG5cclxuICAvLyBEeW5hbWljIGltcG9ydCBmb3IgZ29vZ2xlLWF1dGgtbGlicmFyeVxyXG4gIGNvbnN0IHsgR29vZ2xlQXV0aCB9ID0gYXdhaXQgaW1wb3J0KCdnb29nbGUtYXV0aC1saWJyYXJ5Jyk7XHJcblxyXG4gIGNvbnN0IGF1dGggPSBuZXcgR29vZ2xlQXV0aCh7XHJcbiAgICBjcmVkZW50aWFsczogSlNPTi5wYXJzZShjcmVkZW50aWFscyksXHJcbiAgICBzY29wZXM6IFsnaHR0cHM6Ly93d3cuZ29vZ2xlYXBpcy5jb20vYXV0aC9zcHJlYWRzaGVldHMnXSxcclxuICB9KTtcclxuXHJcbiAgY29uc3QgY2xpZW50ID0gYXdhaXQgYXV0aC5nZXRDbGllbnQoKTtcclxuICBjb25zdCB0b2tlblJlc3BvbnNlID0gYXdhaXQgY2xpZW50LmdldEFjY2Vzc1Rva2VuKCk7XHJcbiAgY29uc3QgYWNjZXNzVG9rZW4gPSB0b2tlblJlc3BvbnNlLnRva2VuO1xyXG5cclxuICBpZiAoIWFjY2Vzc1Rva2VuKSB7XHJcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ0ZhaWxlZCB0byBnZXQgR29vZ2xlIGFjY2VzcyB0b2tlbicpO1xyXG4gIH1cclxuXHJcbiAgLy8gQXBwZW5kIHJvdyB0byBzcHJlYWRzaGVldFxyXG4gIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2goXHJcbiAgICBgaHR0cHM6Ly9zaGVldHMuZ29vZ2xlYXBpcy5jb20vdjQvc3ByZWFkc2hlZXRzLyR7c3ByZWFkc2hlZXRJZH0vdmFsdWVzL1BhZ29zIUE6RjphcHBlbmQ/dmFsdWVJbnB1dE9wdGlvbj1SQVcmaW5zZXJ0RGF0YU9wdGlvbj1JTlNFUlRfUk9XU2AsXHJcbiAgICB7XHJcbiAgICAgIG1ldGhvZDogJ1BPU1QnLFxyXG4gICAgICBoZWFkZXJzOiB7XHJcbiAgICAgICAgQXV0aG9yaXphdGlvbjogYEJlYXJlciAke2FjY2Vzc1Rva2VufWAsXHJcbiAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcclxuICAgICAgfSxcclxuICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xyXG4gICAgICAgIHZhbHVlczogW1xyXG4gICAgICAgICAgW1xyXG4gICAgICAgICAgICBpbnB1dC5wYXltZW50RGF0YS5pZCxcclxuICAgICAgICAgICAgaW5wdXQucGF5bWVudERhdGEuYW1vdW50LFxyXG4gICAgICAgICAgICBpbnB1dC5wYXltZW50RGF0YS5jdXJyZW5jeSxcclxuICAgICAgICAgICAgaW5wdXQucGF5bWVudERhdGEuc3RhdHVzLFxyXG4gICAgICAgICAgICBpbnB1dC5wYXltZW50RGF0YS5wYXllckVtYWlsIHx8ICcnLFxyXG4gICAgICAgICAgICBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXHJcbiAgICAgICAgICBdLFxyXG4gICAgICAgIF0sXHJcbiAgICAgIH0pLFxyXG4gICAgfVxyXG4gICk7XHJcblxyXG4gIGlmICghcmVzcG9uc2Uub2spIHtcclxuICAgIGNvbnN0IGVycm9yID0gYXdhaXQgcmVzcG9uc2UuanNvbigpO1xyXG4gICAgdGhyb3cgbmV3IEVycm9yKGBHb29nbGUgU2hlZXRzIEFQSSBlcnJvcjogJHtKU09OLnN0cmluZ2lmeShlcnJvcil9YCk7XHJcbiAgfVxyXG59XHJcblxyXG4vKipcclxuICogU2VuZCBub3RpZmljYXRpb24gdG8gdGVuYW50XHJcbiAqL1xyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gc2VuZE5vdGlmaWNhdGlvbihpbnB1dDogU2VuZE5vdGlmaWNhdGlvbklucHV0KTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgLy8gRm9yIG5vdywganVzdCBsb2cuIEluIHByb2R1Y3Rpb24sIHRoaXMgd291bGQgc2VuZCB2aWEgd2ViaG9vaywgZW1haWwsIGV0Yy5cclxuICBsb2dnZXIuaW5mbyhgW05PVElGSUNBVElPTl0gVGVuYW50OiAke2lucHV0LnRlbmFudElkfSwgVHlwZTogJHtpbnB1dC50eXBlfSBEYXRhOiAke0pTT04uc3RyaW5naWZ5KGlucHV0LmRhdGEpfWApO1xyXG5cclxuICAvLyBDb3VsZCBwdWJsaXNoIHRvIGEgbm90aWZpY2F0aW9ucyB0b3BpYyBpbiBLYWZrYVxyXG4gIGNvbnN0IGthZmthID0gZ2V0S2Fma2EoKTtcclxuICBjb25zdCBwcm9kdWNlciA9IGthZmthLnByb2R1Y2VyKCk7XHJcblxyXG4gIGF3YWl0IHByb2R1Y2VyLmNvbm5lY3QoKTtcclxuXHJcbiAgdHJ5IHtcclxuICAgIGF3YWl0IHByb2R1Y2VyLnNlbmQoe1xyXG4gICAgICB0b3BpYzogJ2ludGVncmF4Lm5vdGlmaWNhdGlvbnMnLFxyXG4gICAgICBtZXNzYWdlczogW1xyXG4gICAgICAgIHtcclxuICAgICAgICAgIGtleTogaW5wdXQudGVuYW50SWQsXHJcbiAgICAgICAgICB2YWx1ZTogSlNPTi5zdHJpbmdpZnkoe1xyXG4gICAgICAgICAgICB0ZW5hbnRJZDogaW5wdXQudGVuYW50SWQsXHJcbiAgICAgICAgICAgIHR5cGU6IGlucHV0LnR5cGUsXHJcbiAgICAgICAgICAgIGRhdGE6IGlucHV0LmRhdGEsXHJcbiAgICAgICAgICAgIHRpbWVzdGFtcDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxyXG4gICAgICAgICAgfSksXHJcbiAgICAgICAgfSxcclxuICAgICAgXSxcclxuICAgIH0pO1xyXG4gIH0gZmluYWxseSB7XHJcbiAgICBhd2FpdCBwcm9kdWNlci5kaXNjb25uZWN0KCk7XHJcbiAgfVxyXG59XHJcbiJdfQ==