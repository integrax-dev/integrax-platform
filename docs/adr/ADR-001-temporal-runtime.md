# ADR-001 - Temporal as Primary Runtime

## Status

Proposed

## Context

IntegraX needs durable execution, retries, long-running steps, compensation, scheduling, and strong auditability across tenants.

## Decision

Use Temporal as the primary runtime for workflow execution.

## Consequences

Positive:

- avoids building a workflow engine
- strong fit for durable execution and sagas
- improves auditability and operational resilience

Negative:

- introduces platform complexity
- requires a clean adapter layer so Temporal does not leak across the product

## Follow-up

- define workflow registry interface
- define connector execution adapter
- define schema guardrail hooks
