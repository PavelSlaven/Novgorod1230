# P12 dependency-closure audit

## Current reapproval status (P09 canonical-grid repair)

Status: **INDEPENDENT REAPPROVAL PASS** for exact subject commit
`8962b543052917193708137f5b4051b85758c701`.

P09 replaced the non-normative `novgorod_g1_cardinal_grid_v1` convention with
the target-standard `grid_east_north_v1` contract. The deterministic P12
dependency-closure generator and its physical import row now use that exact
canonical value. This changes the approved subject tree, so the historical
`69b465f… → 690f850…` closure approval is not reused.

The generated `REAPPROVAL_REQUEST.json` pins the exact changed dataset digest
and records the prior evidence as superseded for this changed subject tree.
`subject-commit-binding.json` raw-byte pins the complete exact subject tree:
the bundle manifest and its digest, every manifest payload file, and the
declared verifier test. Its only permitted post-subject evidence changes are
this independent approval decision and this audit record. A separate
evidence-only commit must be the direct child of the subject commit. The V1.1
repository verifier must still report `materialization_authorized: false`,
`p12_operational_gaps_closed: false`, and `p28_activation: not_authorized`;
production, P28 and spatial runtime v3 remain blocked.

## Scope

Independent review covered the proposed dependency-closure data, target-only
DDL, deterministic V1.1 physical projection, importer, evidence-chain
verification, and isolated PostgreSQL materialization. It did not authorize
P28, production activation, or a v3 runtime owner.

## Data critic

Verdict: **PASS**.

The critic verified the exact source ledger and repository provenance, all 32
explicit conservative G3 classifications, all 57 editorial category rows and
their digest-bound resolvable basis anchors, the complete scene-template
counts, reproducibility, `hard_gap = 0`, and the absence of stronger historical
or production claims.

The first two review cycles returned `CHANGES REQUIRED`: name-derived category
templates were replaced by explicit editorial rows, and ambiguous anchors were
replaced by canonical paths or immutable ZIP members with raw SHA-256 and exact
line ranges, JSON pointers, or full record predicates. The final resolver test
checks all 57 anchors.

## Code critic

Verdict: **PASS**.

The critic verified that both bindings are parsed from their checked Git
objects; subject coverage is complete, unique, path-safe, and raw-byte pinned;
exact-match comparison includes database defaults; the compiler covers the
complete immutable V1.1 contract matrix; and isolated PostgreSQL exercises
fresh DDL, closure and V1.1 imports, readback digest, idempotence, FK negatives,
and rollback.

The original review returned `CHANGES REQUIRED` for worktree/commit binding
TOCTOU, incomplete subject scope, partial-row equality, and an incomplete
PostgreSQL witness. All were corrected. The remaining note concerned the
strength of one mismatch rollback assertion. It was closed before the subject
commit: the test now removes a real early batch row, forces a later canonical
mismatch, and proves unchanged counts and canonical digests for every table in
the import manifest.

## Activation boundary

This audit is target-only. P28 remains blocked, production remains owned by v2,
and no operator or production database was accessed.
