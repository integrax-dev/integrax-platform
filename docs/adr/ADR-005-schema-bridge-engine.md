# ADR-005 - Schema Bridge Engine as Core IP

## Status

Proposed

## Context

Schema comparison alone is not enough. IntegraX needs rename detection, semantic conflict classification, mapping proposals, confidence scoring, and explainability tied to runtime operations.

## Decision

Treat the Schema Bridge Engine as core product IP and keep it independent from workflow-engine implementation details.

## Capabilities

- rename detection
- type conflict detection
- enum drift detection
- optional-to-required detection
- semantic similarity scoring
- mapping suggestions
- confidence scoring
- explainable resolution paths

## Consequences

Positive:

- protects the main differentiator
- enables standalone reuse of the engine
- keeps automation/runtime layers replaceable

Negative:

- demands strong type contracts and test coverage
- requires careful scope control to avoid absorbing unrelated platform logic
