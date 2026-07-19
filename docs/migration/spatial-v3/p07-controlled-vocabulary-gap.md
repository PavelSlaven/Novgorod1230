# P07 controlled vocabulary gap — resolved historical record

**Current status:** `resolved` on 2026-07-18. This file preserves the prior
hard-block diagnosis; it is not current activation evidence by itself.

## Historical gap

Before the approved resolution bundle, Appendix B used thirteen
`controlled_*` pseudo-types but provided no finite value catalog. In that
state B.0 required `controlled_vocabulary_gap` and Appendix C required a
contract-activation block. No values were invented while this gap was open.

## Current proof

Canonical `spatial_architecture_standard_g0_g6.md` §B.0.1 now pins each of
the thirteen pseudo-types to registry ID, path, version `1.0.0` and exact
per-vocabulary digest. The approved catalog is
`data/contracts/spatial-v3/controlled-vocabularies.v1.json`: 13 closed
vocabularies / 426 values, aggregate digest
`05c51f8def16803c589c3e061653c42104359ed6583ff5c6d47ba86c23d4574a`.
The project integration check verifies every B.0.1 mapping against that
catalog and verifies known, unknown and consumer-allow-list API behavior.

`controlled_vocabulary_gap` remains an active typed error only for a missing
file, digest mismatch, empty set, unmapped pseudo-type or unknown value.

## Source bundle evidence stance

The supplied bundle remains read-only. Current comparison records **15/16
integrity matches**. The sole mismatch is its generated
`artifacts/p07/scripted-audit-report.json`: manifest expected
`a43b38e56661752758ed651db8dfca814c9e201b6aa34cd41f6f0d85f1e995d4`,
while the supplied artifact is
`d7cb79b7e3563fc8d5f37deb6cbe25a2220b02d559a8171f39fe340cf25c259d`.
The bundled amended standard itself matches its manifest. Current acceptance
relies on the verified catalog artifact, B.0.1 mapping and reproducible
in-repository checks—not on a claim that the unchanged delivery manifest
matches all files.
