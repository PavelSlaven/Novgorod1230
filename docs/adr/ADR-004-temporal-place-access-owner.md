# ADR-004: Temporal place and access owner

- Status: accepted
- Date: 2026-07-23
- Decision scope: target architecture; no production activation before P28.

## Decision

Do not create a second place or access engine. Extend `@rus/turn` for code-owned availability and consequence orchestration, and `@rus/party-store` for normalized placement, capacity, ownership, holder, controller and access validation. The target spatial-v3 boundary is `@rus/party-store/spatial-v3-domain-integration`; it remains target-only until P28.

Public turn input is the frozen turn context with `{ current_position, actor, target, access_context, catalog_pins }`; public output is an availability/consequence package or a typed gap. The party-store target input is a frozen placement/control snapshot and approved mutation; its output is validation or an atomic commit proposal. Allowed dependencies are existing `@rus/turn`, `@rus/party-store`, `@rus/contracts` and `@rus/kernel` boundaries. No place/access owner may call a database, network, LLM, narrator or UI directly.

Profiles and data are read-only `world_base` G4/G5 templates, slot rules, access policies and property profiles. Required absent or ambiguous candidates return typed gaps; semantic fallback is forbidden. Persist approved changes only through `@rus/turn` and `CombinedAtomicCommitter`, never from an availability validator or materializer.

## Rollback

Before P28, target validation is shadow-only and production v2 remains authoritative. Rollback discards the target proposal before commit; after activation it requires the approved reverse migration or snapshot restoration, never dual write or an in-turn v2 fallback.
