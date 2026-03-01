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
exports.multiTenantWorkflow = multiTenantWorkflow;
// Wrapper para ejecutar workflows con aislamiento multi-tenant
async function multiTenantWorkflow(input) {
    // En producción, validar tenant, límites, suspensión, etc.
    if (input.workflowType === 'order') {
        const mod = await Promise.resolve().then(() => __importStar(require('./order-workflow.js')));
        const orderWorkflow = mod.orderWorkflow;
        const result = await orderWorkflow(input.payload);
        return { tenantId: input.tenantId, workflowType: 'order', result };
    }
    else if (input.workflowType === 'payment') {
        const mod = await Promise.resolve().then(() => __importStar(require('./payment-workflow.js')));
        const paymentWorkflow = mod.paymentWorkflow;
        const result = await paymentWorkflow(input.payload);
        return { tenantId: input.tenantId, workflowType: 'payment', result };
    }
    throw new Error('Invalid workflow type');
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibXVsdGlUZW5hbnRXb3JrZmxvdy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIm11bHRpVGVuYW50V29ya2Zsb3cudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFpQkEsa0RBY0M7QUFmRCwrREFBK0Q7QUFDeEQsS0FBSyxVQUFVLG1CQUFtQixDQUFDLEtBQStCO0lBQ3ZFLDJEQUEyRDtJQUMzRCxJQUFJLEtBQUssQ0FBQyxZQUFZLEtBQUssT0FBTyxFQUFFLENBQUM7UUFDbkMsTUFBTSxHQUFHLEdBQUcsd0RBQWEscUJBQXFCLEdBQUMsQ0FBQztRQUNoRCxNQUFNLGFBQWEsR0FBRyxHQUFHLENBQUMsYUFBNEUsQ0FBQztRQUN2RyxNQUFNLE1BQU0sR0FBRyxNQUFNLGFBQWEsQ0FBQyxLQUFLLENBQUMsT0FBNkIsQ0FBQyxDQUFDO1FBQ3hFLE9BQU8sRUFBRSxRQUFRLEVBQUUsS0FBSyxDQUFDLFFBQVEsRUFBRSxZQUFZLEVBQUUsT0FBTyxFQUFFLE1BQU0sRUFBRSxDQUFDO0lBQ3JFLENBQUM7U0FBTSxJQUFJLEtBQUssQ0FBQyxZQUFZLEtBQUssU0FBUyxFQUFFLENBQUM7UUFDNUMsTUFBTSxHQUFHLEdBQUcsd0RBQWEsdUJBQXVCLEdBQUMsQ0FBQztRQUNsRCxNQUFNLGVBQWUsR0FBRyxHQUFHLENBQUMsZUFBa0YsQ0FBQztRQUMvRyxNQUFNLE1BQU0sR0FBRyxNQUFNLGVBQWUsQ0FBQyxLQUFLLENBQUMsT0FBK0IsQ0FBQyxDQUFDO1FBQzVFLE9BQU8sRUFBRSxRQUFRLEVBQUUsS0FBSyxDQUFDLFFBQVEsRUFBRSxZQUFZLEVBQUUsU0FBUyxFQUFFLE1BQU0sRUFBRSxDQUFDO0lBQ3ZFLENBQUM7SUFDRCxNQUFNLElBQUksS0FBSyxDQUFDLHVCQUF1QixDQUFDLENBQUM7QUFDM0MsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8vIE11bHRpLXRlbmFudCB3b3JrZmxvdyB3cmFwcGVyIChiYXNlKVxyXG5pbXBvcnQgdHlwZSB7IE9yZGVyV29ya2Zsb3dJbnB1dCwgT3JkZXJXb3JrZmxvd091dHB1dCB9IGZyb20gJy4vb3JkZXItd29ya2Zsb3cuanMnO1xyXG5pbXBvcnQgdHlwZSB7IFBheW1lbnRXb3JrZmxvd0lucHV0LCBQYXltZW50V29ya2Zsb3dPdXRwdXQgfSBmcm9tICcuL3BheW1lbnQtd29ya2Zsb3cuanMnO1xyXG5cclxuZXhwb3J0IHR5cGUgTXVsdGlUZW5hbnRXb3JrZmxvd0lucHV0ID0ge1xyXG4gIHRlbmFudElkOiBzdHJpbmc7XHJcbiAgd29ya2Zsb3dUeXBlOiAnb3JkZXInIHwgJ3BheW1lbnQnO1xyXG4gIHBheWxvYWQ6IE9yZGVyV29ya2Zsb3dJbnB1dCB8IFBheW1lbnRXb3JrZmxvd0lucHV0O1xyXG59O1xyXG5cclxuZXhwb3J0IHR5cGUgTXVsdGlUZW5hbnRXb3JrZmxvd091dHB1dCA9IHtcclxuICB0ZW5hbnRJZDogc3RyaW5nO1xyXG4gIHdvcmtmbG93VHlwZTogJ29yZGVyJyB8ICdwYXltZW50JztcclxuICByZXN1bHQ6IE9yZGVyV29ya2Zsb3dPdXRwdXQgfCBQYXltZW50V29ya2Zsb3dPdXRwdXQ7XHJcbn07XHJcblxyXG4vLyBXcmFwcGVyIHBhcmEgZWplY3V0YXIgd29ya2Zsb3dzIGNvbiBhaXNsYW1pZW50byBtdWx0aS10ZW5hbnRcclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIG11bHRpVGVuYW50V29ya2Zsb3coaW5wdXQ6IE11bHRpVGVuYW50V29ya2Zsb3dJbnB1dCk6IFByb21pc2U8TXVsdGlUZW5hbnRXb3JrZmxvd091dHB1dD4ge1xyXG4gIC8vIEVuIHByb2R1Y2Npw7NuLCB2YWxpZGFyIHRlbmFudCwgbMOtbWl0ZXMsIHN1c3BlbnNpw7NuLCBldGMuXHJcbiAgaWYgKGlucHV0LndvcmtmbG93VHlwZSA9PT0gJ29yZGVyJykge1xyXG4gICAgY29uc3QgbW9kID0gYXdhaXQgaW1wb3J0KCcuL29yZGVyLXdvcmtmbG93LmpzJyk7XHJcbiAgICBjb25zdCBvcmRlcldvcmtmbG93ID0gbW9kLm9yZGVyV29ya2Zsb3cgYXMgKGlucHV0OiBPcmRlcldvcmtmbG93SW5wdXQpID0+IFByb21pc2U8T3JkZXJXb3JrZmxvd091dHB1dD47XHJcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBvcmRlcldvcmtmbG93KGlucHV0LnBheWxvYWQgYXMgT3JkZXJXb3JrZmxvd0lucHV0KTtcclxuICAgIHJldHVybiB7IHRlbmFudElkOiBpbnB1dC50ZW5hbnRJZCwgd29ya2Zsb3dUeXBlOiAnb3JkZXInLCByZXN1bHQgfTtcclxuICB9IGVsc2UgaWYgKGlucHV0LndvcmtmbG93VHlwZSA9PT0gJ3BheW1lbnQnKSB7XHJcbiAgICBjb25zdCBtb2QgPSBhd2FpdCBpbXBvcnQoJy4vcGF5bWVudC13b3JrZmxvdy5qcycpO1xyXG4gICAgY29uc3QgcGF5bWVudFdvcmtmbG93ID0gbW9kLnBheW1lbnRXb3JrZmxvdyBhcyAoaW5wdXQ6IFBheW1lbnRXb3JrZmxvd0lucHV0KSA9PiBQcm9taXNlPFBheW1lbnRXb3JrZmxvd091dHB1dD47XHJcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBwYXltZW50V29ya2Zsb3coaW5wdXQucGF5bG9hZCBhcyBQYXltZW50V29ya2Zsb3dJbnB1dCk7XHJcbiAgICByZXR1cm4geyB0ZW5hbnRJZDogaW5wdXQudGVuYW50SWQsIHdvcmtmbG93VHlwZTogJ3BheW1lbnQnLCByZXN1bHQgfTtcclxuICB9XHJcbiAgdGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIHdvcmtmbG93IHR5cGUnKTtcclxufVxyXG4iXX0=