import { Tenant } from '../types.js';

// In-memory store (replace with database in production)
export const tenants = new Map<string, Tenant>();
