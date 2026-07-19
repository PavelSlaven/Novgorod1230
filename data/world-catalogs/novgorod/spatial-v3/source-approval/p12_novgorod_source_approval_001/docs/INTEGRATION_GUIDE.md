# Integration guide

## Required order

1. Copy this archive into the existing spatial-v3 branch without changing its source files.
2. Verify all source and package digests from `manifest.json`.
3. Run `python scripts/validate_bundle.py`.
4. Adapt the source catalogues to the exact P12 importer contracts already implemented in the branch. Do not bypass contract validators or write directly to production tables.
5. Run importer dry-run against an isolated staging database.
6. Verify one-to-one coverage, FK/dependency resolution, route continuity, reverse-direction consistency, scene-profile uniqueness and zero empty candidate sets.
7. Run readback and rollback tests.
8. Run repository intelligence rebuild, targeted tests, full test suite and independent critic.
9. Produce real signed P27 evidence and real fresh-checkout evidence for the exact commit.
10. Only then re-run P28. Until it passes without blocking notes, keep v2 composition and all production writes disabled.

## Import assertions

- 195 canonical G5 records, all with one valid parent G4 and one scene profile;
- 32 target host G4 sectors;
- 600 legacy edge mappings = 242 hierarchy + 358 physical;
- 358 physical pairs = 716 directional traversals after expansion;
- four boundary scenes remain locally valid but outward-route blocked;
- no fallback, default route, guessed endpoint or inferred external boundary;
- no production activation flag in this package.

## Non-transferable evidence

P27 signatures and fresh-checkout evidence are facts about an exact commit, environment and independent signer. Templates are provided only to make the required structure unambiguous. They intentionally fail `verify_evidence.py` until populated by the responsible systems and people.
