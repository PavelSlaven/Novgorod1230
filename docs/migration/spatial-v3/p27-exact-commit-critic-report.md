# P27 exact-commit critic report

## Verdict

**PASS WITH NOTES** for subject commit `45b4b9697663426a9543cd959bc927081334da5c` on branch `codex/spatial-architecture-g0-g6-v4-2`.

The exact committed tree passed clean-checkout reproducibility, the full project suite, real Chrome E2E, the complete isolated spatial PostgreSQL matrix, and the five opt-in party-runtime PostgreSQL tests. The approved P12 projection is complete and contains no unresolved authoring gaps. This report does not authorize production activation: it is not a signed P27 release object for the current evidence commit, no exact P28 candidate signature or release-authority decision exists, and v2 remains the only production composition.

## Subject and clean checkout

- Remote branch and both isolated witnesses resolved to exact SHA `45b4b9697663426a9543cd959bc927081334da5c`.
- The primary witness was a clean detached worktree. The immutable V1.1 branch-binding gate correctly rejected detached HEAD because it has no branch name.
- The branch-bound witness was a fresh clone of `origin/codex/spatial-architecture-g0-g6-v4-2` at the same exact SHA. Its P12/V1.1 checks and target import passed when invoked through a short `P:\` mapping.
- The short mapping was necessary only for Git history reads: Git for Windows returned `Filename too long` for two historical ZIP paths from the long temporary checkout path. The tree and commit were unchanged.
- Repository Intelligence rebuilt successfully against the exact SHA with Graphify `0.9.17`. Knowledge-source status remained `degraded` for documented semantic-coverage warnings, with no blocker document IDs; `knowledge:check-corpus` and `knowledge:check` passed.

## CI and local release matrix

- Hosted CI was independently verified with `gh pr checks` for PR 14: `clean-clone-generation-test` passed in 2m41s for the remote branch at the exact subject SHA. Job: <https://github.com/PavelSlaven/Novgorod1230/actions/runs/29852276651/job/88707857078>.
- `npm ci` passed with zero reported vulnerabilities.
- `npm test` passed. Its real Chrome E2E used `RUS_CHROMIUM_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe`; the explicit browser rerun passed 1/1.
- P12 target compilation passed 16/16, V1.1 unit/equivalence passed 9 with one Windows symlink-capability skip, and the isolated P12 PostgreSQL target import passed with exact readback: 276 nodes, 358 source pairs, 86 routes, 86 segments, 172 endpoints and 3,249 dependency edges.
- The isolated spatial PostgreSQL matrix passed P13, P14, P15, P16 persistence, P16 committer, P23 domain concurrency twice, P24 party migration, P24 world migration and the full P25 compatibility/cutover suite (8/8).
- A separate explicit `PARTY_DATABASE_URL` container ran all five opt-in `party-runtime-v2-postgres` tests: 5/5 passed, zero skipped. It covered baseline persistence, advisory-lock concurrency, atomic repair/retry, autonomous pins/rollback and atomic turn commit/replay/party-local FKs.
- Documentation, 17-part/186-table schema, schema reference, architecture boundaries, release hygiene, P27 release tests, knowledge corpus and exact-commit Repository Intelligence checks all passed.
- Every PostgreSQL witness used an isolated local `postgres:16-alpine` container. All containers were removed; no operator or production database was opened.

## P12 closure

- `data/world-catalogs/novgorod/spatial-v3/manifest.json` is `approved`, has 37 datasets and zero data gaps. Raw SHA-256: `e3ec8d5feae59a3d069ce7c4444fcb6a5bd7bd3545fa50635664e063a1839741`.
- `docs/migration/spatial-v3/p12-approved-target-projection-critic-report.md` records independent P12 `PASS`. Raw SHA-256: `b54c99d314cb035278bf40178594745a8c28654968b1b0544450e20fe9eec341`.
- Actual source counts equal their approved declarations: 195 canonical G5, 358 physical exit pairs, 600 typed mappings, 17 scene families, 195 profiles and 195 candidates. All four source-data gaps are `resolved_in_package`.

## Raw exact-checkout evidence

External raw logs were retained under `C:\Users\Slaven\Documents\P27-exact-45b4b969-evidence\`. They are evidence inputs, not release-authority objects and are not referenced by the activation manifest.

| Raw log | SHA-256 |
|---|---|
| `01-readiness.log` | `b1432cb1c7a8a0a69c9e3c2b96bb0092e17a72d62bd26de313ac0127364a9d34` |
| `02-npm-ci.log` | `14a606785c6be0fe7c5991c345761df9f4cea83d1b212231a1de0e6a12ca0267` |
| `03-rag-graphify-query.log` | `e076300835919a28d1b2819aea5e799f3aebce97e557ab3bf91c4de42a44b479` |
| `04-repo-intel.log` | `1d87a9d5cb4ea6d37f04f46e4afefcefa7eb6637504ab258e151122870aa4be7` |
| `05-p12-v1_1.log` | `f0e0616967a6028f91ecca1d8bd2d066a3eadffd22774ba6c6015c8d1d60a086` |
| `06-p12-v1_1-separated.log` | `cb497f908b4ac91ba8cce3e6787aafab9e535b57154d9e471fe1cf2248dff3f7` |
| `07-p12-target-postgres.log` | `c4f898acd2195d02af7dd9a24d77c329040feac9e308c0ba187cfa36a77b2363` |
| `08-npm-test.log` | `410077567ef93d705d22e88188f6d18d3a9ceab01e862f075103cdc9295b07f9` |
| `09-release-checks.log` | `e0bac28094b9bf6edaa72fc8fc1d74c8b8c9eabcd2532ab58a47a8683e839749` |
| `10-knowledge-repo-intel.log` | `e474881cd91baa2b6a6419656a19da5dc09d31af2969db1a6e7e6b5d13afcd60` |
| `11-counts-p28.log` | `80d28405008ce14d20067fcb2e3e310ab2b73572793a3651341600858e81101e` |
| `12-branch-witness-clone.log` | `d999cb217d5191ea2133d64b55c5e45480c0d6ef8304fd6c74d8faf22253c33c` |
| `13-branch-witness-p12-postgres.log` | `cbfb4d52fe3406814691bb3cfe14fbfbbf0a717b9e6b1cf565495e04e4f8722f` |
| `14-shortpath-branch-witness.log` | `1fd32879c56fbe7adcc6804b9c19863099705b2cf767482cf5b8deab21f70f05` |
| `15-full-spatial-postgres-matrix.log` | `0dcfb2a43076f39bea2f5518ca10021a62e69d0640a44c35817ebde92dc8358f` |
| `16-p25-full-postgres.log` | `f3a047f3090456a25cac32bc6f130a4e40351bc24d72338d002e551b015f51c6` |
| `17-party-runtime-explicit-postgres.log` | `57fe7644adcb19bf0c62f479f69c2e2a0958a985de05dcff647bb3e88f2782dd` |
| `18-party-runtime-explicit-postgres-realpath.log` | `6a817ad0ac91eb6600e76290ed6f1f2a4547096c0354121d783892a6e6ed3977` |

The first party-runtime attempt through `P:\` intentionally remains in the audit trail: it passed 4/5 and exposed duplicate Node module identities across the substituted and real paths (`TURN_WRITE_PLAN_NOT_CODE_OWNED`). The unchanged checkout rerun from its real path passed 5/5. The canonical external summaries after that rerun have SHA-256 `d5256e4a1813c5973e26c91ec7c21d2293b773d796f6cef350fbd93554650875` (`evidence-summary.md`) and `8d5210f30d0bd17df6e26782e7805e147d354a417ddeee923a3962cde052b15c` (`evidence-summary.json`).

## Remaining release blockers

- This tracked report is added after the subject commit and has no independent P27 signature bound to the current evidence commit.
- `activation_candidate_commit`, signed fresh-checkout evidence for that exact candidate, Appendix D passed evidence, the P28 release-authority signature and final manifest signature remain absent.
- P28 remains explicitly blocked and non-mutating. No production write, composition switch, status promotion or activation was performed.
