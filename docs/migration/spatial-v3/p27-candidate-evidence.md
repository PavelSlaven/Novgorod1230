# P27 candidate `11c9f0c` — independent review evidence

## Scope and subject binding

This is a non-authoritative P27 review record for exactly
the candidate commit:

```text
candidate_commit: 11c9f0c1de2d510c29be51546d16851f0d719f76
candidate_parent: d28662ed0bae60ad2646eeffa46ce552ff8857ba
branch: codex/spatial-architecture-g0-g6-v4-2
repository: PavelSlaven/Novgorod1230
```

It is not a P28 approval, does not change production composition, does not
authorize an import or a production write. It must be
committed only as referenced evidence in the strict direct-child evidence
commit for the candidate. The earlier P27 report for
`45b4b9697663426a9543cd959bc927081334da5c` is explicitly excluded: it is
evidence only for that older subject tree and cannot establish this candidate.

## Plan-owner process-evidence decision

The plan owner has explicitly accepted the documented process-evidence
exception for this candidate: repository history does not prove that every
historical phase was executed by a distinct subagent in the prescribed order.
That acceptance permits preparation of this candidate-bound evidence package;
it does **not** establish any runtime fact, mark an Appendix D item passed,
replace independent review, or authorize activation. The decision remains a
governance record only and does not alter the requirement for externally held
independent review, fresh-checkout evidence and GitHub release proof.

## Verdict

**PASS** for the exact subject above.

This assessment combines the recorded full acceptance of the preceding
functional tree with focused validation of the later P12 metadata-generator
delta and the final P28 risk-based CI correction. The independent final audit
returned `PASS`. The verdict is limited to the subject tree and its recorded
evidence; it is not P28 authority. P28 authority is exclusively the separately
live-verified GitHub release proof.

## Validation evidence

- The preceding functional candidate passed the recorded spatial, PostgreSQL,
  full-project and real-Chrome acceptance. Later changes are limited to the
  P12 dependency-closure metadata guard, the P28 GitHub release-proof
  corrections and their focused tests, plus README consistency corrections.
- The P12 delta changes no primary source dataset. The approved source-package
  aggregate remains
  `6f9869450605b338cb6c987abe8c1330bcfd1197159f715bfc0d615153271c21`,
  and the approved counts remain `195/358/600/17+195+195`.
- The focused dependency-metadata suite passed `10/10`: a DDL-digest-only update
  preserves the byte-identical approval, while a self-consistent semantic
  payload change demotes the package to `PROPOSED/pending_reapproval` and keeps
  production/P28 blocked. A self-consistent forged approval, manifest entry and
  manifest digest is also rejected because reusable approval bytes must match
  the committed `HEAD` blob. Two generator runs produced the same manifest.
- `npm run spatial-v3:check-p12`, bundle validation,
  `world-db:schema-check` (`186` tables), and
  `world-db:schema-doc-check` (digest
  `fccc625773089749ca676831ee69f8b3656e914f5f0e53cbbfaff8773df905fe`)
  passed for this delta.
- The hosted `clean-clone-generation-test` run `29908936914` passed for exact
  functional candidate `11c9f0c1de2d510c29be51546d16851f0d719f76`.
  It selected the `full` profile and completed clean checkout, PostgreSQL,
  reproducibility, Repository Graph and the full project suite. The direct
  evidence child is restricted to the three candidate-owned evidence paths
  and therefore receives only P28 local-evidence and documentation checks.
  Its exact-head result remains live-verified by the P28 GitHub adapter.
- Repository readiness was checked after `git fetch --prune origin`; Graphify
  is `0.9.17`. Repository Intelligence and Graphify were refreshed after the
  indexed P12/README changes. The known knowledge-source semantic-coverage
  warning remains non-blocking.
- The matching RAG and Graphify query was `P27 exact candidate independent
  critic evidence report activation candidate 80ae GitHub release proof`.
- The prior functional acceptance `npm test` passed. Its default browser job
  reported one skip because
  `RUS_CHROMIUM_PATH` was unset; the actual browser witness was then rerun as
  `RUS_CHROMIUM_PATH='C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  npm run test:browser-e2e` and passed `1/1`.
- In that acceptance, `npm run docs:check`, `npm run architecture:check`,
  `npm run knowledge:check-corpus`, and `npm run knowledge:check` passed.
  The corpus check reported `35` documents and the generated knowledge graph
  and RAG current.
- `npm run spatial-v3:test-p27-release` passed `2/2`; `npm run release:check`
  passed. `npm run spatial-v3:test-p12` passed `16/16`, and
  `npm run spatial-v3:check-p12` accepted the approved root authoring manifest:
  `37` datasets, `data_gaps: []`, `195` canonical G5 records, `358` physical
  exit pairs, `600` typed mappings, `17` scene families, `195` profiles and
  `195` candidates.
- P28 remains a deferred fail-closed gate until GitHub has an exact approval,
  successful manifest-pinned check and accepted completion proof; it reports
  zero production writes and no composition change.
- In that acceptance, isolated local PostgreSQL checks passed for P09, P10,
  P11, P12, P13, P14,
  P15, P16 persistence, P16 committer, P23, P24 party migration, P24 world
  migration and P25. They use repository-created local test databases only;
  no operator or production database was opened.

## P23 startup note

During the serial PostgreSQL matrix, the first P23 invocation stopped before
migration/setup because `docker run` returned status `125`. No stale
`p23-domain-*` container was present; a separate `docker run --rm hello-world`
confirmed the daemon. The immediate rerun
`npm run spatial-v3:test-p23-postgres` passed `1/1`. This is recorded as a
Docker startup flake, not a waived test failure. A future evidence operator
must retain the exact command log and rerun rather than treating a status `125`
as a successful P23 result.

## Remaining P28 blockers

The strict direct-child manifest and ledger record all `58` Appendix D entries
as locally passed by this single final audit. The approved P12 compilation has
zero remaining source/target gaps. P28 nevertheless remains fail-closed because
PR #14 is draft and lacks exact-head GitHub approval and merge/tag completion.
The live required check is the only fresh-checkout authority; no duplicate
fresh-checkout attestation exists. V2 remains the sole production composition.

## P28 authority boundary

This report remains hash-bound independent-review evidence only. Once the
strict direct-child evidence commit is pushed, the P28 gate itself must live
verify the configured GitHub repository and PR: exact evidence head, exact
commit approval, manifest-versioned successful check and canonical-main merge
or locally verified signed-tag completion. No external authority route can supplement or
replace that proof.
