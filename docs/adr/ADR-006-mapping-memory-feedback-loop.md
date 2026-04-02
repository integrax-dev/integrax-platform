# ADR-006 - Mapping Memory and Operator Feedback Loop

## Status

Proposed

## Context

IntegraX becomes more valuable when operator decisions, false positives, false negatives, and contract patches are persisted and reused per tenant.

## Decision

Introduce a first-class learning loop centered on mapping memory, operator overrides, confidence evolution, and tenant-aware feedback reuse.

## Stored Signals

- accepted mappings
- rejected mappings
- false positives
- false negatives
- contract patches
- tenant-specific exceptions
- confidence history

## Consequences

Positive:

- turns one-off reviews into reusable operational memory
- reduces repeated human effort
- improves explainability and trust

Negative:

- memory authority thresholds must be tuned carefully
- stale memory can bias decisions if decay and validation are weak
