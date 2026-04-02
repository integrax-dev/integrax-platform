# ADR-007 - Observability and Confidence Metrics

## Status

Proposed

## Context

IntegraX needs observability that goes beyond runtime health and reflects integration adaptability.

## Decision

Standardize observability around contract health, drift, mapping quality, operator intervention, and confidence evolution.

## Core Metrics

- contract drift rate
- schema volatility index
- connector reliability score
- mapping success rate
- override frequency
- mean time to safe resolution
- confidence evolution

## Consequences

Positive:

- makes the platform explainable and operable
- supports alerting and product dashboards
- creates a measurable feedback loop for platform improvement

Negative:

- requires shared event semantics across modules
- can become noisy if not normalized per tenant and connector
