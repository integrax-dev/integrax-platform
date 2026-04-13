# Schema Drift Pipeline

End-to-end detection, scoring, triage, and AI-assisted resolution of schema drift across SQL, OpenAPI, Avro, CSV, SOAP, and GraphQL sources.

## Architecture

```
Input (raw schema)
    │
    ▼
DriftService.ingest()
    │  SqlDdlAdapter / OpenApiAdapter / generic inferrer
    │  → NormalizedSchema (fields + fingerprint)
    │
    ▼
SchemaBridge.compare()          ← deterministic engine (0 tokens)
    │  SchemaDiffer: field_removed, field_added, type_changed, rename_candidate…
    │  SimilarityEngine: cosine similarity on field names + types
    │  ResolvedConflicts: confidence score per diff
    │
    ├─ confidence ≥ 0.95 → auto_resolved  (no LLM, no tokens, ever)
    ├─ confidence 0.75–0.95 → human_review queued
    └─ confidence < 0.75 → llmRequired: true + promptSeed generated
    │
    ▼
assessImpact()                  ← deterministic scoring (0 tokens)
    │  impactScore 0–100
    │  impactLabel: none / low / medium / high / critical
    │  primaryRoutingTarget: incident_alert / operator_review / timeline_trace / auto_resolved
    │  remediationHints per diff
    │
    ▼
drift_incidents (Postgres)
    │  full BridgeReport stored as JSONB
    │  llm_analysis: [] initially
    │
    ├─ severity = 'critical' AND llmEscalationCount > 0 AND ANTHROPIC_API_KEY set
    │       │
    │       ▼
    │   analyzeEscalationsInBackground()   ← non-blocking, does not delay ingest response
    │       │  Calls Claude Haiku per escalation with pre-built promptSeed
    │       │  → { action, suggestion, confidence, reasoning }
    │       │  Saved to llm_analysis[] in drift_incidents
    │
    ▼
GET /api/drift/incidents → Admin Panel (Incidents page)
    │  llm_analysis[] already populated for critical incidents
    │  UI shows AI recommendations inline — no wait, no extra click needed
    │
    └─ For major/minor incidents: operator clicks "Analyze with AI" on demand
           POST /api/drift/incidents/:id/analyze
           → same Claude Haiku call → persisted → shown inline
```

## LLM policy — when tokens are spent

The deterministic engine resolves everything it can for free. LLM is only invoked when:

| Condition | Trigger | Timing |
|---|---|---|
| `severity = critical` + `llmEscalationCount > 0` | Automatic on ingest | Background, non-blocking |
| `severity = major/minor` + operator clicks "Analyze with AI" | On-demand | Synchronous, operator-initiated |
| `ANTHROPIC_API_KEY` not set | Never | Graceful 503 |

Each escalation produces a `promptSeed` assembled by `schema-bridge` with full diff context. The control plane sends it to `claude-haiku-4-5-20251001` with a JSON-only response constraint.

**The ingest endpoint always returns immediately.** Background analysis happens after the response is sent. By the time the operator opens the incident in the UI, the analysis is typically already there.

## LLM response shape

```json
{
  "action": "renamed_to | truly_removed | type_changed | moved_to_nested | needs_investigation",
  "suggestion": "Field 'name' was likely renamed to 'full_name' — update your ETL transform.",
  "confidence": 0.87,
  "reasoning": "The field disappeared in system B but a similarly-named field appeared. No type change detected."
}
```

Stored in `drift_incidents.llm_analysis` as an array indexed by `escalationIndex`. Re-analyzing overwrites the previous result for that index.

## REST API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/drift/baseline` | Capture current schema as reference point |
| `POST` | `/api/drift/ingest` | Compare new schema against baseline → creates incident if drift found |
| `GET`  | `/api/drift/incidents` | List incidents (filter by status, protocol, severity, sourceId) |
| `GET`  | `/api/drift/incidents/:id` | Single incident with full BridgeReport + llmAnalysis |
| `POST` | `/api/drift/incidents/:id/status` | Transition: open → investigating → resolved / dismissed |
| `POST` | `/api/drift/incidents/:id/analyze` | On-demand LLM analysis for one escalation (body: `{ escalationIndex }`) |
| `POST` | `/api/drift/incidents/:id/remediate` | Start Temporal remediation for all affected tenants |
| `GET`  | `/api/drift/baselines` | List all stored baselines |

### Ingest payload

```json
{
  "sourceId": "public_schema",
  "protocol": "sql",
  "schema": "CREATE TABLE users (id SERIAL PRIMARY KEY, name TEXT NOT NULL);",
  "connectorId": "mercadopago"
}
```

`connectorId` is optional — if provided, `listTenantsByConnector()` populates `affectedTenants` automatically.

### Supported protocols

| Protocol | Input format | Adapter |
|----------|-------------|---------|
| `sql` | Raw DDL string | `SqlDdlAdapter` |
| `openapi` | OpenAPI YAML or JSON string | `OpenApiAdapter` |
| `avro` | Avro schema as JSON string | Generic inferrer |
| `csv` | Header row + optional sample rows | Generic inferrer |
| `soap` | WSDL/XSD XML | Generic inferrer |
| `graphql` | GraphQL SDL string | Generic inferrer |

## Database tables

```sql
drift_incidents    -- one row per detected drift event
                   -- bridge_report JSONB: full SchemaBridge output
                   -- llm_analysis JSONB: array of LLMAnalysisResult (auto or on-demand)
drift_baselines    -- one row per (source_id, protocol) — the reference state
drift_event_buffer -- events buffered while a tenant is in maintenance mode
```

## Admin Panel — Incidents page

The UI surfaces the full pipeline output without exposing its internals:

- **Collapsed row**: severity · sourceId · protocol badge · status · impact % · blast radius · resolution summary (`3 auto · ⚡ 2 AI analyzed`)
- **Expanded — diff table**: GitHub-style `+/-` lines with human-readable descriptions, confidence %, breaking flag, and deterministic/LLM badge per diff
- **Expanded — LLM Escalations**: for each ambiguous diff, the AI recommendation is shown inline (action label, suggestion, confidence, reasoning). "Re-analyze" available if the operator disagrees.
- **Start Remediation**: CTA for `incident_alert` routing + blast radius > 0 — triggers the Temporal remediation workflow

## Remediation workflow (Temporal)

When a critical incident triggers remediation:

1. `remediateTenantWorkflow` puts affected tenants in `maintenance` status
2. Orchestrator buffers all inbound events to `drift_event_buffer`
3. External fix is applied (signal: `remediationComplete`)
4. `drainEventBuffer` replays buffered events via `/webhooks/internal/event`
5. Tenants return to `active`

On failure tenants stay in `maintenance` — never auto-reverted without human confirmation.

Trigger via `POST /api/drift/incidents/:id/remediate` or directly via `TemporalClientService.startRemediation(tenantId)`.
