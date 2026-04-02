# ADR-004 - Breaking Change Classification

## Status

Proposed

## Context

IntegraX must classify contract and payload changes consistently across contract intelligence, drift detection, and schema bridge resolution.

## Decision

Adopt a compatibility taxonomy inspired by Buf-style breaking-change categories, adapted for OpenAPI, AsyncAPI, payload drift, and mapping continuity.

## Core Classes

- safe
- suspicious
- review-required
- breaking

## Consequences

Positive:

- consistent policy enforcement
- easier CI and approval integration
- clearer explainability for operators

Negative:

- requires early alignment across modules
- false positives will need operator feedback to refine
