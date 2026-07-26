# Independent critic — Lower Dvina first playable v2

## Verdict

`PASS`

This is the required repeat independent review after the four blocking findings
of the prior critic report. All four are closed in the current worktree. The
candidate is eligible for the remaining merge, authorized production-cutover,
and production-smoke gates; it is not itself evidence that those later
operational gates have already happened.

## Scope and evidence

- Repository: `PavelSlaven/Novgorod1230`
- Worktree: `C:\tmp\Novgorod-lower-dvina-first-playable-v2`
- Reviewed branch: `codex/lower-dvina-first-playable-v2`
- Reviewed base and updated `origin/main`:
  `d4be6a6014b80ceae937b3900dad6cbe7c1e787d`
- Graphify: `0.9.17`, exact-head graph is `ready`.
- Repository intelligence was queried for release activation, P16,
  ResourceBinding, ActivityProfile snapshots and exact pins. The normative RAG
  service has its declared `KNOWLEDGE_SOURCE_DEGRADED` coverage warning; the
  applicable spatial and temporal norms were read directly as required.

The review is limited to the corrected B1–B4 paths, associated data/runtime
contracts and the local-scene acceptance boundary. No operator or production
database was modified by this critic.

## Re-run checks

The following checks were re-run and passed in this exact worktree:

```text
git fetch --prune origin
git diff --check
npm run repo-intel:status
npm run repo-intel:query -- --query "Lower Dvina first playable release activation P16 resource binding ActivityProfile snapshot exact pins"
node --test test/spatial-v3/pr8-production-v3-composition.test.js
npm run lower-dvina:first-playable:test-runtime-postgres
npm run lower-dvina:first-playable:test-p16
npm run lower-dvina:first-playable:test-party-postgres
npm run lower-dvina:first-playable:test-world-v2-postgres
npm run lower-dvina:first-playable:validate-world-v2
npm run lower-dvina:first-playable:test-readiness
npm run docs:check
```

The executor also supplied passing evidence for the final `npm test`, the
activation PostgreSQL path, and the real browser-harness local-scene/restart
flow. This critic re-ran the direct contract and PostgreSQL regressions that
cover the four corrected blockers rather than treating narrative evidence as a
substitute for them.

## Closed findings

### B1 — Activation state is now derived from exact readback

[`production-spatial-v3.js`](../../../apps/game-server/src/composition/production-spatial-v3.js)
now keeps `SPATIAL_V3_PRODUCTION_RELEASE` as
`validated_candidate_not_active`, with both activation flags false. The new
[`production-v2-activation-state.js`](../../../apps/game-server/src/composition/production-v2-activation-state.js)
derives an active release only after the loaded runtime-catalog pin proves the
exact candidate world revision, world digest, runtime contract and non-empty
activation event. Otherwise startup fails closed with
`SPATIAL_V3_RELEASE_NOT_ACTIVATED`.

The production composition test explicitly verifies that v2 remains a
candidate until exact activation readback. Health then reads the derived active
release rather than a static active constant. This closes the prior false
activation claim.

### B2 — Supported turn writes now use the injected P16 committer

[`first-playable-public-runtime.js`](../../../apps/game-server/src/runtime/first-playable-public-runtime.js)
requires an injected `committer.commit()` and compiles every supported turn
into `buildFirstPlayableTurnPlan()`. The release binding passes the same P16
committer used by the technical composition.

The new first-playable plan modules seal write sets, physical identities,
idempotency, visible-package persistence, parent ordering and expected state
versions. The committer locks and rechecks before applying ordered writes in a
single transaction. The runtime PostgreSQL regression proves that each
non-new-game turn has a nonempty expected-version set and a write-plan digest,
and that a stale CAS failure leaves snapshots, visible packages and change sets
unchanged.

### B3 — Required rope tool is checked before execution and again at commit

The net-work command now rejects unless the player remains owner and the
fisherman is both holder and controller. The P16 plan adds a sealed
`resource_binding` recheck with the expected control state version. The commit
recheck locks and verifies owner, holder and controller; the completion write
returns holder/controller to the owner in the same successful terminal commit,
while owner remains unchanged. The ResourceBinding remains
`binding_kind=required_tool` with the approved return policy reference.

The PostgreSQL runtime regression covers both direct work without the required
handoff and a stale changed-holder failure. Both block before activity evidence
or state mutation; the successful give/work flow preserves owner and returns
temporary control correctly.

### B4 — Conversation stores the exact resolved ActivityProfile snapshot

Conversation now shares `timedActivityRows()` with every other supported timed
activity. The persisted activity snapshot contains the full resolved profile,
its canonical digest, the single-approved-profile applicability result and
sealed dependency pins. The conversation test reads the database row and
compares its resolved profile to the approved profile used by the resolver.
There is no longer a literal partial conversation-profile snapshot or a
hard-coded policy pin standing in for resolution.

## Historical, data and gameplay review

No historical contradiction was found in the bounded late-summer local scene.
The approved role/occupation evidence, Stage 3C item/container promotion,
source hashes, candidate-set digests and source-bound profile constraints are
present. Player and fisherman tuples remain non-empty.

World-v2 compilation and transactional disposable PostgreSQL import pass.
Schema 19 and party migration 011 remain append-only and their focused
PostgreSQL checks pass. The release pin and runtime-catalog checks use exact
world/catalog/dependency pins; no latest lookup or fallback was introduced.

The local scene provides observation, safe and non-fatal risky movement,
conversation, water collection, net work, carrier handoff, rest and save.
The risk check is request-bound and idempotent. The staging boundary is still
intentionally non-executable: its typed approved segment/check/risk/consequence
gaps remain fail-closed, do not block `local_scene`, and have not been repaired
by LLM or implicit authoring.

## Remaining operational gates (not critic findings)

Before the milestone can be declared operationally complete, execute the
already-authorized sequence from a clean merged canonical `main`:

1. run the exact production operator against the approved fresh first-launch
   world and party databases;
2. retain its immutable readback evidence and activate the derived release;
3. create the first production party and run the real browser production smoke,
   including save and restart/resume;
4. record the resulting active status and exact pins.

These are required deployment/acceptance actions, not a code or authoring gap
in this candidate. Boundary crossing remains conditional on its separately
approved physical policies.
