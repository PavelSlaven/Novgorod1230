# ADR-007: PR8 journey, perception, reaction and first-entry contract amendment

Status: accepted for target/shadow implementation after independent
`PASS WITH NOTES`; no production activation

## Context

PR8/PR10 inventory and the subsequent contract/storage mapping proved eight
cross-package gap classes:

- journey command ingress had no separate closed contracts for starting a
  prepared execution, continuing it, zero-time cancellation and preparing a
  successor plan;
- `@rus/npc-runtime` validated perception input and replay evidence only
  package-locally, so `@rus/turn` had no public closed handoff contract;
- `npc_decision_option` did not bind an approved
  `world_base.decision_command_catalog` record and registered handler;
- transfer-scene preparation could reference only an already materialized
  baseline/G6/position tuple, so it could not reserve the approved identities
  needed by an atomic first-entry arrival.
- the approved decision-command row and registered handler identity had no
  closed runtime read projection;
- a selected command had no formal code-owned handler request/proposal
  envelope;
- perception produced a package-local knowledge suggestion, but the
  perception/message-to-knowledge delta and deterministic merge result were
  not public contracts.
- the existing bounded-decision request accepted an already filtered option
  set, but no public sealed context/policy/result contract proved how
  `@rus/npc-runtime` obtained that finite set from perception, capability,
  threat, anchor and authority inputs.

The accepted Temporal World v4 snapshot
`temporal-world-v1` / `4.3.0-target.1` is bound to historical exact-head
evidence and cannot be changed in place. The gaps are not grounds for a second
clock, route/activity engine, perception package, journal or persistence
owner.

## Decision

Appendix A.7 of
`temporal_world_and_interruptible_activities.md` is the sole normative source
for current-target `temporal-world-v1.1` / `4.4.0-target.1`.

The amendment:

- retains byte-identical generated `4.3.0-target.1` contract and error
  snapshots;
- adds four tagged journey command contracts without a client-authored game
  timestamp;
- models cancel as a zero-time command/control outcome, not a temporal
  boundary;
- binds successor preparation to the predecessor committed handoff and a new
  `path_query`;
- adds closed perception causal snapshots with explicit signal strength,
  Spatial visibility/acoustic edge values, resolved portal/condition effects,
  weather effects, target ambient noise, pinned transient modifiers, observer
  orientation/capabilities, request identity and replay evidence; an opaque
  digest never substitutes for a resolver input;
- validates successor endpoint/party binding, propagation continuity and
  acyclicity, and the canonical digest of the complete sealed perception
  request;
- overrides `npc_decision_option` with a mandatory `decision_command`
  reference, while current controlled-vocabulary v3 adds only that entity kind
  over immutable v2;
- adds the complete approved decision-command read snapshot plus formal
  code-owned reaction request/proposal envelopes; a closed code registry binds
  each approved command to exactly one handler, consequence contract, effect
  kind and existing target command kind;
- replaces the opaque handler input with
  `npc_reaction_handler_input_snapshot`, binds handler retry identity to the
  validated decision trace and command snapshot, and embeds the complete
  request in the proposal so command, handler, state, pins and causal
  perception can be checked without hidden context;
- adds formal knowledge/memory delta and merge-result handoffs while retaining
  validation and deterministic merge ownership in
  `@rus/visibility-knowledge-memory`; the delta carries the complete
  `perception_result`, and the merge result carries the proposal plus sealed
  state-before sets so accepted refs cannot be invented. Received-message
  evidence remains a typed `DATA_GAP` rather than an unverified generic ref;
- adds a declarative reaction rule, approved policy snapshot, sealed
  server-side option context and exact option-set proposal. The validator
  enforces controlled perception outcomes, source/command/consequence pins,
  canonical unique rules, NPC state binding, deterministic applicability and
  exact zero/one/many semantics; `not_perceived` cannot create an option;
- adds `prepared_scene_materialization_snapshot` and overrides
  `preparation_snapshot_member` with an exact resolved-or-prepared XOR branch,
  preserving the historical endpoint snapshot type and duplicate-member
  invariant;
- maps replay to existing perception/idempotency persistence. The prepared
  first-entry branch proved a target storage gap closed by immutable target
  migration `008_party_runtime_pr8_first_entry.sql`; the perception replay,
  code-owned reaction consequence and deterministic knowledge-merge mappings
  proved a second target storage gap closed by immutable target migration
  `009_party_runtime_pr8_reaction_knowledge.sql`. Migration 009 reuses the
  existing `party_npc_knowledge` table through an all-null legacy branch versus
  a complete target branch, preserves both parts of the formal knowledge
  `entity_ref`, and does not create a duplicate knowledge store.
  Production migration loading remains unchanged.

This contract version is not a release stage. Before the separate
`versioned production activation cutover`, it remains target/shadow-only and
cannot write production, mix authoritative reads or fall back to v2.

## Consequences

The two overrides are intentionally incompatible only in the current target;
the generated `4.3.0-target.1` snapshots and vocabulary v2 remain immutable.
The first independent re-audit returned `CHANGES REQUIRED`: it proved that an
unregistered handler, opaque state-patch-like input, unrelated request/proposal
bindings, perception refs without outcome evidence and invented merge facts
were accepted. The corrective contract/validator slice above adds those exact
negative cases. Reaction/knowledge runtime implementation remains blocked
until the regenerated registry, validators, active interface registry and
corrected amendment pass a new independent normative audit. The second audit
found one remaining causal-digest bypass; after adding the exact
`misinterpreted`→`recognized` negative probe and nested perception digest
validation, the final re-audit returned `PASS WITH NOTES`. Its only note was
the isolated audit checkout's Graphify wrapper path failure; the primary clean
worktree independently completed Graphify `0.9.17`, Repository Intelligence
status/query and all normative checks without readiness errors. The target
  runtime gate is open for those audited slices. The pure perception, reaction-handler and
  knowledge-merge slices now implement the audited contracts; target
  persistence migration 009 is physically verified against PostgreSQL but is
  not in the production loader. Combined-write mapping is now physically
  verified. The subsequently proven reaction-option producer gap is covered
  by four additional Appendix A.7 declarations and strict Red→Green
  validators, but its dependent runtime remains blocked until a focused
  independent normative re-audit passes. That focused re-audit returned
  `PASS WITH NOTES`: all causal, command-registry, derivation and identity
  probes now fail closed; the only note is a pre-existing P08 registry
  synchronization issue for the already implemented combined-write mapper,
  outside the option-contract content. Approved option production and
  activation remain separate gates. Later runtime slices must
  reuse existing route-plan, execution, timed-activity, traversal,
  idempotency, perception-result and combined-write contracts. A newly
  discovered incompatible field or storage need requires a new formal gap and
  cannot be inferred from this ADR.
