-- Migration 010: add llm_analysis column to drift_incidents
--
-- Stores per-escalation AI analysis results produced either:
--   a) automatically on ingest (severity = 'critical' + llmEscalationCount > 0)
--   b) on-demand via POST /api/drift/incidents/:id/analyze
--
-- Schema: Array of LLMAnalysisResult objects
--   [{ escalationIndex, action, suggestion, confidence, reasoning, analyzedAt }, ...]

ALTER TABLE drift_incidents
  ADD COLUMN IF NOT EXISTS llm_analysis JSONB NOT NULL DEFAULT '[]';

COMMENT ON COLUMN drift_incidents.llm_analysis IS
  'Per-escalation AI analysis results. Populated automatically for critical incidents '
  'or on-demand. Each element: { escalationIndex, action, suggestion, confidence, reasoning, analyzedAt }';
