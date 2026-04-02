# ADR-002 - Multi-Tenancy Model

## Status

Proposed

## Context

IntegraX stores contracts, drift history, mappings, overrides, confidence history, and runtime policy per tenant.

## Decision

Adopt shared infrastructure with strict logical tenant isolation for the first platform version, while preserving a path to stronger isolation for enterprise tiers.

## Consequences

Positive:

- faster to ship
- simpler operations for v1
- enables tenant-aware memory and observability early

Negative:

- requires rigorous access-control and policy enforcement
- future enterprise isolation needs must be designed in from day one

## Follow-up

- define tenant-aware persistence conventions
- define per-tenant secrets model
- define isolation rules for observability and approvals
