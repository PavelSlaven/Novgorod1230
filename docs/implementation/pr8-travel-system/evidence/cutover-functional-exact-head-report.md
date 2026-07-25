# PR8 production cutover functional exact-head validation

## Exact subject

```text
repository: PavelSlaven/Novgorod1230
pull request: 8
branch: codex/pr8-travel-system
base: bfa24bf7810146c37e461d6dc689b8f7450bd8b8
subject: 52b60422e8a5e6165ddc88d1a3ab8ac743959c70
tree: 88a92076289b3d3fb9bf5e969768c1ecb0b7e359
candidate kind: production activation cutover
release: spatial-v3-production-v1
composition: builtin:production-spatial-v3
```

This package admits only the exact functional subject above. The evidence
commit is a direct child and contains no runtime, contract, DDL, authoring or
generated change. Historical PR19/P28 evidence and the earlier target/shadow
evidence remain immutable and are not redeclared for this subject.

## Production boundary

The subject completes the versioned production activation cutover in the
versioned application composition:

```text
production owner: production_v3
authoritative reads: spatial_v3_only
authoritative writes: spatial_v3_only
dual write: false
mixed authoritative read: false
v3-to-v2 runtime fallback: false
rollback runtime selectable: false
```

The production loader accepts only the built-in v3 composition. Runtime v2
entry points are absent; v2 remains available only as explicit
migration/rollback-source data and test tooling. The release identity binds
the Temporal amendment, Spatial contract, world tuple, compatible-world
manifest, party migration fingerprint and independently fixed target
migration-chain digest.

## Runtime-catalog activation safety

The runtime reads the raw latest append-only activation event while holding the
same world advisory lock used by the operator writer. It chooses the raw latest
event before any approved revision/import joins; a corrupt latest event
therefore blocks startup and cannot fall back to an earlier event. The lock is
held through target migrations, party readiness and party `COMMIT`.

New parties resolve the current approved activation. Existing parties retain
their exact persisted historical activation pin, which is validated against
its immutable approved event and complete revision/import tuple.

## Exact-head validation

- Clean install: 91 packages, zero vulnerabilities.
- Full root suite: passed.
- Full sequential Spatial/Temporal suite: 298 total, 297 passed, zero failed,
  one Windows symlink-capability skip.
- Fresh PostgreSQL 16 production-cutover lifecycle: 1 passed, including target
  migrations `001..010`, historical pin recovery, activation-lock race,
  complete approved tuple and corrupt-latest fail-closed.
- Real local Chrome E2E: 1 passed, zero skipped.
- Generated documentation reproducibility: zero tracked diff.
- Documentation/current-status checks: three consecutive passes, zero
  activation-boundary findings.
- Architecture boundaries: passed.
- Repository Intelligence: 17/17; Graphify `0.9.17` ready at the exact subject.
  Normative RAG reported only its documented degraded semantic-coverage
  warning.
- `git diff --check` and clean-worktree checks: passed.

All PostgreSQL validation used disposable isolated containers. No operator or
production database was read or modified.

## Independent audit

The independent critic audited the exact functional subject after the
latest-event-first correction and returned `PASS WITH NOTES`. Standards and
Spec sub-audits both returned `PASS`; there were no blocking findings. The
sole note was that this direct evidence-only child still had to be created,
which this package now satisfies.
