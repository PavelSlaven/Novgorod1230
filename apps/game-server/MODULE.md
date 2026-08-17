# @rus/game-server

## Назначение

Production composition root and the only physical PostgreSQL transaction owner. It binds domain public APIs to HTTP, verified knowledge/runtime catalog, read-only world-base and `party_runtime` adapters; it owns persisted presentation delivery state, not its domain projection rules.

## Владеет

- Владеет production composition, HTTP `/api/v1/*`, pool/probe/migrations, physical `party_runtime` transaction/Stage 25/combined atomic commit adapters, session/delivery stores and `createTemporalPresentationPostgresStore`.
- После чтения committed screen/state владеет server-side adapter, который
  фильтрует active interlocutor identity/equipment и добавляет неперсистентный
  `portrait_spec_v1` к public response.
- Экспериментально владеет `POST /api/v1/portrait-spec` и одним server-side DeepSeek-вызовом, который преобразует свободный текст только в валидный `portrait_spec_v1`, включая перевод названий одежды в закрытые конструктивные категории neckline/sleeve/outer/fabric/trim.

## Не владеет

Не владеет temporal/body/movement/visibility formulae, route or endpoint logic, write-plan construction, materialization semantics, runtime LLM prompts/repair policy, narration prose, UI read-model rules or world-base writes. Небольшой prompt Portrait Lab относится только к экспериментальному text-to-contract endpoint и не участвует в игровой симуляции.

## Public API и контракты

- `.` exports the activated Spatial-v3 composition root, adapters, HTTP server/handler/static resolver and startup config validation.
- `./production-spatial-v3` exports the sole production composition.
- `./production-v2-migration-source` exports v2 PostgreSQL helpers only for explicit migration/rollback tooling; it exports no runtime composition.
- `createPortraitSpecNormalizer` выполняет единственный text-to-JSON вызов, повторно валидирует provider output до HTTP response и не поддерживает fallback на прежние named-garment enums.
- Target infrastructure factories `createSpatialV3CombinedAtomicCommitter` and
  `createTemporalPresentationPostgresStore` remain server-owned adapters; they
  accept only validated sealed plans/explicit pool transactions and are not
  domain decision APIs.
- An admitted player `move_entity` for an existing actor-held item or container
  is rebound
  to that same common proposal before commit. The server derives source and
  destination from committed state, persists the normalized holder/controller
  placement through the existing turn-step P16 commit, rechecks the exact
  source item/container placement and ownership under the transaction, and
  reloads portraits from the resulting equipment state; no scenario-local
  take/equip command or parallel transition committer owns this mechanic.
- First-playable landing activation is persisted only through the active P16
  write plan. For catalog v2 it writes the resolved canonical NPC identity,
  every approved NPC item/container allocation, normalized actor placement and
  ownership/controller rows, and immutable garment visual snapshots. The
  historical v1 resolver and its pre-appearance item identifiers remain
  available for already pinned parties.

For target `first_entry`, the combined committer accepts the already-defined
Spatial-v3 core G5/baseline/G6/position rows and the root journey-location
update only through one approved combined plan. The plan binds a stable
scene-baseline materialization-scope key; its transaction-scoped advisory
lock precedes the idempotency lease, baseline absence/reuse recheck and every
domain write.

Infrastructure inputs are explicit pool/config/binding/plan DTO and transactional callbacks; output is a committed physical result, HTTP envelope or typed server/infrastructure error. SQL targets are explicitly `party_runtime`; world-base adapter is read-only. Temporal presentation persistence stores package/pending-delivery lifecycle separately from narrator output, atomically with factual write when required by the combined plan.

Active O1 Phase 6 composition accepts only the closed
`ordinary_materialization_atomic_write_plan_v1` DTO after the sanitized model
call outside a physical transaction and Phase 4 admission. The existing
`request_discovery` route reaches it only after meaningful-engagement and
code-first known-result gates; Stage A is candidate-free and Stage B has
`evidence_weight = 0`, with identity/classification/policy fields built by
code. Normalized discovery query supplies only `candidate_hint` and an adjusted
`coverage_ref`; unknown paraphrases retain distinct coverage, so no-reroll is
limited to exact deterministic normalization. Its server-owned
PostgreSQL committer locks the party, aggregate and trusted context pins, then
atomically writes migrations 021–023 state: O1 enablement/objective, aggregate,
prepared/committed scoped supporting-basis catalog, positive or negative exact
resolution/idempotency, optional private-v2 item with immutable
mechanics/property/placement and normalized basis links, aggregate CAS, catalog
pin and party version. Stale proposals are rejected rather than silently
rebased; reload/retry cannot reroll a committed exact deterministic identity. The player-safe
response exposes only the O1 discovery capability marker and approved visible
result, and narration runs only after factual commit. O1 has no new HTTP/public
operation and does not activate O2/A1/F1/S1/N1, template-less runtime
containers, context-bound weapons/value/currency or natural finite sources;
negative resolutions contain no item and every failure rolls back.

