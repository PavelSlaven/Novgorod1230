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
code. Stage A concrete entities are forbidden; its density band is converted
to numeric budget by a versioned code-owned policy. Normalized discovery query
and exact target derive the code-owned candidate identity; the query reaches
the model only as `candidate_hint` and never acts as a noun/recipe allowlist or
classification/mechanics authority. Exact normalized retry reuses the
persisted resolution, while a different query has a different identity.
One discovery has a shared two-call semantic budget; structural repair consumes
the remaining call, and a repaired Stage A can finish as a seed-only commit.
The exact M7 profile and versioned adversarial Stage B approval receipt are
mandatory cutover pins. The probes run before profile activation; gameplay
only verifies the receipt against the profile digest and exact
provider/model/config identity, without additional eval calls.
Its server-owned
PostgreSQL committer locks the party, aggregate and trusted context pins, then
atomically writes migrations 021–025 state: O1/O2a enablement/objective, aggregate,
prepared/committed scoped supporting-basis catalog, positive or negative exact
resolution/idempotency, optional private-v2 item with immutable
mechanics/property/placement and normalized basis links, aggregate CAS, catalog
pin and party version. Stale proposals are rejected rather than silently
rebased; reload/retry cannot reroll a committed code-owned identity. The player-safe
response exposes only the O1 discovery capability marker and approved visible
result, and narration runs only after factual commit. O1 has no new HTTP/public
operation. O2a admits only exact profile/basis/permission-bound context resources:
ambient portions, bounded finite sources, approved precious physical material and
non-unique damaged remnants; currency identity, significant/hidden facts,
template-less containers and O2b/A1/F1/S1/N1 remain disabled. Finite initialization
accepts one semantic estimate inside persisted code-owned bounds, then P16 owns the
exact quantity and all later decrements; reload combines immutable profile pins with
the current resource row. Context-bound visible names are profile-owned, not copied
from Stage B. Negative resolutions contain no item and
every failure rolls back.

Public new-game replay uses an exact persisted creation identity. Pre-Phase-1B
`start_text` snapshots are admitted by a separate fail-closed compatibility
policy: the server verifies party/request identity, the `start_text` branch
and the persisted effective player name. Their original raw `start_text`
cannot be proven because legacy snapshots did not persist it; this limited
replay never permits switching the request to a scenario-ID branch.
Trace publications pin materializer and RNG versions as historical execution
identity. Current build support is checked only before a new materialization;
persisted trace reads use the immutable publication/session/party pins.
Runtime release `spatial-v3-production-v9` активирует revision 19 appearance и
equipment-driven portrait path; v8 остаётся rollback source.

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
