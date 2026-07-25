# PR8 target functional exact-head validation

## Subject

```text
repository: PavelSlaven/Novgorod1230
pull request: 8
branch: codex/pr8-travel-system
base: ef490ecd8cf91f9e07531fc5d56b2abd7b044c41
subject: 5c35975fafdf001236e861d84b0d546f2bd1ee2d
tree: 3043cf2008bd558b90920e703b9d6ea72bbb9d24
candidate kind: target/shadow functional
```

This package validates only the exact subject above. It does not rewrite or
reuse the immutable historical PR19/P28 evidence and does not authorize a
production database write or composition switch.

## Clean-clone acceptance

The exact subject was cloned with `--no-hardlinks` into a new directory with
no inherited `node_modules`.

- `npm ci`: 91 packages installed, 0 vulnerabilities.
- `npm run docs:generate && git diff --exit-code`: zero tracked diff.
- Repository Intelligence rebuilt the graph for the exact subject with pinned
  Graphify `0.9.17`; status was ready with only the documented RAG semantic
  coverage warning.
- `npm test`: passed. The runtime-catalog PostgreSQL test ran successfully;
  five environment-gated party PostgreSQL cases were covered by the explicit
  sequential Spatial suite.
- `node --test --test-concurrency=1 test/spatial-v3/*.test.js`: 292 passed,
  0 failed, one Windows symlink-capability skip.
- Explicit local Chrome E2E: 1 passed, 0 failed, 0 skipped.
- Generated output and final clean-clone worktree were clean.

The Spatial suite includes isolated PostgreSQL import/readback, migration
ordering, atomic rollback, concurrency, first-entry, Temporal,
perception/reaction/knowledge, save/replay and visible-package checks. No
operator or production database was used.

## Approval and evidence boundary

The P12 dependency-closure regeneration changed technical repository anchors
and derived digests only; semantic-tamper tests remain fail-closed, so no new
semantic approval was asserted for unchanged P12 meaning. Temporal approved
families and the NPC reaction policy changed content and therefore use their
new source-backed decisions, provenance, exact import/readback and 13/13
readiness proof.

Historical `release-evidence.v1.json` and its P28 subject remain immutable.
They are not evidence for this candidate.

## Independent audit

The independent critic rechecked the exact committed subject after the final
generated-digest correction and returned `PASS WITH NOTES`, with no open
P0/P1/P2 finding. The note is a release-boundary statement: this is accepted
target/shadow evidence, not the later production cutover.

## Production boundary

At the subject:

```text
production owner: production_v2
target production writes: false
dual write: false
mixed authoritative read: false
v3-to-v2 runtime fallback: false
versioned production activation cutover performed: false
```

The v3 sole-owner root remains an internal test harness. Config and loader
accept only `builtin:production`; inactive built-ins and direct module paths
are rejected. Production migration loading remains `001_party_runtime.sql`
only.