Active O2b keeps the same public `request_container_access`. Production startup
loads and SHA-validates revision 20 M8 / Phase 1A v16 / Phase 1B v15 plus one
exact existing-container profile; revision 19 publication/loading remains an
immutable historical recovery path. First-entry P16 provisions the approved
template-backed player pouch, ownership and its container-scoped ordinary
aggregate/context/basis/enablement inside the existing transaction without an
extra party bump. Only an exact persisted container/profile/property/owner/
placement/mechanics match installs the resolver; drift, missing profile,
template-less container or non-bound container fails closed before model.
Authoritative contents bypass resolver/model. Candidate-free model execution is
outside SQL, and the server validates the complete ordinary batch, individual
mass/mechanics, exact parent placement and packing/capacity before constructing
one `ordinary_container_contents_atomic_write_plan_v2`. The existing combined
P16 transaction atomically persists ledger transition, children through
`party_items` plus mechanics/property/placement, container open/reveal and
player-safe visible package. Precommit/failed children remain concealed and no
partial batch leaks; reload/reopen uses committed coverage with zero model
calls. Narration consumes only the persisted post-reveal package and cannot add
items. No new HTTP operation, contents store or transaction owner is added.

Active revision 21 A1 is limited to the authored garment-plus-owned-knife
profile and `preserve_source|no_useful_result`. It reuses the one generic
check and one semantic activity/time resolution already produced by the turn
owners. The same combined P16 write set contains the full turn snapshot,
append-only check resolution, clock/activity writes and the A1 plan; its digest
and change-set identity therefore bind the physical transition to the exact
roll/outcome and duration/effort evidence without a second RNG, clock or A1
execution ledger. Any evidence mutation invalidates the sealed combined plan
before transaction work.

Public new-game replay uses an exact persisted creation identity. Pre-Phase-1B
`start_text` snapshots are admitted by a separate fail-closed compatibility
policy: the server verifies party/request identity, the `start_text` branch
and the persisted effective player name. Their original raw `start_text`
cannot be proven because legacy snapshots did not persist it; this limited
replay never permits switching the request to a scenario-ID branch.
Trace publications pin materializer and RNG versions as historical execution
identity. Current build support is checked only before a new materialization;
persisted trace reads use the immutable publication/session/party pins.
Runtime release `spatial-v3-production-v10` сохраняет revision 19 appearance,
equipment-driven portrait path и revision 20 O2b content; active publication
revision 21 добавляет узкий SHA-pinned A1 M9/v17/v16 profile. Revision 20/v9 и
revision 19 остаются immutable historical compatibility paths, v9 — rollback
source.

## Ошибки, зависимости и effects

Uses `pg` only under `src/infrastructure/postgres`; `GameServerError`/server error envelopes, startup probes and adapter failures are explicit. This is the persistence and external-I/O boundary: owns pool/transaction/HTTP/provider calls and rejects invalid schema, hidden public payload, stale knowledge artifacts and unqualified targets. No deterministic runtime fallback is allowed.

## Production activation и тесты

The separate versioned production activation cutover completed as
`spatial-v3-production-v1`. The server and config expose only
`builtin:production-spatial-v3`; v2 has no runtime selector or public
composition export. Startup requires the complete Spatial-v3 bindings module
and the completed cutover stage `13`, and fails closed while any persisted
party remains on schema v2. Release metadata pins
`novgorod_spatial_v3_target_contract_approval_001`, the exact approved Spatial
manifest digest, `temporal-world-v1.1`, exact dependency-pin mode and the
existing `rus.runtime_catalog_pin.v2` policy (active event only for a new
party; persisted historical pin thereafter).
`test/game-server.test.js`, `party-store-runtime-catalog.test.js`,
`runtime-catalog-boundary.test.js`,
`test/spatial-v3/p16-committer-postgres.test.js`,
`temporal-world-postgres.test.js` and `presentation-store.test.js` cover
composition, atomic transaction/lock/idempotency, exact persistence and the
leased post-commit presentation lifecycle.
