"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.retryStepSignal = exports.cancelPaymentSignal = void 0;
exports.paymentWorkflow = paymentWorkflow;
const logger_js_1 = require("../utils/logger.js");
/**
 * Payment Processing Workflow
 *
 * Orquesta el flujo completo de un pago:
 * 1. Validar pago en MercadoPago
 * 2. Registrar en base de datos
 * 3. Publicar evento a Kafka
 * 4. Sincronizar con Google Sheets (opcional)
 * 5. Notificar al tenant
 */
const workflow_1 = require("@temporalio/workflow");
// Activity proxies with retry options
const { validatePayment, persistPayment, publishPaymentEvent, syncToGoogleSheets, sendNotification } = (0, workflow_1.proxyActivities)({
    startToCloseTimeout: '30 seconds',
    retry: {
        maximumAttempts: 3,
        initialInterval: '1 second',
        backoffCoefficient: 2,
        maximumInterval: '30 seconds',
    },
});
// Signals for external control
exports.cancelPaymentSignal = (0, workflow_1.defineSignal)('cancelPayment');
exports.retryStepSignal = (0, workflow_1.defineSignal)('retryStep');
async function paymentWorkflow(input) {
    const startTime = Date.now();
    const steps = [];
    let cancelled = false;
    let retryStep = null;
    // Set up signal handlers
    (0, workflow_1.setHandler)(exports.cancelPaymentSignal, (reason) => {
        cancelled = true;
        logger_js_1.logger.info(`Payment ${input.paymentId} cancelled: ${reason}`);
    });
    (0, workflow_1.setHandler)(exports.retryStepSignal, (step) => {
        retryStep = step;
        logger_js_1.logger.info(`Retrying step: ${step}`);
    });
    // Check for cancellation
    if (cancelled) {
        return {
            success: false,
            paymentId: input.paymentId,
            status: 'cancelled',
            processedAt: new Date().toISOString(),
            steps,
        };
    }
    // Step 1: Validate payment with MercadoPago
    const validateStart = Date.now();
    let paymentData;
    try {
        paymentData = await validatePayment({
            paymentId: input.paymentId,
            tenantId: input.tenantId,
        });
        steps.push({
            step: 'validate',
            success: true,
            duration: Date.now() - validateStart,
        });
    }
    catch (error) {
        steps.push({
            step: 'validate',
            success: false,
            duration: Date.now() - validateStart,
            error: error instanceof Error ? error.message : String(error),
        });
        return {
            success: false,
            paymentId: input.paymentId,
            status: 'validation_failed',
            processedAt: new Date().toISOString(),
            steps,
        };
    }
    // Step 2: Persist to database
    const persistStart = Date.now();
    try {
        await persistPayment({
            paymentId: input.paymentId,
            tenantId: input.tenantId,
            correlationId: input.correlationId,
            paymentData,
        });
        steps.push({
            step: 'persist',
            success: true,
            duration: Date.now() - persistStart,
        });
    }
    catch (error) {
        steps.push({
            step: 'persist',
            success: false,
            duration: Date.now() - persistStart,
            error: error instanceof Error ? error.message : String(error),
        });
        // Continue anyway, we can retry later
    }
    // Step 3: Publish event to Kafka
    const publishStart = Date.now();
    try {
        await publishPaymentEvent({
            paymentId: input.paymentId,
            tenantId: input.tenantId,
            correlationId: input.correlationId,
            status: paymentData.status,
            eventType: `payment.${paymentData.status}`,
        });
        steps.push({
            step: 'publish_kafka',
            success: true,
            duration: Date.now() - publishStart,
        });
    }
    catch (error) {
        steps.push({
            step: 'publish_kafka',
            success: false,
            duration: Date.now() - publishStart,
            error: error instanceof Error ? error.message : String(error),
        });
        // Non-critical, continue
    }
    // Step 4: Sync to Google Sheets (optional, non-blocking)
    const sheetsStart = Date.now();
    try {
        await syncToGoogleSheets({
            paymentId: input.paymentId,
            tenantId: input.tenantId,
            paymentData,
        });
        steps.push({
            step: 'sync_sheets',
            success: true,
            duration: Date.now() - sheetsStart,
        });
    }
    catch (error) {
        steps.push({
            step: 'sync_sheets',
            success: false,
            duration: Date.now() - sheetsStart,
            error: error instanceof Error ? error.message : String(error),
        });
        // Non-critical, continue
    }
    // Step 5: Send notification
    const notifyStart = Date.now();
    try {
        await sendNotification({
            tenantId: input.tenantId,
            type: 'payment_processed',
            data: {
                paymentId: input.paymentId,
                status: paymentData.status,
                amount: paymentData.amount,
            },
        });
        steps.push({
            step: 'notify',
            success: true,
            duration: Date.now() - notifyStart,
        });
    }
    catch (error) {
        steps.push({
            step: 'notify',
            success: false,
            duration: Date.now() - notifyStart,
            error: error instanceof Error ? error.message : String(error),
        });
    }
    return {
        success: steps.filter(s => !s.success).length === 0,
        paymentId: input.paymentId,
        status: paymentData.status,
        processedAt: new Date().toISOString(),
        steps,
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGF5bWVudC13b3JrZmxvdy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInBheW1lbnQtd29ya2Zsb3cudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBNERBLDBDQWtLQztBQTlORCxrREFBNEM7QUFDNUM7Ozs7Ozs7OztHQVNHO0FBRUgsbURBQW1HO0FBR25HLHNDQUFzQztBQUN0QyxNQUFNLEVBQ0osZUFBZSxFQUNmLGNBQWMsRUFDZCxtQkFBbUIsRUFDbkIsa0JBQWtCLEVBQ2xCLGdCQUFnQixFQUNqQixHQUFHLElBQUEsMEJBQWUsRUFBb0I7SUFDckMsbUJBQW1CLEVBQUUsWUFBWTtJQUNqQyxLQUFLLEVBQUU7UUFDTCxlQUFlLEVBQUUsQ0FBQztRQUNsQixlQUFlLEVBQUUsVUFBVTtRQUMzQixrQkFBa0IsRUFBRSxDQUFDO1FBQ3JCLGVBQWUsRUFBRSxZQUFZO0tBQzlCO0NBQ0YsQ0FBQyxDQUFDO0FBMEJILCtCQUErQjtBQUNsQixRQUFBLG1CQUFtQixHQUFHLElBQUEsdUJBQVksRUFBVyxlQUFlLENBQUMsQ0FBQztBQUM5RCxRQUFBLGVBQWUsR0FBRyxJQUFBLHVCQUFZLEVBQVcsV0FBVyxDQUFDLENBQUM7QUFFNUQsS0FBSyxVQUFVLGVBQWUsQ0FBQyxLQUEyQjtJQUMvRCxNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUM7SUFDN0IsTUFBTSxLQUFLLEdBQWlCLEVBQUUsQ0FBQztJQUMvQixJQUFJLFNBQVMsR0FBRyxLQUFLLENBQUM7SUFDdEIsSUFBSSxTQUFTLEdBQWtCLElBQUksQ0FBQztJQUVwQyx5QkFBeUI7SUFDekIsSUFBQSxxQkFBVSxFQUFDLDJCQUFtQixFQUFFLENBQUMsTUFBYyxFQUFFLEVBQUU7UUFDakQsU0FBUyxHQUFHLElBQUksQ0FBQztRQUNqQixrQkFBTSxDQUFDLElBQUksQ0FBQyxXQUFXLEtBQUssQ0FBQyxTQUFTLGVBQWUsTUFBTSxFQUFFLENBQUMsQ0FBQztJQUNqRSxDQUFDLENB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S0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQztTQUM5RCxDQUFDLENBQUM7SUFDTCxDQUFDO0lBRUQsT0FBTztRQUNMLE9BQU8sRUFBRSxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsTUFBTSxLQUFLLENBQUM7UUFDbkQsU0FBUyxFQUFFLEtBQUssQ0FBQyxTQUFTO1FBQzFCLE1BQU0sRUFBRSxXQUFXLENBQUMsTUFBTTtRQUMxQixXQUFXLEVBQUUsSUFBSSxJQUFJLEVBQUUsQ0FBQyxXQUFXLEVBQUU7UUFDckMsS0FBSztLQUNOLENBQUM7QUFDSixDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgbG9nZ2VyIH0gZnJvbSAnLi4vdXRpbHMvbG9nZ2VyLmpzJztcclxuLyoqXHJcbiAqIFBheW1lbnQgUHJvY2Vzc2luZyBXb3JrZmxvd1xyXG4gKlxyXG4gKiBPcnF1ZXN0YSBlbCBmbHVqbyBjb21wbGV0byBkZSB1biBwYWdvOlxyXG4gKiAxLiBWYWxpZGFyIHBhZ28gZW4gTWVyY2Fkb1BhZ29cclxuICogMi4gUmVnaXN0cmFyIGVuIGJhc2UgZGUgZGF0b3NcclxuICogMy4gUHVibGljYXIgZXZlbnRvIGEgS2Fma2FcclxuICogNC4gU2luY3Jvbml6YXIgY29uIEdvb2dsZSBTaGVldHMgKG9wY2lvbmFsKVxyXG4gKiA1LiBOb3RpZmljYXIgYWwgdGVuYW50XHJcbiAqL1xyXG5cclxuaW1wb3J0IHsgcHJveHlBY3Rpdml0aWVzLCBzbGVlcCwgZGVmaW5lU2lnbmFsLCBzZXRIYW5kbGVyLCBjb25kaXRpb24gfSBmcm9tICdAdGVtcG9yYWxpby93b3JrZmxvdyc7XHJcbmltcG9ydCB0eXBlICogYXMgYWN0aXZpdGllcyBmcm9tICcuLi9hY3Rpdml0aWVzL3BheW1lbnQtYWN0aXZpdGllcy5qcyc7XHJcblxyXG4vLyBBY3Rpdml0eSBwcm94aWVzIHdpdGggcmV0cnkgb3B0aW9uc1xyXG5jb25zdCB7XHJcbiAgdmFsaWRhdGVQYXltZW50LFxyXG4gIHBlcnNpc3RQYXltZW50LFxyXG4gIHB1Ymxpc2hQYXltZW50RXZlbnQsXHJcbiAgc3luY1RvR29vZ2xlU2hlZXRzLFxyXG4gIHNlbmROb3RpZmljYXRpb25cclxufSA9IHByb3h5QWN0aXZpdGllczx0eXBlb2YgYWN0aXZpdGllcz4oe1xyXG4gIHN0YXJ0VG9DbG9zZVRpbWVvdXQ6ICczMCBzZWNvbmRzJyxcclxuICByZXRyeToge1xyXG4gICAgbWF4aW11bUF0dGVtcHRzOiAzLFxyXG4gICAgaW5pdGlhbEludGVydmFsOiAnMSBzZWNvbmQnLFxyXG4gICAgYmFja29mZkNvZWZmaWNpZW50OiAyLFxyXG4gICAgbWF4aW11bUludGVydmFsOiAnMzAgc2Vjb25kcycsXHJcbiAgfSxcclxufSk7XHJcblxyXG4vLyBXb3JrZmxvdyBpbnB1dCB0eXBlXHJcbmV4cG9ydCBpbnRlcmZhY2UgUGF5bWVudFdvcmtmbG93SW5wdXQge1xyXG4gIHBheW1lbnRJZDogc3RyaW5nO1xyXG4gIHRlbmFudElkOiBzdHJpbmc7XHJcbiAgY29ycmVsYXRpb25JZDogc3RyaW5nO1xyXG4gIHNvdXJjZTogJ3dlYmhvb2snIHwgJ2FwaScgfCAnY2RjJztcclxufVxyXG5cclxuLy8gV29ya2Zsb3cgb3V0cHV0IHR5cGVcclxuZXhwb3J0IGludGVyZmFjZSBQYXltZW50V29ya2Zsb3dPdXRwdXQge1xyXG4gIHN1Y2Nlc3M6IGJvb2xlYW47XHJcbiAgcGF5bWVudElkOiBzdHJpbmc7XHJcbiAgc3RhdHVzOiBzdHJpbmc7XHJcbiAgcHJvY2Vzc2VkQXQ6IHN0cmluZztcclxuICBzdGVwczogU3RlcFJlc3VsdFtdO1xyXG59XHJcblxyXG5leHBvcnQgaW50ZXJmYWNlIFN0ZXBSZXN1bHQge1xyXG4gIHN0ZXA6IHN0cmluZztcclxuICBzdWNjZXNzOiBib29sZWFuO1xyXG4gIGR1cmF0aW9uOiBudW1iZXI7XHJcbiAgZXJyb3I/OiBzdHJpbmc7XHJcbn1cclxuXHJcbi8vIFNpZ25hbHMgZm9yIGV4dGVybmFsIGNvbnRyb2xcclxuZXhwb3J0IGNvbnN0IGNhbmNlbFBheW1lbnRTaWduYWwgPSBkZWZpbmVTaWduYWw8W3N0cmluZ10+KCdjYW5jZWxQYXltZW50Jyk7XHJcbmV4cG9ydCBjb25zdCByZXRyeVN0ZXBTaWduYWwgPSBkZWZpbmVTaWduYWw8W3N0cmluZ10+KCdyZXRyeVN0ZXAnKTtcclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBwYXltZW50V29ya2Zsb3coaW5wdXQ6IFBheW1lbnRXb3JrZmxvd0lucHV0KTogUHJvbWlzZTxQYXltZW50V29ya2Zsb3dPdXRwdXQ+IHtcclxuICBjb25zdCBzdGFydFRpbWUgPSBEYXRlLm5vdygpO1xyXG4gIGNvbnN0IHN0ZXBzOiBTdGVwUmVzdWx0W10gPSBbXTtcclxuICBsZXQgY2FuY2VsbGVkID0gZmFsc2U7XHJcbiAgbGV0IHJldHJ5U3RlcDogc3RyaW5nIHwgbnVsbCA9IG51bGw7XHJcblxyXG4gIC8vIFNldCB1cCBzaWduYWwgaGFuZGxlcnNcclxuICBzZXRIYW5kbGVyKGNhbmNlbFBheW1lbnRTaWduYWwsIChyZWFzb246IHN0cmluZykgPT4ge1xyXG4gICAgY2FuY2VsbGVkID0gdHJ1ZTtcclxuICAgIGxvZ2dlci5pbmZvKGBQYXltZW50ICR7aW5wdXQucGF5bWVudElkfSBjYW5jZWxsZWQ6ICR7cmVhc29ufWApO1xyXG4gIH0pO1xyXG5cclxuICBzZXRIYW5kbGVyKHJldHJ5U3RlcFNpZ25hbCwgKHN0ZXA6IHN0cmluZykgPT4ge1xyXG4gICAgcmV0cnlTdGVwID0gc3RlcDtcclxuICAgIGxvZ2dlci5pbmZvKGBSZXRyeWluZyBzdGVwOiAke3N0ZXB9YCk7XHJcbiAgfSk7XHJcblxyXG4gIC8vIENoZWNrIGZvciBjYW5jZWxsYXRpb25cclxuICBpZiAoY2FuY2VsbGVkKSB7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICBzdWNjZXNzOiBmYWxzZSxcclxuICAgICAgcGF5bWVudElkOiBpbnB1dC5wYXltZW50SWQsXHJcbiAgICAgIHN0YXR1czogJ2NhbmNlbGxlZCcsXHJcbiAgICAgIHByb2Nlc3NlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXHJcbiAgICAgIHN0ZXBzLFxyXG4gICAgfTtcclxuICB9XHJcblxyXG4gIC8vIFN0ZXAgMTogVmFsaWRhdGUgcGF5bWVudCB3aXRoIE1lcmNhZG9QYWdvXHJcbiAgY29uc3QgdmFsaWRhdGVTdGFydCA9IERhdGUubm93KCk7XHJcbiAgbGV0IHBheW1lbnREYXRhO1xyXG4gIHRyeSB7XHJcbiAgICBwYXltZW50RGF0YSA9IGF3YWl0IHZhbGlkYXRlUGF5bWVudCh7XHJcbiAgICAgIHBheW1lbnRJZDogaW5wdXQucGF5bWVudElkLFxyXG4gICAgICB0ZW5hbnRJZDogaW5wdXQudGVuYW50SWQsXHJcbiAgICB9KTtcclxuICAgIHN0ZXBzLnB1c2goe1xyXG4gICAgICBzdGVwOiAndmFsaWRhdGUnLFxyXG4gICAgICBzdWNjZXNzOiB0cnVlLFxyXG4gICAgICBkdXJhdGlvbjogRGF0ZS5ub3coKSAtIHZhbGlkYXRlU3RhcnQsXHJcbiAgICB9KTtcclxuICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgc3RlcHMucHVzaCh7XHJcbiAgICAgIHN0ZXA6ICd2YWxpZGF0ZScsXHJcbiAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxyXG4gICAgICBkdXJhdGlvbjogRGF0ZS5ub3coKSAtIHZhbGlkYXRlU3RhcnQsXHJcbiAgICAgIGVycm9yOiBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvciksXHJcbiAgICB9KTtcclxuICAgIHJldHVybiB7XHJcbiAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxyXG4gICAgICBwYXltZW50SWQ6IGlucHV0LnBheW1lbnRJZCxcclxuICAgICAgc3RhdHVzOiAndmFsaWRhdGlvbl9mYWlsZWQnLFxyXG4gICAgICBwcm9jZXNzZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxyXG4gICAgICBzdGVwcyxcclxuICAgIH07XHJcbiAgfVxyXG5cclxuICAvLyBTdGVwIDI6IFBlcnNpc3QgdG8gZGF0YWJhc2VcclxuICBjb25zdCBwZXJzaXN0U3RhcnQgPSBEYXRlLm5vdygpO1xyXG4gIHRyeSB7XHJcbiAgICBhd2FpdCBwZXJzaXN0UGF5bWVudCh7XHJcbiAgICAgIHBheW1lbnRJZDogaW5wdXQucGF5bWVudElkLFxyXG4gICAgICB0ZW5hbnRJZDogaW5wdXQudGVuYW50SWQsXHJcbiAgICAgIGNvcnJlbGF0aW9uSWQ6IGlucHV0LmNvcnJlbGF0aW9uSWQsXHJcbiAgICAgIHBheW1lbnREYXRhLFxyXG4gICAgfSk7XHJcbiAgICBzdGVwcy5wdXNoKHtcclxuICAgICAgc3RlcDogJ3BlcnNpc3QnLFxyXG4gICAgICBzdWNjZXNzOiB0cnVlLFxyXG4gICAgICBkdXJhdGlvbjogRGF0ZS5ub3coKSAtIHBlcnNpc3RTdGFydCxcclxuICAgIH0pO1xyXG4gIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICBzdGVwcy5wdXNoKHtcclxuICAgICAgc3RlcDogJ3BlcnNpc3QnLFxyXG4gICAgICBzdWNjZXNzOiBmYWxzZSxcclxuICAgICAgZHVyYXRpb246IERhdGUubm93KCkgLSBwZXJzaXN0U3RhcnQsXHJcbiAgICAgIGVycm9yOiBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvciksXHJcbiAgICB9KTtcclxuICAgIC8vIENvbnRpbnVlIGFueXdheSwgd2UgY2FuIHJldHJ5IGxhdGVyXHJcbiAgfVxyXG5cclxuICAvLyBTdGVwIDM6IFB1Ymxpc2ggZXZlbnQgdG8gS2Fma2FcclxuICBjb25zdCBwdWJsaXNoU3RhcnQgPSBEYXRlLm5vdygpO1xyXG4gIHRyeSB7XHJcbiAgICBhd2FpdCBwdWJsaXNoUGF5bWVudEV2ZW50KHtcclxuICAgICAgcGF5bWVudElkOiBpbnB1dC5wYXltZW50SWQsXHJcbiAgICAgIHRlbmFudElkOiBpbnB1dC50ZW5hbnRJZCxcclxuICAgICAgY29ycmVsYXRpb25JZDogaW5wdXQuY29ycmVsYXRpb25JZCxcclxuICAgICAgc3RhdHVzOiBwYXltZW50RGF0YS5zdGF0dXMsXHJcbiAgICAgIGV2ZW50VHlwZTogYHBheW1lbnQuJHtwYXltZW50RGF0YS5zdGF0dXN9YCxcclxuICAgIH0pO1xyXG4gICAgc3RlcHMucHVzaCh7XHJcbiAgICAgIHN0ZXA6ICdwdWJsaXNoX2thZmthJyxcclxuICAgICAgc3VjY2VzczogdHJ1ZSxcclxuICAgICAgZHVyYXRpb246IERhdGUubm93KCkgLSBwdWJsaXNoU3RhcnQsXHJcbiAgICB9KTtcclxuICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgc3RlcHMucHVzaCh7XHJcbiAgICAgIHN0ZXA6ICdwdWJsaXNoX2thZmthJyxcclxuICAgICAgc3VjY2VzczogZmFsc2UsXHJcbiAgICAgIGR1cmF0aW9uOiBEYXRlLm5vdygpIC0gcHVibGlzaFN0YXJ0LFxyXG4gICAgICBlcnJvcjogZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBTdHJpbmcoZXJyb3IpLFxyXG4gICAgfSk7XHJcbiAgICAvLyBOb24tY3JpdGljYWwsIGNvbnRpbnVlXHJcbiAgfVxyXG5cclxuICAvLyBTdGVwIDQ6IFN5bmMgdG8gR29vZ2xlIFNoZWV0cyAob3B0aW9uYWwsIG5vbi1ibG9ja2luZylcclxuICBjb25zdCBzaGVldHNTdGFydCA9IERhdGUubm93KCk7XHJcbiAgdHJ5IHtcclxuICAgIGF3YWl0IHN5bmNUb0dvb2dsZVNoZWV0cyh7XHJcbiAgICAgIHBheW1lbnRJZDogaW5wdXQucGF5bWVudElkLFxyXG4gICAgICB0ZW5hbnRJZDogaW5wdXQudGVuYW50SWQsXHJcbiAgICAgIHBheW1lbnREYXRhLFxyXG4gICAgfSk7XHJcbiAgICBzdGVwcy5wdXNoKHtcclxuICAgICAgc3RlcDogJ3N5bmNfc2hlZXRzJyxcclxuICAgICAgc3VjY2VzczogdHJ1ZSxcclxuICAgICAgZHVyYXRpb246IERhdGUubm93KCkgLSBzaGVldHNTdGFydCxcclxuICAgIH0pO1xyXG4gIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICBzdGVwcy5wdXNoKHtcclxuICAgICAgc3RlcDogJ3N5bmNfc2hlZXRzJyxcclxuICAgICAgc3VjY2VzczogZmFsc2UsXHJcbiAgICAgIGR1cmF0aW9uOiBEYXRlLm5vdygpIC0gc2hlZXRzU3RhcnQsXHJcbiAgICAgIGVycm9yOiBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvciksXHJcbiAgICB9KTtcclxuICAgIC8vIE5vbi1jcml0aWNhbCwgY29udGludWVcclxuICB9XHJcblxyXG4gIC8vIFN0ZXAgNTogU2VuZCBub3RpZmljYXRpb25cclxuICBjb25zdCBub3RpZnlTdGFydCA9IERhdGUubm93KCk7XHJcbiAgdHJ5IHtcclxuICAgIGF3YWl0IHNlbmROb3RpZmljYXRpb24oe1xyXG4gICAgICB0ZW5hbnRJZDogaW5wdXQudGVuYW50SWQsXHJcbiAgICAgIHR5cGU6ICdwYXltZW50X3Byb2Nlc3NlZCcsXHJcbiAgICAgIGRhdGE6IHtcclxuICAgICAgICBwYXltZW50SWQ6IGlucHV0LnBheW1lbnRJZCxcclxuICAgICAgICBzdGF0dXM6IHBheW1lbnREYXRhLnN0YXR1cyxcclxuICAgICAgICBhbW91bnQ6IHBheW1lbnREYXRhLmFtb3VudCxcclxuICAgICAgfSxcclxuICAgIH0pO1xyXG4gICAgc3RlcHMucHVzaCh7XHJcbiAgICAgIHN0ZXA6ICdub3RpZnknLFxyXG4gICAgICBzdWNjZXNzOiB0cnVlLFxyXG4gICAgICBkdXJhdGlvbjogRGF0ZS5ub3coKSAtIG5vdGlmeVN0YXJ0LFxyXG4gICAgfSk7XHJcbiAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgIHN0ZXBzLnB1c2goe1xyXG4gICAgICBzdGVwOiAnbm90aWZ5JyxcclxuICAgICAgc3VjY2VzczogZmFsc2UsXHJcbiAgICAgIGR1cmF0aW9uOiBEYXRlLm5vdygpIC0gbm90aWZ5U3RhcnQsXHJcbiAgICAgIGVycm9yOiBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvciksXHJcbiAgICB9KTtcclxuICB9XHJcblxyXG4gIHJldHVybiB7XHJcbiAgICBzdWNjZXNzOiBzdGVwcy5maWx0ZXIocyA9PiAhcy5zdWNjZXNzKS5sZW5ndGggPT09IDAsXHJcbiAgICBwYXltZW50SWQ6IGlucHV0LnBheW1lbnRJZCxcclxuICAgIHN0YXR1czogcGF5bWVudERhdGEuc3RhdHVzLFxyXG4gICAgcHJvY2Vzc2VkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcclxuICAgIHN0ZXBzLFxyXG4gIH07XHJcbn1cclxuIl19