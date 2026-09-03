# PR92 Grounding / Open-world / Materialization / Persistence / NPC-mind audit

**Verdict: PASS.** P0/P1 не обнаружены. Ранее блокировавшие G-01 и G-02
закрыты либо сняты после сверки с точным contract. Production-код не менялся.

## Standard and checked runtime

- Сверены [implementation plan](C:/Users/Slaven/Downloads/World_Knowledge_Platform_PR92_IMPLEMENTATION_PLAN.md#L1226)
  §14.2--14.3 и [implementation contract](C:/Users/Slaven/Downloads/World_Knowledge_Platform_implementation_contract_PR92.md#L1863)
  §53--54: planner не назначает time/place/identity/state; orchestrator
  добавляет authoritative context после planning.
- Inspected active production composition: scenario bundle supplies the pinned
  calendar profile to W/K ([composition](../../../../../apps/game-server/src/composition/production-spatial-v3.js#L83)); release becomes active only after exact committed activation readback
  ([activation owner](../../../../../apps/game-server/src/composition/production-v2-activation-state.js#L3)).
- Tests run: 64 focused W/K, S1, N1 and ordinary-materialization tests; all
  passed. `git diff --no-index --check` passed for this audit file.

## Resolved blockers

| ID | Previous result | Current verdict | Evidence |
| --- | --- | --- | --- |
| G-01 | P1: static `1230` / regional context | **RESOLVED** | Grounder now derives year from the current safe clock through the pinned `projectCalendar`, and merges safe position plus explicit owner-supplied refs ([context projection](../../../../../apps/game-server/src/runtime/world-knowledge-grounding.js#L219)). S1 supplies its current safe clock and exact target/envelope place refs ([S1](../../../../../apps/game-server/src/runtime/releases/lower-dvina-trace-s1-production.js#L63)); N1 supplies its visible safe clock and materialized NPC location ([N1](../../../../../apps/game-server/src/runtime/releases/lower-dvina-trace-n1-production.js#L76)). Focused regression test proves year `1231`, current G5/location refs and exclusion of hostile actor data. |
| G-02 | P1: required plan factual-premise validator | **NOT A DEFECT** | Exact contract does **not** require `factual_premise_refs` in public semantic plans. Strict semantic DTOs prohibit authoritative facts/state; existing domain owners revalidate and commit exact mechanics/state. Grounder traces `request_identity`, planner use and selected slice claim refs ([diagnostics](../../../../../apps/game-server/src/runtime/world-knowledge-grounding.js#L109)), while same bounded applicable slice is injected into the semantic call ([grounder](../../../../../apps/game-server/src/runtime/world-knowledge-grounding.js#L77)). Prompt closure is composition rule, not replacement for owner validation. A content validator here would require a second semantic judge or closed factual whitelist, neither prescribed by contract and both contrary to the open-world boundary. |

## Passed controls

| Area | PASS evidence |
| --- | --- |
| Player free turn / single semantic path | Player model grounds its existing request, then invokes existing `turn_step` model; grounder returns factual context, never a game plan ([phase-2](../../../../../apps/game-server/src/runtime/lower-dvina-trace-phase-2-llm.js#L37)). No parallel planner/resolver found. |
| Authoritative context and safe facets | `authoritativeContextOf()` derives time/place from safe request and explicit owner projection; `actorFacetsOf()` no longer falls back to `request.actor` ([grounder](../../../../../apps/game-server/src/runtime/world-knowledge-grounding.js#L205)). |
| Retrieval resilience and trace | Vector/encoder failure yields structured lexical resolution, not an invented fact or runtime outage ([grounder](../../../../../apps/game-server/src/runtime/world-knowledge-grounding.js#L87)). Diagnostics link request identity, planner use and selected applicable claim refs. Regression test passed. |
| Authority envelope / desire is not evidence | S1 explicitly says actor wording is not evidence and forbids identity, people, ownership, routes, topology, mechanics and hidden/authoritative facts ([S1 DTO boundary](../../../../../packages/turn/src/spatial-semantic-remainder.js#L33)). W/K closure says compatibility is never present committed state ([closure](../../../../../apps/game-server/src/runtime/world-knowledge-grounding.js#L130)). |
| S1 materialization and persistence | Resolver gives W/K only a bounded semantic descriptor request; materializer writes via existing atomic owner. Committed local resolution is replayed before model call ([S1](../../../../../apps/game-server/src/runtime/releases/lower-dvina-trace-s1-production.js#L42)). Tests passed for safe projection, ambiguity rejection, replay and local movement without rematerialization. |
| N1 mind boundary | N1 only applies to one visible, already materialized background NPC with schedule/profile evidence; committed remainder replays before model ([N1](../../../../../apps/game-server/src/runtime/releases/lower-dvina-trace-n1-production.js#L28)). It supplies bounded observable context plus safe clock/location to W/K. Tests passed for no invented activity, proposal audit and same factual slice to proposal/audit. |
| Ordinary materialization | `preflight()` returns `already_resolved` for known candidate ([presence owner](../../../../../packages/turn/src/ordinary-materialization-presence.js#L48)); focused tests passed for no reroll, causal basis/placement/mechanics bounds and rejection of hidden/historical/significant truth. General compatibility remains distinct from presence. |
| NPC conversation/autonomous decisions | Production bindings route W/K to NPC semantic/autonomous paths. Their semantic prompts limit W/K to factual context; operation construction, exact checks, consequences and commits remain existing code owners. No hidden-state bypass found in inspected safe projections. |
| Open-world / unseen case | Inspected S1, N1 and ordinary owners accept bounded generic semantic remainder rather than a name/action whitelist. No special production branch for a named occupation/object was found. Existing envelope and owner constraints, not a closed action list, govern admissibility. |

## Non-blocking limits

| ID | Severity | Limit |
| --- | --- | --- |
| G-03 | P2 | Production grounder currently uses planner for every active covered-purpose lookup ([grounder](../../../../../apps/game-server/src/runtime/world-knowledge-grounding.js#L27)); it has not yet selected `NONE` / exact-direct fast paths exposed by `@rus/turn`. This is cost/contract-completeness follow-up, not grounding or authority failure. |
| G-04 | P3 | N1 proves safe semantic remainder for an existing NPC, not broader NPC creation. That is an intentional current scope boundary, not fabricated presence. |

## Gate decision

Grounding/open-world/materialization/persistence/NPC-mind gate: **PASS**.
Code remains owner of committed presence, mechanics, revalidation and atomic
write state; W/K is bounded factual compatibility context. Typicality and
player/NPC desire do not become evidence of pre-existing world state.

## Verification record

`node --test` focused set: 64 pass, 0 fail. Included server W/K grounding,
`@rus/turn` grounding/core, W/K pack, S1/N1, spatial remainder and ordinary
presence/seed tests. `git diff --no-index --check -- /dev/null
data/world-catalogs/novgorod/world-knowledge/audits/final-grounding.md`:
passed.
