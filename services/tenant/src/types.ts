// Tipos base multi-tenant IntegraX

export type Tenant = {
  id: string;
  name: string;
  plan: string;
  ownerUserId: string;
  limits: {
    rateLimit: number;
    jobsPerMinute: number;
    concurrency: number;
  };
  status: 'active' | 'suspended';
  createdAt: string;
  updatedAt: string;
};

export type User = {
  id: string;
  tenantId: string;
  email: string;
  role: 'platform-admin' | 'tenant-admin' | 'operator' | 'viewer';
  createdAt: string;
  updatedAt: string;
};

export type Credential = {
  id: string;
  tenantId: string;
  connector: string;
  data: Record<string, string>; // Encrypted
  createdAt: string;
  updatedAt: string;
};

export type Workflow = {
  id: string;
  tenantId: string;
  name: string;
  version: number;
  definition: Record<string, any>;
  status: 'active' | 'paused';
  createdAt: string;
  updatedAt: string;
};

export type WorkflowRun = {
  id: string;
  workflowId: string;
  tenantId: string;
  status: 'pending' | 'running' | 'success' | 'failed' | 'paused';
  steps: Array<{
    name: string;
    status: string;
    input: any;
    output: any;
    startedAt: string;
    endedAt: string;
    error?: string;
  }>;
  startedAt: string;
  endedAt?: string;
};

export type Event = {
  id: string;
  tenantId: string;
  type: string;
  payload: any;
  schemaVersion: string;
  receivedAt: string;
  processedAt?: string;
  status: 'pending' | 'processed' | 'failed' | 'dlq';
};

export type Log = {
  id: string;
  tenantId: string;
  type: string;
  message: string;
  level: 'info' | 'warn' | 'error';
  createdAt: string;
  userId?: string;
};
