import type { TrustScore, AuthoritySuggestion } from './types.js';

const TRUST_THRESHOLD_AUTO = 0.85;
const TRUST_THRESHOLD_PREFER = 0.65;
const MIN_SAMPLES = 20;

/**
 * Suggests an authority mode based on trust scores for a connector pair.
 * Suggestions always require human approval before activation.
 */
export function suggestAuthority(
  scoreA: TrustScore,
  scoreB: TrustScore,
): AuthoritySuggestion {
  const totalSamples = scoreA.acceptedCount + scoreA.rejectedCount + scoreB.acceptedCount + scoreB.rejectedCount;

  if (totalSamples < MIN_SAMPLES) {
    return {
      suggestedMode: 'observe_only',
      confidence: 0,
      reasoning: `Not enough signal yet (${totalSamples}/${MIN_SAMPLES} samples). Continue in observe_only mode.`,
      requiresApproval: true,
    };
  }

  const diff = Math.abs(scoreA.score - scoreB.score);
  const highScore = Math.max(scoreA.score, scoreB.score);
  const highConnector = scoreA.score >= scoreB.score ? scoreA.connectorId : scoreB.connectorId;

  if (highScore >= TRUST_THRESHOLD_AUTO && diff > 0.2) {
    return {
      suggestedMode: 'auto_accept',
      suggestedAuthorityConnector: highConnector,
      confidence: highScore,
      reasoning: `${highConnector} has strong trust score (${highScore.toFixed(2)}) with clear separation from the other connector. Auto-accept is safe but requires approval.`,
      requiresApproval: true,
    };
  }

  if (highScore >= TRUST_THRESHOLD_PREFER && diff > 0.1) {
    return {
      suggestedMode: diff > 0.3 ? 'prefer_a' : 'suggest',
      suggestedAuthorityConnector: highConnector,
      confidence: highScore,
      reasoning: `${highConnector} consistently scores higher (${highScore.toFixed(2)} vs ${Math.min(scoreA.score, scoreB.score).toFixed(2)}). Suggest preferring it as authority.`,
      requiresApproval: true,
    };
  }

  return {
    suggestedMode: 'suggest',
    confidence: highScore,
    reasoning: 'No connector shows clear superiority. Human-assisted suggestion mode is recommended.',
    requiresApproval: true,
  };
}
