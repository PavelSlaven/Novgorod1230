# CONTRACT AUDIT FINDING — D49 NPC host decision

audited_head: `3995a19593e09d9f351bd18c04bb440590366e5a`, clean checkout `codex/d49-npc-audit-target`. Scoped diff `3caadc2c7..3995a1959` (six files, +67/−52).

scope: Private NPC speech grounding auditor output shape, host verdict, prompt, focused/integration fixtures, changelog. This is an independent read-only audit of this delta; final D49 acceptance and new model qualification are separate.

source_set: Current root `AGENTS.md`, governance corpus including AR §25.1 and WR §§24.2–24.4, full `CONTRACT_INDEX.md` (Conversation row §8.1), `apps/game-server/MODULE.md`, active `npc_conversation_mode_contract.md` §37.2, surrounding active NPC autonomous/family and situational-prose boundaries, exact changed source/tests, unchanged conversation caller and repair prompt, prior D49 audit reports, frozen bench packet. `packages/llm-runtime/MODULE.md` checked for production role constraints. No nested `AGENTS.md` in affected game-server paths.

source_statuses: Root/governance = GOVERNING; index = ACTIVE/navigation; NPC conversation/autonomous/family = ACTIVE; situational prose = ACTIVE SPECIALIZATION. Bench packet and old model results = task evidence, not production norms. Proposed umbrella documents have no authority here.

observed_implementation: `auditFreshNpcSpeech` now requests `utterance_fragments`, optional `original_fragments`, and `concerns`, without a model-authored `pass`. Host computes success from zero concerns, zero unclaimed factual fragments, and zero dropped supported claimed original facts (`apps/game-server/src/runtime/lower-dvina-trace-npc-speech-grounding-audit.js:142–165`). Strict exact-key validation rejects a legacy `pass` field (`:180–195`). Prompt still asks model to check all fields against request evidence and adds explicit instructions to examine independent facets and distinguish missing evidence from contradiction (`:77–117`). Caller forwards `concern_kinds` and diagnostic `kind/reason/quote` to the existing single semantic repair (`lower-dvina-trace-conversation-llm.js:295–305,359–405`); repair keeps original typed decision and claim subset rules. No new state, role, call, retry, owner or persistence path.

required_by_active_contract: NPC §37.2 requires request-grounded semantic audit, exact ordered fragment coverage, preservation of supported original claimed facts, concrete diagnosis/quote, one semantic repair, unchanged typed decision and typed failure after a repeated failure. It explicitly requires repair for a factual fragment without a claim regardless of the model's overall pass. It does not require an independently returned `pass` bit.

target_if_any: Reduce a redundant model verdict and improve diagnosis on general evidence/facet failures. No normative cutover or schema change.

conflict: No governing/active contract conflict in this scoped code delta. The removed `pass` was a second statement by the same auditor, not an independent authority; its removal leaves host structural fail-closed checks and semantic concerns. Tests translate the old fixture shape and retain rejection/repair assertions; one strict test now rejects extra `pass`, and the supported-fact-loss test asserts the exact host-generated feedback. Model semantic truth remains delegated to the same auditor, as §37.2 specifies. The existing validator accepts an empty quote for a speech concern, although §37.2 expects an exact quote for utterance concerns; this predates this diff and is not worsened by it.

precedence_resolution: Governing AR/WR and ACTIVE NPC §37.2 govern the output contract. Existing code/tests establish the private wire only within that authority. Earlier Qwen 11/14 semantic result on `3caadc2c7` cannot be rescored or used to qualify `3995a1959`.

first_bad_boundary: None found in scoped architecture/contract delta. For release acceptance, first unresolved boundary is the new model response to the revised prompt and JSON shape.

correct_owner: `apps/game-server/src/runtime/lower-dvina-trace-npc-speech-grounding-audit.js` for audit prompt/admission; existing `lower-dvina-trace-conversation-llm.js` for repair integration. No duplicate owner.

required_code_delta: None for this scoped architectural review.

required_docs_delta: None to active contract/index; changelog entry exists. Lead should track the preexisting empty-quote validation gap separately if it is not repaired in D49. The benchmark plan compares one candidate variant containing both output-shape removal and general prompt clarifications. Under WR §24.3's single-variable rule, lead must accept that combined role variant as the tested variable or require separated runs before claiming causal improvement from removing `pass`. This is a bench-design gate, not a code contract conflict.

required_tests: Fresh approved 14-case production-role Qwen run and independent judge against predeclared structural/verdict/semantic thresholds; full before/after request capture and lead reading under WR §24.4; exact-HEAD integration/live gameplay gates before D49 acceptance. Packet reports 14 fake-fetch dry-run requests and no real model calls. Unit/fixture tests cannot establish model semantic quality.

severity: P3 for scoped code; P1 pending final D49 model-quality gate.

verdict: **PASS_WITH_NOTES** for the scoped architectural/contract change. **Final D49 acceptance remains pending**, not PASS, until fresh model and integration gates succeed.

Checks actually run by this auditor: `git diff --check 3caadc2c7..3995a1959` PASS; `node --test apps/game-server/test/lower-dvina-trace-npc-speech-grounding-audit.test.js` 13/13 PASS, 0 skipped; exact Git diff/status and source/contract reads. Worker-reported 191 focused tests and syntax/architecture/docs checks were not independently rerun here. No model call made.

CBM limitation: project `C-Users-Slaven-Documents-Novgorod` indexed at `2026-10-16T05:26:03Z` points to primary `main` HEAD `55fa99b`, not this worktree. Tier 3 bounded search/trace found one direct caller and three direct callees in that generation, but snippet was stale. `check_index_coverage` reported `metadata_changed` for governing/source paths and `missing` for several tests; current worktree source and exact Git diff, not graph text, underpin this verdict. `detect_changes` also described primary checkout's unrelated `.claude/settings.local.json.bak-20261014-tools`, so it cannot represent this diff.
