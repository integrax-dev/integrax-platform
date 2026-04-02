# ADR-003 - Connector SDK Design

## Status

Proposed

## Context

IntegraX needs a connector system that is fast to extend, easy to test, and stable enough for marketplace and embeddable use cases.

## Decision

Design a TypeScript-first SDK inspired by Airbyte's declarative connector modeling and Activepieces' package-based DX.

## Target Surface

```ts
defineConnector()
defineAuth()
defineActions()
defineTriggers()
defineSchemas()
definePagination()
defineRateLimits()
defineMappings()
defineErrors()
```

## Consequences

Positive:

- faster internal connector delivery
- easier external contribution model
- aligns with embeddable/self-host strategy

Negative:

- requires discipline to keep the SDK compact
- declarative and imperative layers must remain coherent
