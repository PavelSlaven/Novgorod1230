# P25 compatibility, cutover and rollback — independent final critic report

**Verdict: PASS WITH NOTES**
**Audited subject:** uncommitted P25/P24 repair over `990ece6d67eea7dcde62a824c6d09282f55397bc`
**Scope:** read-only audit; no production activation, migration, or Git action was performed.

## Closure of previous blocking findings

1. The P24 party PostgreSQL witness now passes. `persistCoverageArtifact` serializes its JSONB values correctly and the isolated migration verifies an exact source read, party scope isolation, accepted append-only evidence, dry-run, and rollback on a later target-row failure.
2. The P24 world PostgreSQL witness now supplies the required reviewed scene template, selection and applicability chain. The isolated canonical G0–G5 migration passes with a non-null `applicability_rule_id`.
3. The request-profile boundary is now a separately exported `@rus/turn/spatial-v3-request-profile` module. It requires request-local bindings, an injected P06 guard, explicit v2 and shadow-v3 delegates, and rejects v3 writer-shaped results. `npm run architecture:check` passes.

## P25 evidence verified

- A request has exactly one immutable `(party_id, request_id, profile)` binding. `production_v2` remains the only production owner; `shadow_v3` is no-write and has `activation_permitted: false`.
- The actual request-profile boundary invokes the supplied P06 validator before dispatch. The P06 and P25 static checks pass.
- The shadow runner gives both observers the same frozen clone and produces a deterministic structural report. Unregistered, duplicate, stale, or write-shaped shadow inputs fail closed.
- Constrained cutover reads accepted P24 world and party evidence rows under transactions, rolls them back, and is rehearsal-only. The actual P24 party/world rollback drill also rolls back fixture mutations.
- P28 remains explicitly blocked and non-mutating; this audit did not grant activation authority.

## Commands executed

| Command | Result |
| --- | --- |
| `npm run spatial-v3:check-p24` | PASS |
| `npm run spatial-v3:test-p24` | PASS, 7/7 |
| `npm run spatial-v3:test-p24-postgres` | PASS, isolated PostgreSQL 1/1 |
| `npm run spatial-v3:test-p24-world-postgres` | PASS, isolated PostgreSQL 1/1 |
| `npm run spatial-v3:check-p06` | PASS |
| `npm run spatial-v3:check-p25` | PASS |
| `npm run spatial-v3:test-p25` | PASS, 8/8 including local PostgreSQL P24 evidence rollback drill |
| `npm run spatial-v3:test-p25-postgres` | PASS |
| `npm run architecture:check` | PASS |
| `npm run spatial-v3:check-p28` | PASS; activation remains blocked/non-mutating |
| `git diff --check` (P25/P24 scoped diff) | PASS; unrelated user-owned `AGENTS.md` line-ending noise excluded |

## Notes

- The P25 section in `docs/migration/spatial-v3/README.md` still says `4/4` although the current P25 test file has eight tests. This is evidence-count prose only and does not weaken the passing executable checks; update it during the next documentation regeneration/commit.
- All PostgreSQL checks used ephemeral local Docker databases. No operator or production database was accessed.
