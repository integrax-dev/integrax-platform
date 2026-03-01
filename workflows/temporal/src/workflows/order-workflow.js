"use strict";
/**
 * Order Fulfillment Workflow
 *
 * Orquesta el flujo completo de una orden:
 * 1. Crear orden
 * 2. Esperar confirmación de pago
 * 3. Generar factura
 * 4. Notificar al cliente
 * 5. Actualizar inventario (futuro)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOrderStatusQuery = exports.cancelOrderSignal = exports.paymentReceivedSignal = void 0;
exports.orderWorkflow = orderWorkflow;
const workflow_1 = require("@temporalio/workflow");
const { createOrder, processPayment, generateInvoice, sendOrderConfirmation, updateInventory, publishOrderEvent, } = (0, workflow_1.proxyActivities)({
    startToCloseTimeout: '60 seconds',
    retry: {
        maximumAttempts: 3,
        initialInterval: '2 seconds',
        backoffCoefficient: 2,
        maximumInterval: '60 seconds',
    },
});
// Signals
exports.paymentReceivedSignal = (0, workflow_1.defineSignal)('paymentReceived');
exports.cancelOrderSignal = (0, workflow_1.defineSignal)('cancelOrder');
// Queries
exports.getOrderStatusQuery = (0, workflow_1.defineQuery)('getOrderStatus');
async function orderWorkflow(input) {
    let status = 'created';
    const timeline = [];
    let paymentId;
    let invoiceId;
    let cancelled = false;
    let paymentReceived = false;
    let receivedPaymentData = null;
    // Add timeline event helper
    const addEvent = (event, data) => {
        timeline.push({
            event,
            timestamp: new Date().toISOString(),
            data,
        });
    };
    // Signal handlers
    (0, workflow_1.setHandler)(exports.paymentReceivedSignal, (data) => {
        paymentReceived = true;
        receivedPaymentData = data;
        addEvent('payment_signal_received', data);
    });
    (0, workflow_1.setHandler)(exports.cancelOrderSignal, (reason) => {
        cancelled = true;
        status = 'cancelled';
        addEvent('order_cancelled', { reason });
    });
    // Query handler
    (0, workflow_1.setHandler)(exports.getOrderStatusQuery, () => ({
        status,
        timeline,
    }));
    addEvent('workflow_started', { orderId: input.orderId });
    // Step 1: Create order in database
    try {
        await createOrder({
            orderId: input.orderId,
            tenantId: input.tenantId,
            correlationId: input.correlationId,
            customer: input.customer,
            items: input.items,
            totalAmount: input.totalAmount,
            currency: input.currency,
        });
        addEvent('order_created');
        status = 'payment_pending';
        // Publish event
        await publishOrderEvent({
            orderId: input.orderId,
            tenantId: input.tenantId,
            correlationId: input.correlationId,
            eventType: 'order.created',
            data: { status: 'payment_pending' },
        });
    }
    catch (error) {
        addEvent('order_creation_failed', { error: String(error) });
        return {
            success: false,
            orderId: input.orderId,
            status: 'failed',
            processedAt: new Date().toISOString(),
            timeline,
        };
    }
    // Step 2: Wait for payment (with timeout)
    // In production, this could wait for a webhook signal
    const paymentTimeout = 24 * 60 * 60 * 1000; // 24 hours
    if (cancelled) {
        return {
            success: false,
            orderId: input.orderId,
            status: 'cancelled',
            processedAt: new Date().toISOString(),
            timeline,
        };
    }
    // Wait for payment signal or process payment directly
    if (input.paymentMethod) {
        try {
            const paymentResult = await processPayment({
                orderId: input.orderId,
                tenantId: input.tenantId,
                amount: input.totalAmount,
                currency: input.currency,
                method: input.paymentMethod,
                customer: input.customer,
            });
            paymentId = paymentResult.paymentId;
            paymentReceived = true;
            addEvent('payment_processed', { paymentId });
        }
        catch (error) {
            addEvent('payment_failed', { error: String(error) });
            status = 'failed';
            return {
                success: false,
                orderId: input.orderId,
                status,
                processedAt: new Date().toISOString(),
                timeline,
            };
        }
    }
    else {
        // Wait for external payment signal
        addEvent('waiting_for_payment');
        const gotPayment = await (0, workflow_1.condition)(() => paymentReceived || cancelled, paymentTimeout);
        if (!gotPayment || cancelled) {
            addEvent('payment_timeout_or_cancelled');
            status = cancelled ? 'cancelled' : 'failed';
            return {
                success: false,
                orderId: input.orderId,
                status,
                processedAt: new Date().toISOString(),
                timeline,
            };
        }
        if (receivedPaymentData) {
            paymentId = receivedPaymentData.paymentId;
        }
    }
    status = 'payment_received';
    addEvent('payment_confirmed', { paymentId });
    // Publish payment received event
    await publishOrderEvent({
        orderId: input.orderId,
        tenantId: input.tenantId,
        correlationId: input.correlationId,
        eventType: 'order.payment_received',
        data: { paymentId },
    });
    // Step 3: Generate invoice
    try {
        const invoiceResult = await generateInvoice({
            orderId: input.orderId,
            tenantId: input.tenantId,
            correlationId: input.correlationId,
            customer: input.customer,
            items: input.items,
            totalAmount: input.totalAmount,
            currency: input.currency,
        });
        invoiceId = invoiceResult.invoiceId;
        status = 'invoiced';
        addEvent('invoice_generated', {
            invoiceId,
            invoiceNumber: invoiceResult.invoiceNumber,
        });
    }
    catch (error) {
        addEvent('invoice_generation_failed', { error: String(error) });
        // Continue anyway, invoice can be generated later
    }
    // Step 4: Send confirmation email
    try {
        await sendOrderConfirmation({
            orderId: input.orderId,
            tenantId: input.tenantId,
            customer: input.customer,
            items: input.items,
            totalAmount: input.totalAmount,
            currency: input.currency,
            invoiceId,
            paymentId,
        });
        addEvent('confirmation_sent');
    }
    catch (error) {
        addEvent('confirmation_failed', { error: String(error) });
    }
    // Step 5: Update inventory (placeholder for future)
    try {
        await updateInventory({
            tenantId: input.tenantId,
            items: input.items,
            action: 'decrease',
        });
        addEvent('inventory_updated');
    }
    catch (error) {
        addEvent('inventory_update_failed', { error: String(error) });
    }
    // Final status
    status = 'completed';
    addEvent('workflow_completed');
    // Publish completion event
    await publishOrderEvent({
        orderId: input.orderId,
        tenantId: input.tenantId,
        correlationId: input.correlationId,
        eventType: 'order.completed',
        data: { invoiceId, paymentId },
    });
    return {
        success: true,
        orderId: input.orderId,
        status,
        invoiceId,
        paymentId,
        processedAt: new Date().toISOString(),
        timeline,
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoib3JkZXItd29ya2Zsb3cuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJvcmRlci13b3JrZmxvdy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7Ozs7OztHQVNHOzs7QUFrRkgsc0NBME5DO0FBMVNELG1EQU84QjtBQUc5QixNQUFNLEVBQ0osV0FBVyxFQUNYLGNBQWMsRUFDZCxlQUFlLEVBQ2YscUJBQXFCLEVBQ3JCLGVBQWUsRUFDZixpQkFBaUIsR0FDbEIsR0FBRyxJQUFBLDBCQUFlLEVBQW9CO0lBQ3JDLG1CQUFtQixFQUFFLFlBQVk7SUFDakMsS0FBSyxFQUFFO1FBQ0wsZUFBZSxFQUFFLENBQUM7UUFDbEIsZUFBZSxFQUFFLFdBQVc7UUFDNUIsa0JBQWtCLEVBQUUsQ0FBQztRQUNyQixlQUFlLEVBQUUsWUFBWTtLQUM5QjtDQUNGLENBQUMsQ0FBQztBQWdESCxVQUFVO0FBQ0csUUFBQSxxQkFBcUIsR0FBRyxJQUFBLHVCQUFZLEVBQTBDLGlCQUFpQixDQUFDLENBQUM7QUFDakcsUUFBQSxpQkFBaUIsR0FBRyxJQUFBLHVCQUFZLEVBQVcsYUFBYSxDQUFDLENBQUM7QUFFdkUsVUFBVTtBQUNHLFFBQUEsbUJBQW1CLEdBQUcsSUFBQSxzQkFBVyxFQUFxRCxnQkFBZ0IsQ0FBQyxDQUFDO0FBRTlHLEtBQUssVUFBVSxhQUFhLENBQUMsS0FBeUI7SUFDM0QsSUFBSSxNQUFNLEdBQWdCLFNBQVMsQ0FBQztJQUNwQyxNQUFNLFFBQVEsR0FBb0IsRUFBRSxDQUFDO0lBQ3JDLElBQUksU0FBNkIsQ0FBQztJQUNsQyxJQUFJLFNBQTZCLENBQUM7SUFDbEMsSUFBSSxTQUFTLEdBQUcsS0FBSyxDQUFDO0lBQ3RCLElBQUksZUFBZSxHQUFHLEtBQUssQ0FBQztJQUM1QixJQUFJLG1CQUFtQixHQUFpRCxJQUFJLENBQUM7SUFFN0UsNEJBQTRCO0lBQzVCLE1BQU0sUUFBUSxHQUFHLENBQUMsS0FBYSxFQUFFLElBQThCLEVBQUUsRUFBRTtRQUNq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QUFFLENBQUM7UUFDZixRQUFRLENBQUMseUJBQXlCLEVBQUUsRUFBRSxLQUFLLEVBQUUsTUFBTSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsQ0FBQztJQUNoRSxDQUFDO0lBRUQsZUFBZTtJQUNmLE1BQU0sR0FBRyxXQUFXLENBQUM7SUFDckIsUUFBUSxDQUFDLG9CQUFvQixDQUFDLENBQUM7SUFFL0IsMkJBQTJCO0lBQzNCLE1BQU0saUJBQWlCLENBQUM7UUFDdEIsT0FBTyxFQUFFLEtBQUssQ0FBQyxPQUFPO1FBQ3RCLFFBQVEsRUFBRSxLQUFLLENBQUMsUUFBUTtRQUN4QixhQUFhLEVBQUUsS0FBSyxDQUFDLGFBQWE7UUFDbEMsU0FBUyxFQUFFLGlCQUFpQjtRQUM1QixJQUFJLEVBQUUsRUFBRSxTQUFTLEVBQUUsU0FBUyxFQUFFO0tBQy9CLENBQUMsQ0FBQztJQUVILE9BQU87UUFDTCxPQUFPLEVBQUUsSUFBSTtRQUNiLE9BQU8sRUFBRSxLQUFLLENBQUMsT0FBTztRQUN0QixNQUFNO1FBQ04sU0FBUztRQUNULFNBQVM7UUFDVCxXQUFXLEVBQUUsSUFBSSxJQUFJLEVBQUUsQ0FBQyxXQUFXLEVBQUU7UUFDckMsUUFBUTtLQUNULENBQUM7QUFDSixDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXHJcbiAqIE9yZGVyIEZ1bGZpbGxtZW50IFdvcmtmbG93XHJcbiAqXHJcbiAqIE9ycXVlc3RhIGVsIGZsdWpvIGNvbXBsZXRvIGRlIHVuYSBvcmRlbjpcclxuICogMS4gQ3JlYXIgb3JkZW5cclxuICogMi4gRXNwZXJhciBjb25maXJtYWNpw7NuIGRlIHBhZ29cclxuICogMy4gR2VuZXJhciBmYWN0dXJhXHJcbiAqIDQuIE5vdGlmaWNhciBhbCBjbGllbnRlXHJcbiAqIDUuIEFjdHVhbGl6YXIgaW52ZW50YXJpbyAoZnV0dXJvKVxyXG4gKi9cclxuXHJcbmltcG9ydCB7XHJcbiAgcHJveHlBY3Rpdml0aWVzLFxyXG4gIHNsZWVwLFxyXG4gIGRlZmluZVNpZ25hbCxcclxuICBkZWZpbmVRdWVyeSxcclxuICBzZXRIYW5kbGVyLFxyXG4gIGNvbmRpdGlvbixcclxufSBmcm9tICdAdGVtcG9yYWxpby93b3JrZmxvdyc7XHJcbmltcG9ydCB0eXBlICogYXMgYWN0aXZpdGllcyBmcm9tICcuLi9hY3Rpdml0aWVzL29yZGVyLWFjdGl2aXRpZXMuanMnO1xyXG5cclxuY29uc3Qge1xyXG4gIGNyZWF0ZU9yZGVyLFxyXG4gIHByb2Nlc3NQYXltZW50LFxyXG4gIGdlbmVyYXRlSW52b2ljZSxcclxuICBzZW5kT3JkZXJDb25maXJtYXRpb24sXHJcbiAgdXBkYXRlSW52ZW50b3J5LFxyXG4gIHB1Ymxpc2hPcmRlckV2ZW50LFxyXG59ID0gcHJveHlBY3Rpdml0aWVzPHR5cGVvZiBhY3Rpdml0aWVzPih7XHJcbiAgc3RhcnRUb0Nsb3NlVGltZW91dDogJzYwIHNlY29uZHMnLFxyXG4gIHJldHJ5OiB7XHJcbiAgICBtYXhpbXVtQXR0ZW1wdHM6IDMsXHJcbiAgICBpbml0aWFsSW50ZXJ2YWw6ICcyIHNlY29uZHMnLFxyXG4gICAgYmFja29mZkNvZWZmaWNpZW50OiAyLFxyXG4gICAgbWF4aW11bUludGVydmFsOiAnNjAgc2Vjb25kcycsXHJcbiAgfSxcclxufSk7XHJcblxyXG4vLyBJbnB1dCB0eXBlc1xyXG5leHBvcnQgaW50ZXJmYWNlIE9yZGVyV29ya2Zsb3dJbnB1dCB7XHJcbiAgb3JkZXJJZDogc3RyaW5nO1xyXG4gIHRlbmFudElkOiBzdHJpbmc7XHJcbiAgY29ycmVsYXRpb25JZDogc3RyaW5nO1xyXG4gIGN1c3RvbWVyOiB7XHJcbiAgICBlbWFpbDogc3RyaW5nO1xyXG4gICAgbmFtZTogc3RyaW5nO1xyXG4gICAgdGF4SWQ/OiBzdHJpbmc7XHJcbiAgfTtcclxuICBpdGVtczogQXJyYXk8e1xyXG4gICAgcHJvZHVjdElkOiBzdHJpbmc7XHJcbiAgICBuYW1lOiBzdHJpbmc7XHJcbiAgICBxdWFudGl0eTogbnVtYmVyO1xyXG4gICAgdW5pdFByaWNlOiBudW1iZXI7XHJcbiAgfT47XHJcbiAgdG90YWxBbW91bnQ6IG51bWJlcjtcclxuICBjdXJyZW5jeTogc3RyaW5nO1xyXG4gIHBheW1lbnRNZXRob2Q/OiBzdHJpbmc7XHJcbn1cclxuXHJcbmV4cG9ydCBpbnRlcmZhY2UgT3JkZXJXb3JrZmxvd091dHB1dCB7XHJcbiAgc3VjY2VzczogYm9vbGVhbjtcclxuICBvcmRlcklkOiBzdHJpbmc7XHJcbiAgc3RhdHVzOiBPcmRlclN0YXR1cztcclxuICBpbnZvaWNlSWQ/OiBzdHJpbmc7XHJcbiAgcGF5bWVudElkPzogc3RyaW5nO1xyXG4gIHByb2Nlc3NlZEF0OiBzdHJpbmc7XHJcbiAgdGltZWxpbmU6IFRpbWVsaW5lRXZlbnRbXTtcclxufVxyXG5cclxuZXhwb3J0IHR5cGUgT3JkZXJTdGF0dXMgPVxyXG4gIHwgJ2NyZWF0ZWQnXHJcbiAgfCAncGF5bWVudF9wZW5kaW5nJ1xyXG4gIHwgJ3BheW1lbnRfcmVjZWl2ZWQnXHJcbiAgfCAnaW52b2ljZWQnXHJcbiAgfCAnY29tcGxldGVkJ1xyXG4gIHwgJ2NhbmNlbGxlZCdcclxuICB8ICdmYWlsZWQnO1xyXG5cclxuZXhwb3J0IGludGVyZmFjZSBUaW1lbGluZUV2ZW50IHtcclxuICBldmVudDogc3RyaW5nO1xyXG4gIHRpbWVzdGFtcDogc3RyaW5nO1xyXG4gIGRhdGE/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcclxufVxyXG5cclxuLy8gU2lnbmFsc1xyXG5leHBvcnQgY29uc3QgcGF5bWVudFJlY2VpdmVkU2lnbmFsID0gZGVmaW5lU2lnbmFsPFt7IHBheW1lbnRJZDogc3RyaW5nOyBhbW91bnQ6IG51bWJlciB9XT4oJ3BheW1lbnRSZWNlaXZlZCcpO1xyXG5leHBvcnQgY29uc3QgY2FuY2VsT3JkZXJTaWduYWwgPSBkZWZpbmVTaWduYWw8W3N0cmluZ10+KCdjYW5jZWxPcmRlcicpO1xyXG5cclxuLy8gUXVlcmllc1xyXG5leHBvcnQgY29uc3QgZ2V0T3JkZXJTdGF0dXNRdWVyeSA9IGRlZmluZVF1ZXJ5PHsgc3RhdHVzOiBPcmRlclN0YXR1czsgdGltZWxpbmU6IFRpbWVsaW5lRXZlbnRbXSB9PignZ2V0T3JkZXJTdGF0dXMnKTtcclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBvcmRlcldvcmtmbG93KGlucHV0OiBPcmRlcldvcmtmbG93SW5wdXQpOiBQcm9taXNlPE9yZGVyV29ya2Zsb3dPdXRwdXQ+IHtcclxuICBsZXQgc3RhdHVzOiBPcmRlclN0YXR1cyA9ICdjcmVhdGVkJztcclxuICBjb25zdCB0aW1lbGluZTogVGltZWxpbmVFdmVudFtdID0gW107XHJcbiAgbGV0IHBheW1lbnRJZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xyXG4gIGxldCBpbnZvaWNlSWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcclxuICBsZXQgY2FuY2VsbGVkID0gZmFsc2U7XHJcbiAgbGV0IHBheW1lbnRSZWNlaXZlZCA9IGZhbHNlO1xyXG4gIGxldCByZWNlaXZlZFBheW1lbnREYXRhOiB7IHBheW1lbnRJZDogc3RyaW5nOyBhbW91bnQ6IG51bWJlciB9IHwgbnVsbCA9IG51bGw7XHJcblxyXG4gIC8vIEFkZCB0aW1lbGluZSBldmVudCBoZWxwZXJcclxuICBjb25zdCBhZGRFdmVudCA9IChldmVudDogc3RyaW5nLCBkYXRhPzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pID0+IHtcclxuICAgIHRpbWVsaW5lLnB1c2goe1xyXG4gICAgICBldmVudCxcclxuICAgICAgdGltZXN0YW1wOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXHJcbiAgICAgIGRhdGEsXHJcbiAgICB9KTtcclxuICB9O1xyXG5cclxuICAvLyBTaWduYWwgaGFuZGxlcnNcclxuICBzZXRIYW5kbGVyKHBheW1lbnRSZWNlaXZlZFNpZ25hbCwgKGRhdGEpID0+IHtcclxuICAgIHBheW1lbnRSZWNlaXZlZCA9IHRydWU7XHJcbiAgICByZWNlaXZlZFBheW1lbnREYXRhID0gZGF0YTtcclxuICAgIGFkZEV2ZW50KCdwYXltZW50X3NpZ25hbF9yZWNlaXZlZCcsIGRhdGEpO1xyXG4gIH0pO1xyXG5cclxuICBzZXRIYW5kbGVyKGNhbmNlbE9yZGVyU2lnbmFsLCAocmVhc29uKSA9PiB7XHJcbiAgICBjYW5jZWxsZWQgPSB0cnVlO1xyXG4gICAgc3RhdHVzID0gJ2NhbmNlbGxlZCc7XHJcbiAgICBhZGRFdmVudCgnb3JkZXJfY2FuY2VsbGVkJywgeyByZWFzb24gfSk7XHJcbiAgfSk7XHJcblxyXG4gIC8vIFF1ZXJ5IGhhbmRsZXJcclxuICBzZXRIYW5kbGVyKGdldE9yZGVyU3RhdHVzUXVlcnksICgpID0+ICh7XHJcbiAgICBzdGF0dXMsXHJcbiAgICB0aW1lbGluZSxcclxuICB9KSk7XHJcblxyXG4gIGFkZEV2ZW50KCd3b3JrZmxvd19zdGFydGVkJywgeyBvcmRlcklkOiBpbnB1dC5vcmRlcklkIH0pO1xyXG5cclxuICAvLyBTdGVwIDE6IENyZWF0ZSBvcmRlciBpbiBkYXRhYmFzZVxyXG4gIHRyeSB7XHJcbiAgICBhd2FpdCBjcmVhdGVPcmRlcih7XHJcbiAgICAgIG9yZGVySWQ6IGlucHV0Lm9yZGVySWQsXHJcbiAgICAgIHRlbmFudElkOiBpbnB1dC50ZW5hbnRJZCxcclxuICAgICAgY29ycmVsYXRpb25JZDogaW5wdXQuY29ycmVsYXRpb25JZCxcclxuICAgICAgY3VzdG9tZXI6IGlucHV0LmN1c3RvbWVyLFxyXG4gICAgICBpdGVtczogaW5wdXQuaXRlbXMsXHJcbiAgICAgIHRvdGFsQW1vdW50OiBpbnB1dC50b3RhbEFtb3VudCxcclxuICAgICAgY3VycmVuY3k6IGlucHV0LmN1cnJlbmN5LFxyXG4gICAgfSk7XHJcbiAgICBhZGRFdmVudCgnb3JkZXJfY3JlYXRlZCcpO1xyXG4gICAgc3RhdHVzID0gJ3BheW1lbnRfcGVuZGluZyc7XHJcblxyXG4gICAgLy8gUHVibGlzaCBldmVudFxyXG4gICAgYXdhaXQgcHVibGlzaE9yZGVyRXZlbnQoe1xyXG4gICAgICBvcmRlcklkOiBpbnB1dC5vcmRlcklkLFxyXG4gICAgICB0ZW5hbnRJZDogaW5wdXQudGVuYW50SWQsXHJcbiAgICAgIGNvcnJlbGF0aW9uSWQ6IGlucHV0LmNvcnJlbGF0aW9uSWQsXHJcbiAgICAgIGV2ZW50VHlwZTogJ29yZGVyLmNyZWF0ZWQnLFxyXG4gICAgICBkYXRhOiB7IHN0YXR1czogJ3BheW1lbnRfcGVuZGluZycgfSxcclxuICAgIH0pO1xyXG4gIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICBhZGRFdmVudCgnb3JkZXJfY3JlYXRpb25fZmFpbGVkJywgeyBlcnJvcjogU3RyaW5nKGVycm9yKSB9KTtcclxuICAgIHJldHVybiB7XHJcbiAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxyXG4gICAgICBvcmRlcklkOiBpbnB1dC5vcmRlcklkLFxyXG4gICAgICBzdGF0dXM6ICdmYWlsZWQnLFxyXG4gICAgICBwcm9jZXNzZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxyXG4gICAgICB0aW1lbGluZSxcclxuICAgIH07XHJcbiAgfVxyXG5cclxuICAvLyBTdGVwIDI6IFdhaXQgZm9yIHBheW1lbnQgKHdpdGggdGltZW91dClcclxuICAvLyBJbiBwcm9kdWN0aW9uLCB0aGlzIGNvdWxkIHdhaXQgZm9yIGEgd2ViaG9vayBzaWduYWxcclxuICBjb25zdCBwYXltZW50VGltZW91dCA9IDI0ICogNjAgKiA2MCAqIDEwMDA7IC8vIDI0IGhvdXJzXHJcblxyXG4gIGlmIChjYW5jZWxsZWQpIHtcclxuICAgIHJldHVybiB7XHJcbiAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxyXG4gICAgICBvcmRlcklkOiBpbnB1dC5vcmRlcklkLFxyXG4gICAgICBzdGF0dXM6ICdjYW5jZWxsZWQnLFxyXG4gICAgICBwcm9jZXNzZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxyXG4gICAgICB0aW1lbGluZSxcclxuICAgIH07XHJcbiAgfVxyXG5cclxuICAvLyBXYWl0IGZvciBwYXltZW50IHNpZ25hbCBvciBwcm9jZXNzIHBheW1lbnQgZGlyZWN0bHlcclxuICBpZiAoaW5wdXQucGF5bWVudE1ldGhvZCkge1xyXG4gICAgdHJ5IHtcclxuICAgICAgY29uc3QgcGF5bWVudFJlc3VsdCA9IGF3YWl0IHByb2Nlc3NQYXltZW50KHtcclxuICAgICAgICBvcmRlcklkOiBpbnB1dC5vcmRlcklkLFxyXG4gICAgICAgIHRlbmFudElkOiBpbnB1dC50ZW5hbnRJZCxcclxuICAgICAgICBhbW91bnQ6IGlucHV0LnRvdGFsQW1vdW50LFxyXG4gICAgICAgIGN1cnJlbmN5OiBpbnB1dC5jdXJyZW5jeSxcclxuICAgICAgICBtZXRob2Q6IGlucHV0LnBheW1lbnRNZXRob2QsXHJcbiAgICAgICAgY3VzdG9tZXI6IGlucHV0LmN1c3RvbWVyLFxyXG4gICAgICB9KTtcclxuICAgICAgcGF5bWVudElkID0gcGF5bWVudFJlc3VsdC5wYXltZW50SWQ7XHJcbiAgICAgIHBheW1lbnRSZWNlaXZlZCA9IHRydWU7XHJcbiAgICAgIGFkZEV2ZW50KCdwYXltZW50X3Byb2Nlc3NlZCcsIHsgcGF5bWVudElkIH0pO1xyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgYWRkRXZlbnQoJ3BheW1lbnRfZmFpbGVkJywgeyBlcnJvcjogU3RyaW5nKGVycm9yKSB9KTtcclxuICAgICAgc3RhdHVzID0gJ2ZhaWxlZCc7XHJcbiAgICAgIHJldHVybiB7XHJcbiAgICAgICAgc3VjY2VzczogZmFsc2UsXHJcbiAgICAgICAgb3JkZXJJZDogaW5wdXQub3JkZXJJZCxcclxuICAgICAgICBzdGF0dXMsXHJcbiAgICAgICAgcHJvY2Vzc2VkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgICB0aW1lbGluZSxcclxuICAgICAgfTtcclxuICAgIH1cclxuICB9IGVsc2Uge1xyXG4gICAgLy8gV2FpdCBmb3IgZXh0ZXJuYWwgcGF5bWVudCBzaWduYWxcclxuICAgIGFkZEV2ZW50KCd3YWl0aW5nX2Zvcl9wYXltZW50Jyk7XHJcbiAgICBjb25zdCBnb3RQYXltZW50ID0gYXdhaXQgY29uZGl0aW9uKCgpID0+IHBheW1lbnRSZWNlaXZlZCB8fCBjYW5jZWxsZWQsIHBheW1lbnRUaW1lb3V0KTtcclxuXHJcbiAgICBpZiAoIWdvdFBheW1lbnQgfHwgY2FuY2VsbGVkKSB7XHJcbiAgICAgIGFkZEV2ZW50KCdwYXltZW50X3RpbWVvdXRfb3JfY2FuY2VsbGVkJyk7XHJcbiAgICAgIHN0YXR1cyA9IGNhbmNlbGxlZCA/ICdjYW5jZWxsZWQnIDogJ2ZhaWxlZCc7XHJcbiAgICAgIHJldHVybiB7XHJcbiAgICAgICAgc3VjY2VzczogZmFsc2UsXHJcbiAgICAgICAgb3JkZXJJZDogaW5wdXQub3JkZXJJZCxcclxuICAgICAgICBzdGF0dXMsXHJcbiAgICAgICAgcHJvY2Vzc2VkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgICB0aW1lbGluZSxcclxuICAgICAgfTtcclxuICAgIH1cclxuXHJcbiAgICBpZiAocmVjZWl2ZWRQYXltZW50RGF0YSkge1xyXG4gICAgICBwYXltZW50SWQgPSAocmVjZWl2ZWRQYXltZW50RGF0YSBhcyB7IHBheW1lbnRJZDogc3RyaW5nIH0pLnBheW1lbnRJZDtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIHN0YXR1cyA9ICdwYXltZW50X3JlY2VpdmVkJztcclxuICBhZGRFdmVudCgncGF5bWVudF9jb25maXJtZWQnLCB7IHBheW1lbnRJZCB9KTtcclxuXHJcbiAgLy8gUHVibGlzaCBwYXltZW50IHJlY2VpdmVkIGV2ZW50XHJcbiAgYXdhaXQgcHVibGlzaE9yZGVyRXZlbnQoe1xyXG4gICAgb3JkZXJJZDogaW5wdXQub3JkZXJJZCxcclxuICAgIHRlbmFudElkOiBpbnB1dC50ZW5hbnRJZCxcclxuICAgIGNvcnJlbGF0aW9uSWQ6IGlucHV0LmNvcnJlbGF0aW9uSWQsXHJcbiAgICBldmVudFR5cGU6ICdvcmRlci5wYXltZW50X3JlY2VpdmVkJyxcclxuICAgIGRhdGE6IHsgcGF5bWVudElkIH0sXHJcbiAgfSk7XHJcblxyXG4gIC8vIFN0ZXAgMzogR2VuZXJhdGUgaW52b2ljZVxyXG4gIHRyeSB7XHJcbiAgICBjb25zdCBpbnZvaWNlUmVzdWx0ID0gYXdhaXQgZ2VuZXJhdGVJbnZvaWNlKHtcclxuICAgICAgb3JkZXJJZDogaW5wdXQub3JkZXJJZCxcclxuICAgICAgdGVuYW50SWQ6IGlucHV0LnRlbmFudElkLFxyXG4gICAgICBjb3JyZWxhdGlvbklkOiBpbnB1dC5jb3JyZWxhdGlvbklkLFxyXG4gICAgICBjdXN0b21lcjogaW5wdXQuY3VzdG9tZXIsXHJcbiAgICAgIGl0ZW1zOiBpbnB1dC5pdGVtcyxcclxuICAgICAgdG90YWxBbW91bnQ6IGlucHV0LnRvdGFsQW1vdW50LFxyXG4gICAgICBjdXJyZW5jeTogaW5wdXQuY3VycmVuY3ksXHJcbiAgICB9KTtcclxuICAgIGludm9pY2VJZCA9IGludm9pY2VSZXN1bHQuaW52b2ljZUlkO1xyXG4gICAgc3RhdHVzID0gJ2ludm9pY2VkJztcclxuICAgIGFkZEV2ZW50KCdpbnZvaWNlX2dlbmVyYXRlZCcsIHtcclxuICAgICAgaW52b2ljZUlkLFxyXG4gICAgICBpbnZvaWNlTnVtYmVyOiBpbnZvaWNlUmVzdWx0Lmludm9pY2VOdW1iZXIsXHJcbiAgICB9KTtcclxuICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgYWRkRXZlbnQoJ2ludm9pY2VfZ2VuZXJhdGlvbl9mYWlsZWQnLCB7IGVycm9yOiBTdHJpbmcoZXJyb3IpIH0pO1xyXG4gICAgLy8gQ29udGludWUgYW55d2F5LCBpbnZvaWNlIGNhbiBiZSBnZW5lcmF0ZWQgbGF0ZXJcclxuICB9XHJcblxyXG4gIC8vIFN0ZXAgNDogU2VuZCBjb25maXJtYXRpb24gZW1haWxcclxuICB0cnkge1xyXG4gICAgYXdhaXQgc2VuZE9yZGVyQ29uZmlybWF0aW9uKHtcclxuICAgICAgb3JkZXJJZDogaW5wdXQub3JkZXJJZCxcclxuICAgICAgdGVuYW50SWQ6IGlucHV0LnRlbmFudElkLFxyXG4gICAgICBjdXN0b21lcjogaW5wdXQuY3VzdG9tZXIsXHJcbiAgICAgIGl0ZW1zOiBpbnB1dC5pdGVtcyxcclxuICAgICAgdG90YWxBbW91bnQ6IGlucHV0LnRvdGFsQW1vdW50LFxyXG4gICAgICBjdXJyZW5jeTogaW5wdXQuY3VycmVuY3ksXHJcbiAgICAgIGludm9pY2VJZCxcclxuICAgICAgcGF5bWVudElkLFxyXG4gICAgfSk7XHJcbiAgICBhZGRFdmVudCgnY29uZmlybWF0aW9uX3NlbnQnKTtcclxuICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgYWRkRXZlbnQoJ2NvbmZpcm1hdGlvbl9mYWlsZWQnLCB7IGVycm9yOiBTdHJpbmcoZXJyb3IpIH0pO1xyXG4gIH1cclxuXHJcbiAgLy8gU3RlcCA1OiBVcGRhdGUgaW52ZW50b3J5IChwbGFjZWhvbGRlciBmb3IgZnV0dXJlKVxyXG4gIHRyeSB7XHJcbiAgICBhd2FpdCB1cGRhdGVJbnZlbnRvcnkoe1xyXG4gICAgICB0ZW5hbnRJZDogaW5wdXQudGVuYW50SWQsXHJcbiAgICAgIGl0ZW1zOiBpbnB1dC5pdGVtcyxcclxuICAgICAgYWN0aW9uOiAnZGVjcmVhc2UnLFxyXG4gICAgfSk7XHJcbiAgICBhZGRFdmVudCgnaW52ZW50b3J5X3VwZGF0ZWQnKTtcclxuICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgYWRkRXZlbnQoJ2ludmVudG9yeV91cGRhdGVfZmFpbGVkJywgeyBlcnJvcjogU3RyaW5nKGVycm9yKSB9KTtcclxuICB9XHJcblxyXG4gIC8vIEZpbmFsIHN0YXR1c1xyXG4gIHN0YXR1cyA9ICdjb21wbGV0ZWQnO1xyXG4gIGFkZEV2ZW50KCd3b3JrZmxvd19jb21wbGV0ZWQnKTtcclxuXHJcbiAgLy8gUHVibGlzaCBjb21wbGV0aW9uIGV2ZW50XHJcbiAgYXdhaXQgcHVibGlzaE9yZGVyRXZlbnQoe1xyXG4gICAgb3JkZXJJZDogaW5wdXQub3JkZXJJZCxcclxuICAgIHRlbmFudElkOiBpbnB1dC50ZW5hbnRJZCxcclxuICAgIGNvcnJlbGF0aW9uSWQ6IGlucHV0LmNvcnJlbGF0aW9uSWQsXHJcbiAgICBldmVudFR5cGU6ICdvcmRlci5jb21wbGV0ZWQnLFxyXG4gICAgZGF0YTogeyBpbnZvaWNlSWQsIHBheW1lbnRJZCB9LFxyXG4gIH0pO1xyXG5cclxuICByZXR1cm4ge1xyXG4gICAgc3VjY2VzczogdHJ1ZSxcclxuICAgIG9yZGVySWQ6IGlucHV0Lm9yZGVySWQsXHJcbiAgICBzdGF0dXMsXHJcbiAgICBpbnZvaWNlSWQsXHJcbiAgICBwYXltZW50SWQsXHJcbiAgICBwcm9jZXNzZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxyXG4gICAgdGltZWxpbmUsXHJcbiAgfTtcclxufVxyXG4iXX0=