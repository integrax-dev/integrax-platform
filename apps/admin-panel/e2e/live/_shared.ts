import { expect, request, type APIRequestContext } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

export type LiveSeedState = {
  apiBaseUrl: string;
  webBaseUrl: string;
  adminEmail: string;
  token: string;
  user: { id: string; email: string; name: string; role: 'platform_admin' };
  runId: string;
  sources: Record<string, { sourceId: string; protocol: string; incidentId?: string }>;
  createdIncidentIds?: string[];
};

export const LIVE_STATE_PATH = path.join(process.cwd(), '.e2e-live.json');

export function readLiveState(): LiveSeedState {
  const raw = fs.readFileSync(LIVE_STATE_PATH, 'utf8');
  return JSON.parse(raw) as LiveSeedState;
}

export function writeLiveState(state: LiveSeedState): void {
  fs.writeFileSync(LIVE_STATE_PATH, JSON.stringify(state, null, 2));
}

export function recordCreatedIncidentId(id: string): void {
  const state = readLiveState();
  const ids = new Set(state.createdIncidentIds ?? []);
  ids.add(id);
  writeLiveState({ ...state, createdIncidentIds: [...ids] });
}

export function getApiBaseUrl(): string {
  return (process.env.E2E_API_BASE_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
}

export function getWebBaseUrl(): string {
  return (process.env.E2E_WEB_BASE_URL ?? 'http://localhost:5174').replace(/\/$/, '');
}

export function getAdminCreds(): { email: string; password: string } {
  return {
    email: process.env.E2E_ADMIN_EMAIL ?? process.env.ADMIN_EMAIL ?? 'admin@integrax.io',
    password: process.env.E2E_ADMIN_PASSWORD ?? process.env.ADMIN_PASSWORD ?? 'integrax-dev',
  };
}

export async function loginAdmin(api: APIRequestContext, email: string, password: string): Promise<{ user: LiveSeedState['user']; token: string }> {
  const res = await api.post('/api/admin/login', { data: { email, password } });
  expect(res.ok()).toBeTruthy();
  const json = await res.json() as { user: LiveSeedState['user']; token: string };
  expect(json?.token).toBeTruthy();
  return { user: json.user, token: json.token };
}

export async function newApiContext(baseURL: string, token?: string): Promise<APIRequestContext> {
  return await request.newContext({
    baseURL,
    extraHTTPHeaders: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
}

export function openApiSchemaV1(title: string): string {
  return [
    'openapi: 3.0.0',
    `info: { title: ${JSON.stringify(title)}, version: "1.0.0" }`,
    'paths:',
    '  /users:',
    '    get:',
    "      responses:",
    "        '200':",
    '          description: ok',
    '          content:',
    '            application/json:',
    '              schema:',
    '                type: object',
    '                properties:',
    '                  name: { type: string }',
  ].join('\n');
}

export function openApiSchemaV2Rename(title: string): string {
  return [
    'openapi: 3.0.0',
    `info: { title: ${JSON.stringify(title)}, version: "2.0.0" }`,
    'paths:',
    '  /users:',
    '    get:',
    "      responses:",
    "        '200':",
    '          description: ok',
    '          content:',
    '            application/json:',
    '              schema:',
    '                type: object',
    '                properties:',
    '                  full_name: { type: string }',
  ].join('\n');
}

export function sqlSchemaV1(): string {
  return [
    'CREATE TABLE users (',
    '  id INT,',
    '  name TEXT',
    ');',
  ].join('\n');
}

export function sqlSchemaV2Rename(): string {
  return [
    'CREATE TABLE users (',
    '  id INT,',
    '  full_name TEXT',
    ');',
  ].join('\n');
}

export function csvSchemaV1(): string {
  return ['id,name', '1,Ada'].join('\n');
}

export function csvSchemaV2Rename(): string {
  return ['id,full_name', '1,Ada Lovelace'].join('\n');
}

export function jsonlSchemaV1(): string {
  return [JSON.stringify({ id: 1, name: 'Ada' })].join('\n');
}

export function jsonlSchemaV2Rename(): string {
  return [JSON.stringify({ id: 1, full_name: 'Ada Lovelace' })].join('\n');
}

export function avroSchemaV1(name = 'User'): string {
  return JSON.stringify({
    type: 'record',
    name,
    fields: [
      { name: 'id', type: 'int' },
      { name: 'name', type: 'string' },
    ],
  });
}

export function avroSchemaV2Rename(name = 'User'): string {
  return JSON.stringify({
    type: 'record',
    name,
    fields: [
      { name: 'id', type: 'int' },
      { name: 'full_name', type: 'string' },
    ],
  });
}

export function xmlSchemaV1(): string {
  return '<user><id>1</id><name>Ada</name></user>';
}

export function xmlSchemaV2Rename(): string {
  return '<user><id>1</id><full_name>Ada Lovelace</full_name></user>';
}

export function soapSchemaV1(): string {
  return [
    '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">',
    '  <soap:Body>',
    '    <GetUserResponse>',
    '      <user><id>1</id><name>Ada</name></user>',
    '    </GetUserResponse>',
    '  </soap:Body>',
    '</soap:Envelope>',
  ].join('\n');
}

export function soapSchemaV2Rename(): string {
  return [
    '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">',
    '  <soap:Body>',
    '    <GetUserResponse>',
    '      <user><id>1</id><full_name>Ada Lovelace</full_name></user>',
    '    </GetUserResponse>',
    '  </soap:Body>',
    '</soap:Envelope>',
  ].join('\n');
}

export function graphqlSchemaV1(): string {
  return ['type User {', '  id: Int!', '  name: String', '}', 'type Query { user: User }'].join('\n');
}

export function graphqlSchemaV2Rename(): string {
  return ['type User {', '  id: Int!', '  full_name: String', '}', 'type Query { user: User }'].join('\n');
}

export function parquetSchemaV1(): string {
  // Minimal Parquet-like schema JSON (schema-bridge parser tolerates simplified shapes).
  return JSON.stringify({
    fields: [
      { name: 'id', type: 'INT32' },
      { name: 'name', type: 'UTF8' },
    ],
  });
}

export function parquetSchemaV2Rename(): string {
  return JSON.stringify({
    fields: [
      { name: 'id', type: 'INT32' },
      { name: 'full_name', type: 'UTF8' },
    ],
  });
}

export function protobufSchemaV1(): string {
  return [
    'syntax = "proto3";',
    'message User {',
    '  int32 id = 1;',
    '  string name = 2;',
    '}',
  ].join('\n');
}

export function protobufSchemaV2Rename(): string {
  return [
    'syntax = "proto3";',
    'message User {',
    '  int32 id = 1;',
    '  string full_name = 2;',
    '}',
  ].join('\n');
}

export async function captureBaseline(api: APIRequestContext, sourceId: string, protocol: string, schema: string): Promise<void> {
  const res = await api.post('/api/drift/baseline', { data: { sourceId, protocol, schema } });
  expect(res.ok()).toBeTruthy();
}

export async function ingest(api: APIRequestContext, sourceId: string, protocol: string, schema: string): Promise<Record<string, unknown> | null> {
  const res = await api.post('/api/drift/ingest', { data: { sourceId, protocol, schema } });
  expect(res.ok()).toBeTruthy();
  const json = await res.json();
  return json?.data ?? null;
}

export async function waitForIncidentInList(api: APIRequestContext, sourceId: string, timeoutMs = 20_000): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await api.get('/api/drift/incidents?limit=100');
    if (res.ok()) {
      const json = await res.json();
      const list: Array<Record<string, unknown>> = json?.data ?? [];
      const found = list.find((i) => i?.sourceId === sourceId);
      if (found?.id) return String(found.id);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Timed out waiting for incident sourceId=${sourceId} to appear in list`);
}

export async function dismissIncident(api: APIRequestContext, incidentId: string): Promise<void> {
  const res = await api.post(`/api/drift/incidents/${encodeURIComponent(incidentId)}/status`, { data: { status: 'dismissed' } });
  // Best-effort cleanup: ignore failures (e.g. already deleted / auth expired)
  void res;
}
