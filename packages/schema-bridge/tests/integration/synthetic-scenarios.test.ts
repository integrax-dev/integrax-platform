import { describe, expect, it } from 'vitest';
import { SchemaBridge } from '../../src/bridge.js';
import {
  adversarialSyntheticScenarios,
  positiveSyntheticScenarios,
} from '../fixtures/synthetic-scenarios.js';

const bridge = new SchemaBridge({
  autoAcceptThreshold: 0.88,
  decisionPolicy: { autoAcceptThreshold: 0.88 },
});

type Report = Awaited<ReturnType<typeof bridge.compare>>;

function hasRename(report: Report, pathA: string, pathB: string): boolean {
  return report.mappings.some(
    mapping => mapping.transform.kind === 'rename' && mapping.pathA === pathA && mapping.pathB === pathB,
  );
}

describe('Synthetic Scenario Library - positive mappings', () => {
  for (const scenario of positiveSyntheticScenarios) {
    it(`maps ${scenario.key} without LLM escalation`, async () => {
      const report = await bridge.compare({
        connectorAId: scenario.connectorAId,
        connectorBId: scenario.connectorBId,
        samplesA: scenario.samplesA,
        samplesB: scenario.samplesB,
      });

      for (const [pathA, pathB] of scenario.requiredMappings) {
        expect(
          hasRename(report, pathA, pathB),
          `Expected mapping ${pathA} -> ${pathB} in ${scenario.key}`,
        ).toBe(true);
      }

      for (const pathA of scenario.forbiddenSources ?? []) {
        expect(
          report.mappings.some(mapping => mapping.pathA === pathA),
          `Did not expect source ${pathA} to be mapped in ${scenario.key}`,
        ).toBe(false);
      }

      expect(
        report.requirementsReport.llmEscalations,
        `Unexpected LLM escalations in ${scenario.key}`,
      ).toHaveLength(scenario.allowedLlmEscalations ?? 0);
    });
  }
});

describe('Synthetic Scenario Library - adversarial protections', () => {
  for (const scenario of adversarialSyntheticScenarios) {
    it(`guards ${scenario.key} against false positives`, async () => {
      const report = await bridge.compare({
        connectorAId: scenario.connectorAId,
        connectorBId: scenario.connectorBId,
        samplesA: scenario.samplesA,
        samplesB: scenario.samplesB,
      });

      for (const [pathA, pathB] of scenario.requiredMappings ?? []) {
        expect(
          hasRename(report, pathA, pathB),
          `Expected defensive scenario ${scenario.key} to keep valid mapping ${pathA} -> ${pathB}`,
        ).toBe(true);
      }

      for (const [pathA, pathB] of scenario.forbiddenMappings ?? []) {
        expect(
          hasRename(report, pathA, pathB),
          `Scenario ${scenario.key} should not auto-map ${pathA} -> ${pathB}`,
        ).toBe(false);
      }

      for (const pathA of scenario.forbiddenSources ?? []) {
        expect(
          report.mappings.some(mapping => mapping.pathA === pathA),
          `Scenario ${scenario.key} should not map source ${pathA}`,
        ).toBe(false);
      }
    });
  }
});
