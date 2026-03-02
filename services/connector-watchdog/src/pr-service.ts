/**
 * PR Service
 *
 * Creates GitHub Pull Requests automatically when significant API drift is detected.
 * Uses the GitHub REST API (no external SDK required).
 *
 * PR workflow:
 *  1. Create a new branch off baseBranch
 *  2. Commit a drift report JSON file + updated fingerprint snapshot
 *  3. Open a PR with a structured body linking to the evidence pack
 *  4. Apply labels (drift-alert, severity-*) and assignees
 */

import type { DriftReport, PullRequestPayload, PullRequestResult, WatchdogConfig } from './types.js';

// ─── GitHub API client ────────────────────────────────────────────────────────

interface GithubConfig {
  owner: string;
  repo: string;
  token: string;
  defaultBaseBranch: string;
  defaultAssignees: string[];
  defaultLabels: string[];
}

async function githubRequest(
  endpoint: string,
  config: GithubConfig,
  options: RequestInit = {},
): Promise<unknown> {
  const url = `https://api.github.com/repos/${config.owner}/${config.repo}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${config.token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });

  const body = await response.json() as unknown;

  if (!response.ok) {
    const msg = (body as { message?: string })?.message ?? response.statusText;
    throw new Error(`GitHub API error [${response.status}]: ${msg}`);
  }

  return body;
}

// ─── PR Service ───────────────────────────────────────────────────────────────

export class PrService {
  private readonly github: GithubConfig;

  constructor(private readonly config: WatchdogConfig) {
    if (!config.github) {
      throw new Error('PrService requires github config');
    }
    this.github = config.github;
  }

  /**
   * Create a PR for the given drift report.
   * Returns null if github config is missing or PR creation is not needed.
   */
  async createDriftPr(report: DriftReport): Promise<PullRequestResult | null> {
    if (!this.github) return null;

    const branch = `drift/${report.connectorId}-${Date.now()}`;
    const payload = this.buildPayload(report, branch);

    // Get base branch SHA
    const baseRef = await this.getRef(this.github.defaultBaseBranch);
    const baseSha = (baseRef as { object: { sha: string } }).object.sha;

    // Create new branch
    await this.createRef(branch, baseSha);

    // Commit files
    for (const file of payload.files) {
      await this.createOrUpdateFile(branch, file.path, file.content, baseSha);
    }

    // Open PR
    const pr = await this.openPr(payload) as { html_url: string; number: number; created_at: string };

    // Add labels and assignees
    await this.addLabels(pr.number, payload.labels);
    if (payload.assignees.length > 0) {
      await this.addAssignees(pr.number, payload.assignees);
    }

    return {
      url: pr.html_url,
      number: pr.number,
      branch,
      createdAt: pr.created_at,
    };
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private buildPayload(report: DriftReport, branch: string): PullRequestPayload {
    const emoji = report.severity === 'critical' ? '🚨' : report.severity === 'major' ? '⚠️' : 'ℹ️';

    const body = this.buildPrBody(report);

    return {
      title: `${emoji} API Drift: ${report.connectorId} [${report.severity.toUpperCase()}]`,
      body,
      branch,
      baseBranch: this.github.defaultBaseBranch,
      files: [
        {
          path: `drift-reports/${report.connectorId}/${report.id}.json`,
          content: JSON.stringify(report, null, 2),
        },
        {
          path: `drift-reports/${report.connectorId}/latest-fingerprint.json`,
          content: JSON.stringify(report.current, null, 2),
        },
      ],
      labels: [
        'drift-alert',
        `severity-${report.severity}`,
        `connector-${report.connectorId}`,
        ...(this.github.defaultLabels ?? []),
      ],
      assignees: this.github.defaultAssignees ?? [],
    };
  }

  private buildPrBody(report: DriftReport): string {
    const lines: string[] = [
      `## API Drift Detected — \`${report.connectorId}\``,
      '',
      `| Field | Value |`,
      `|-------|-------|`,
      `| **Connector** | \`${report.connectorId}\` |`,
      `| **Severity** | **${report.severity.toUpperCase()}** |`,
      `| **Detected at** | ${report.detectedAt} |`,
      `| **Baseline fingerprint** | \`${report.baseline.fingerprint}\` |`,
      `| **Current fingerprint** | \`${report.current.fingerprint}\` |`,
      `| **API version (baseline)** | ${report.baseline.version} |`,
      `| **API version (current)** | ${report.current.version} |`,
      '',
      '## Changes',
      '',
    ];

    if (report.changes.length === 0) {
      lines.push('_No structural changes detected (fingerprint mismatch via metadata)_');
    } else {
      for (const change of report.changes) {
        const icon = change.severity === 'critical' ? '🔴' : change.severity === 'major' ? '🟠' : '🟡';
        lines.push(`- ${icon} **${change.type}** — ${change.description}`);
        if (change.path) lines.push(`  - Path: \`${change.path}\``);
      }
    }

    if (report.evidencePackPath) {
      lines.push('', '## Evidence Pack', '', `Evidence pack stored at: \`${report.evidencePackPath}\``);
    }

    lines.push('', '---', '_Auto-generated by IntegraX connector-watchdog_');
    return lines.join('\n');
  }

  private async getRef(branch: string): Promise<unknown> {
    return githubRequest(`/git/ref/heads/${branch}`, this.github);
  }

  private async createRef(branch: string, sha: string): Promise<unknown> {
    return githubRequest('/git/refs', this.github, {
      method: 'POST',
      body: JSON.stringify({ ref: `refs/heads/${branch}`, sha }),
    });
  }

  private async createOrUpdateFile(
    branch: string,
    path: string,
    content: string,
    _baseSha: string,
  ): Promise<unknown> {
    const encoded = Buffer.from(content, 'utf-8').toString('base64');

    // Try to get existing file SHA
    let existingSha: string | undefined;
    try {
      const existing = await githubRequest(`/contents/${path}?ref=${branch}`, this.github) as { sha?: string };
      existingSha = existing?.sha;
    } catch {
      // File doesn't exist yet
    }

    return githubRequest(`/contents/${path}`, this.github, {
      method: 'PUT',
      body: JSON.stringify({
        message: `chore: update drift report for ${path}`,
        content: encoded,
        branch,
        ...(existingSha ? { sha: existingSha } : {}),
      }),
    });
  }

  private async openPr(payload: PullRequestPayload): Promise<unknown> {
    return githubRequest('/pulls', this.github, {
      method: 'POST',
      body: JSON.stringify({
        title: payload.title,
        body: payload.body,
        head: payload.branch,
        base: payload.baseBranch,
        draft: false,
      }),
    });
  }

  private async addLabels(prNumber: number, labels: string[]): Promise<unknown> {
    return githubRequest(`/issues/${prNumber}/labels`, this.github, {
      method: 'POST',
      body: JSON.stringify({ labels }),
    });
  }

  private async addAssignees(prNumber: number, assignees: string[]): Promise<unknown> {
    return githubRequest(`/issues/${prNumber}/assignees`, this.github, {
      method: 'POST',
      body: JSON.stringify({ assignees }),
    });
  }
}

// ─── Factory ─────────────────────────────────────────────────────────────────

export function createPrService(config: WatchdogConfig): PrService | null {
  if (!config.github) return null;
  return new PrService(config);
}
