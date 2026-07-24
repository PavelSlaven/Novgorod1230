# Temporal World v4 returned-data integration audit

## Input

- Archive: `TemporalWorldV4_Data_Authoring_APPROVED_REAUDITED_2026-07-24.zip`
- SHA-256: `e8dc8df17213125fe07a724b2c3014f771def221e3f2be86368ac4dbb0482f3c`
- Audit date: 2026-07-24
- External package decision:
  `decision:temporal_world_v4_full_package:2026-07-24-reaudit-2`

## Quarantine and integrity result

The archive was inspected before extraction: 261 entries, 4,497,732
uncompressed bytes, no rooted or traversal paths, duplicate entries,
oversized entries, or suspicious compression ratios. All 96 JSON files parse.

The returned root `SHA256SUMS.txt` and `ARCHIVE_MANIFEST.json` are stale
handoff artifacts: the checksum list has 95 missing or mismatched returned
paths, while the manifest describes the original 153-file content set rather
than the 188-file return. They are rejected as integration evidence and were
not copied into the repository.

This outer-package defect does not substitute for, or invalidate, the
source-level audit. Every integrated source byte was independently hashed
against its family source-history row; all family decisions were checked
against exact record and source identifier sets.

## Accepted scope

- 13 required data families;
- 21 approved authoring records;
- 21 normalized physical references;
- 13 provenance records;
- 46 source-history records;
- zero data gaps, draft markers, fallback values, or unresolved developer
  table bindings.

The 1,461-row 1230–1233 daylight derivation was independently replayed and
matched the returned dataset exactly. Repository-backed sources were compared
with their exact repository bytes.

## Developer-owned integration

The developer completed the responsibilities intentionally left outside the
external authoring package:

- physical binding to `world_base.temporal_authoring_records`;
- append-only four-table DDL in `infra/world-base/schema/18.sql`;
- deterministic, advisory-locked and idempotent importer;
- exact artifact and external-decision SHA-256 binding in 13 approval
  manifests;
- generated 190-table schema reference;
- fail-closed readiness verification and real isolated PostgreSQL acceptance.

The canonical repository evidence is the integrated files and their approval
manifests. No claim relies on the rejected stale outer checksum or manifest.
