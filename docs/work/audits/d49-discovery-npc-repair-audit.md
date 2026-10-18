# Immutable patch Contract Audit: discovery and NPC semantic repair

**Prepared:** 2026-10-18. Read-only audit. **Scope:** two isolated, immutable patches only. This is not a D49/live acceptance report.

## Discovery repair

CONTRACT AUDIT FINDING

- `audited_head`: `11d25b7c56064520a1a8c612db3efe3629e7a6aa` (clean).
- `scope`: `packages/turn/src/turn-step-plan-repair.js` and production route regression in `apps/game-server/test/lower-dvina-trace-turn-step-llm-repair.test.js`.
- `source_set`: governing `AGENTS.md` and routed workflow/audit rules; `CONTRACT_INDEX.md` §§1–3.1, §8.1, relevant status/scope rows; ACTIVE `turn_step_llm_contract.md`; `packages/turn/MODULE.md`; code, repair validator/owner admission and production route tests. Prior bounded cross-owner reviews: `docs/work/audits/d49-ci-recovery-cd7847c-full-architecture-audit.md`, `docs/work/audits/d49-ci-recovery-5ba-and-ui-audit.md`; live failure diagnosis `%TEMP%/d49-live-5ba-action-diagnosis.md`.
- `source_statuses`: governing rules are highest authority; turn-step contract is ACTIVE; index is active navigation only; turn MODULE identifies orchestration owner. No proposed/reference contract is used as production authority.
- `observed_implementation`: lines 104–121 detect the narrow repair and apply the candidate; lines 357–392 at `turn-step-plan-repair.js` only enable it for a single, initially in-scope ordinary discovery operation with only query/continuation identity errors. Existing operation identity is kept; query and/or continuation are merged from the candidate. The ordinary validator/owner admission and semantic grounding validation still run. If repair changes op/actor, the original plan is returned (372–380), so the patch does not create a new owner or apply the drifted target. The production regression starts at test line 169.
- `required_by_active_contract`: ordinary discovery remains constrained to admitted visible scope; target/operation refs must be bound to its owner; repair cannot turn semantic planning into an unadmitted operation. Existing contract allows query/continuation correction only while preserving the admitted action identity.
- `precedence_resolution`: governing owner boundaries and ACTIVE player-turn contract control; passing a model-repaired plan cannot override failed owner admission. The diff preserves this order by revalidating the repaired result.
- `first_bad_boundary`: live captured turn 2 call 30 first emitted a discovery query that did not match `remaining_intent`; call 32 repaired the query but drifted `target_refs` from the admitted location to a visible NPC, after which `resolveTurnStepDomainOwner` correctly returned no owner (`domain_owner_unavailable`). Patch corrects only this bounded identity repair behavior.
- `correct_owner`: `@rus/turn` repair/orchestration; ordinary discovery and materialization ownership remain unchanged.
- `required_code_delta`: none.
- `required_docs_delta`: none.
- `required_tests`: author reports 21/21 plus 26/26 focused tests passing and a genuine pre-patch `domain_owner_unavailable` RED. I did not run tests. Graph coverage marked the changed files `metadata_changed`; I read the patch and source directly. No new test-only route was observed.
- `severity`: none; `verdict`: **PASS_WITH_NOTES**. The verdict is limited to this immutable patch; full D49 remains unaccepted.

## NPC private semantic repair

CONTRACT AUDIT FINDING

- `audited_head`: `acc037327316afadc6ce22ec593403772044f11b` (clean).
- `scope`: private NPC speech semantic repair runtime/prompt/tests; the one active conversation contract row and its corpus/generated artifacts.
- `source_set`: governing `AGENTS.md` and routed workflow/audit rules; full `CONTRACT_INDEX.md` required sections and rows; ACTIVE `npc_conversation_mode_contract.md` §37.2 and relevant NPC/speech/perception/time owners; `packages/npc-runtime/MODULE.md`; changed prompt/runtime, semantic guards and tests; prior bounded cross-owner audit `docs/work/audits/d49-ci-recovery-cd7847c-full-architecture-audit.md`.
- `source_statuses`: governing rules highest; `npc_conversation_mode_contract.md` ACTIVE for conversation/speech; `turn_step_llm_contract.md` ACTIVE for the player boundary; NPC runtime MODULE owns conversation mechanics but not hidden-knowledge validation, narration, persistence or orchestration; index navigation only. Updated generated manifests/index artifacts remain generated outputs, not new owners or bindings.
- `observed_implementation`: prompt lines 126–145 requests `claim_ids` and restoration of server-held original claims. `applyNpcSemanticRepair` lines 371–397 rejects the old claim-object payload, validates exact shape and resolves IDs through `restoreSemanticRepairClaims` (411–431); malformed, duplicate, unknown or ambiguous IDs fail closed. The repaired plan retains original typed fields. The existing semantic decision/exact-subset guard remains at lines 496–530. Tests cover exact restoration (268 onward), malformed/unknown/repeated/ambiguous rejection (286 onward), and private data handling.
- `required_by_active_contract`: §37.2 now specifies private repair shape `{utterance_text, claim_ids, interpretation, reason}`; the server restores exact source claims, re-audits the full speech and request, requires supported factual propositions and preserves typed decision. Semantic truth remains the auditor’s responsibility; code may not invent or replace speech. D158/factual grounding and closed failure remain required.
- `precedence_resolution`: governing and ACTIVE conversation rules control. The patch changes the normative §37.2 representation to match the intended design and synchronizes the index, corpus manifest, retrieval policy and generated artifacts; it does not authorize a weaker semantic check. No active profile/binding or public/persisted payload changes were reported or observed in the scoped diff.
- `first_bad_boundary`: the private repair model could return regenerated claim objects, allowing it to mutate evidence metadata while selecting support. The runtime now accepts only identifiers and rehydrates immutable source claim objects before the unchanged re-audit/subset checks.
- `correct_owner`: conversation repair adapter for private input/output normalization; NPC conversation owner keeps semantics, auditor keeps factual assessment, server keeps typed plan and original claims.
- `required_code_delta`: none.
- `required_docs_delta`: none; the necessary contract clarification is present and corpus outputs are synchronized.
- `required_tests`: author reports 65/65 focused conversation tests and corpus/docs/knowledge/architecture guards passing. `test:tools` is `FAIL_ENV` because Docker is unavailable in the isolated checkout; it is not a passing result. The parent independently read before/after fake-provider captures and reports same user hash, private `claim_ids`, and unchanged D158 guard. I did not run tests. Graph coverage marked relevant files `metadata_changed`; code/docs were read directly.
- `severity`: none; `verdict`: **PASS_WITH_NOTES**. The verdict is limited to this immutable patch; full D49 remains unaccepted.

## Remaining acceptance status

The committed live D49 report `docs/playtests/2026-10-18_d49_5ba92a85_browser.md` records failure. These focused source reviews and unit tests do not override that result or establish live gameplay acceptance. Transition-environment patch and its PostgreSQL verification are outside these two audited HEADs and require a separate immutable-HEAD audit.
