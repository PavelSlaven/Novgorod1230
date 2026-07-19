# @rus/contracts

## Purpose
Canonical machine-readable contracts shared across stages and applications.

## Responsibilities
- Schema names for approvals, handoffs, delivery, and public read models.
- Stable digest functions.
- Approval builders and binding validators.
- Stage handoff validators that do not execute game logic.
- P08 target-only spatial-v3 typed-error and fail-closed public-port primitives.

## Non-responsibilities
- No LLM calls.
- No database access.
- No world invention or semantic repair.
- No UI rendering.
- No port implementation, repository access or compatibility fallback.

## Allowed dependencies
- @rus/kernel

## Forbidden dependencies
- apps/*
- legacy/*
- provider SDKs
- database drivers
