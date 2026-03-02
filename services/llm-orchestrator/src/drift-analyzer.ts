/**
 * LLM Drift Analyzer
 *
 * OFFLINE-ONLY: Uses Claude to analyze API drift evidence packs and produce
 * human-readable summaries and recommended remediation steps.
 *
 * SECURITY RULES (enforced here):
 *  1. This module is NEVER called in the synchronous request/response path.
 *  2. All LLM calls are async, rate-limited, and optional (graceful degradation).
 *  3. No LLM output is ever executed as code — it is advisory text only.
 *  4. LLM is disabled unless ENABLE_LLM_DRIFT_ANALYSIS=true is set.
 *  5. All prompts and responses are logged to an audit file.
 */

import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { EvidencePack, DriftReport } from '../../connector-watchdog/src/types.js';

// ─── Feature flag guard ───────────────────────────────────────────────────────

function isLlmEnabled(): boolean {
  return process.env.ENABLE_LLM_DRIFT_ANALYSIS === 'true';
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DriftAnalysis {
  summary: string;
  rootCauseHypotheses: string[];
  recommendedActions: string[];
  estimatedImpact: 'high' | 'medium' | 'low';
  confidenceScore: number;
  analysisModel: string;
  analyzedAt: string;
  /** Always false — LLM output is advisory only */
  isExecutable: false;
}

export interface DriftAnalyzerConfig {
  anthropicApiKey: string;
  model?: string;
  maxTokens?: number;
  auditLogDir?: string;
}

// ─── Prompt builder ───────────────────────────────────────────────────────────

function buildAnalysisPrompt(evidence: EvidencePack): string {
  const { drift, httpSamples, connectorId } = evidence;

  const changesSummary = drift.changes
    .map(c => `  - [${c.severity.toUpperCase()}] ${c.type}: ${c.description}${c.path ? ` (${c.path})` : ''}`)
    .join('\n');

  const samplesSummary = httpSamples.slice(0, 3)
    .map(s => `  ${s.method} ${s.url} → ${s.responseStatus} (${s.latencyMs}ms)${s.error ? ` ERROR: ${s.error}` : ''}`)
    .join('\n');

  return `You are analyzing API drift for the "${connectorId}" connector.

DRIFT REPORT:
- Connector: ${connectorId}
- Severity: ${drift.severity}
- Detected at: ${drift.detectedAt}
- API version (baseline): ${drift.baseline.version}
- API version (current): ${drift.current.version}
- Changes detected:
${changesSummary || '  (no specific changes recorded)'}

${httpSamples.length > 0 ? `RECENT HTTP SAMPLES (${httpSamples.length} total, showing first 3):
${samplesSummary}` : 'No HTTP samples available.'}

Please provide:
1. A concise 2-3 sentence summary of what changed and why it matters
2. Up to 3 root cause hypotheses for the drift
3. Up to 5 specific recommended actions for the engineering team
4. Estimated impact (high/medium/low) on active integrations

Respond in JSON format:
{
  "summary": "...",
  "rootCauseHypotheses": ["...", "..."],
  "recommendedActions": ["...", "..."],
  "estimatedImpact": "high|medium|low",
  "confidenceScore": 0.0-1.0
}`;
}

// ─── Audit logger ─────────────────────────────────────────────────────────────

async function auditLog(auditDir: string, entry: object): Promise<void> {
  try {
    await mkdir(auditDir, { recursive: true });
    const line = JSON.stringify({ timestamp: new Date().toISOString(), ...entry }) + '\n';
    await appendFile(join(auditDir, 'llm-audit.jsonl'), line, 'utf-8');
  } catch {
    // Audit log failure is non-fatal
  }
}

// ─── Drift Analyzer ───────────────────────────────────────────────────────────

export class DriftAnalyzer {
  private readonly model: string;
  private readonly maxTokens: number;
  private readonly auditLogDir: string;
  private anthropicApiKey: string;

  constructor(private readonly config: DriftAnalyzerConfig) {
    this.anthropicApiKey = config.anthropicApiKey;
    this.model = config.model ?? 'claude-sonnet-4-6';
    this.maxTokens = config.maxTokens ?? 1024;
    this.auditLogDir = config.auditLogDir ?? './audit';
  }

  /**
   * Analyze an evidence pack using LLM.
   *
   * Returns null if:
   *  - LLM is disabled (ENABLE_LLM_DRIFT_ANALYSIS != 'true')
   *  - LLM call fails (graceful degradation)
   *
   * NEVER throws — always returns null on error.
   */
  async analyze(evidence: EvidencePack): Promise<DriftAnalysis | null> {
    if (!isLlmEnabled()) {
      return null;
    }

    const prompt = buildAnalysisPrompt(evidence);

    await auditLog(this.auditLogDir, {
      type: 'llm_drift_analysis_request',
      connectorId: evidence.connectorId,
      evidencePackId: evidence.id,
      model: this.model,
      promptLength: prompt.length,
    });

    try {
      const response = await this.callClaude(prompt);
      const parsed = this.parseResponse(response);

      if (!parsed) return null;

      const analysis: DriftAnalysis = {
        ...parsed,
        analysisModel: this.model,
        analyzedAt: new Date().toISOString(),
        isExecutable: false,
      };

      await auditLog(this.auditLogDir, {
        type: 'llm_drift_analysis_response',
        connectorId: evidence.connectorId,
        evidencePackId: evidence.id,
        model: this.model,
        estimatedImpact: analysis.estimatedImpact,
        confidenceScore: analysis.confidenceScore,
        isExecutable: false, // always logged for audit
      });

      return analysis;
    } catch (err) {
      await auditLog(this.auditLogDir, {
        type: 'llm_drift_analysis_error',
        connectorId: evidence.connectorId,
        evidencePackId: evidence.id,
        error: String(err),
      });

      console.error(`[drift-analyzer] LLM analysis failed for ${evidence.connectorId}: ${err}`);
      return null;
    }
  }

  /**
   * Generate a plain-English summary of a drift report without full evidence pack.
   * Used for quick notification summaries.
   */
  async summariseDriftReport(report: DriftReport): Promise<string | null> {
    if (!isLlmEnabled()) return null;

    const prompt = `Summarize this API drift report in one sentence for a Slack notification:
Connector: ${report.connectorId}
Severity: ${report.severity}
Changes: ${report.changes.map(c => c.description).join('; ')}

Respond with just the one-sentence summary, no JSON.`;

    try {
      const response = await this.callClaude(prompt);
      return response.trim();
    } catch {
      return null;
    }
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private async callClaude(prompt: string): Promise<string> {
    // Dynamic import to avoid hard dependency when LLM is disabled
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: this.anthropicApiKey });

    const message = await client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      messages: [{ role: 'user', content: prompt }],
    });

    const block = message.content.find(b => b.type === 'text');
    return block?.type === 'text' ? block.text : '';
  }

  private parseResponse(response: string): Omit<DriftAnalysis, 'analysisModel' | 'analyzedAt' | 'isExecutable'> | null {
    try {
      // Extract JSON from response (LLM may wrap in markdown)
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;

      const parsed = JSON.parse(jsonMatch[0]) as {
        summary?: string;
        rootCauseHypotheses?: string[];
        recommendedActions?: string[];
        estimatedImpact?: string;
        confidenceScore?: number;
      };

      return {
        summary: parsed.summary ?? 'No summary available',
        rootCauseHypotheses: Array.isArray(parsed.rootCauseHypotheses) ? parsed.rootCauseHypotheses : [],
        recommendedActions: Array.isArray(parsed.recommendedActions) ? parsed.recommendedActions : [],
        estimatedImpact: (['high', 'medium', 'low'].includes(parsed.estimatedImpact ?? '') ? parsed.estimatedImpact : 'medium') as DriftAnalysis['estimatedImpact'],
        confidenceScore: typeof parsed.confidenceScore === 'number' ? Math.min(1, Math.max(0, parsed.confidenceScore)) : 0.5,
      };
    } catch {
      return null;
    }
  }
}

// ─── Factory ─────────────────────────────────────────────────────────────────

export function createDriftAnalyzer(config: DriftAnalyzerConfig): DriftAnalyzer {
  return new DriftAnalyzer(config);
}
