# @rus/game-server

## Назначение

Production composition root and the only physical PostgreSQL transaction owner. It binds domain public APIs to HTTP, verified knowledge/runtime catalog, read-only world-base and `party_runtime` adapters; it owns persisted presentation delivery state, not its domain projection rules.

Spatial semantic materialization hands the server one validated formal proposal.
Exact physical topology comes from the exact Spatial catalog closure through
`@rus/materialization/spatial-v3`; Spatial owner supplies exact source and
destination base rows from those closures. The fixed fishing-camp G5 uses its
canonical authored identity, never a generated/frontier claim; scenario bindings
carry only profile refs and slot keys. Server owns only P16/SQL: it revalidates committed profile pins,
scope and capacity in existing transaction, then persists accepted refs and
semantic detail. It does not create proposal, topology or resource mechanics,
and adds no second transaction owner.

## Владеет

- Владеет production composition, HTTP `/api/v1/*`, pool/probe/migrations, physical `party_runtime` transaction/Stage 25/combined atomic commit adapters, session/delivery stores and `createTemporalPresentationPostgresStore`.
- Запускается как обычный production server entry. `tools/local-play` снаружи подготавливает только local Docker/PostgreSQL, актуальные env/pin и HTTP readiness; server не владеет launcher, Docker bootstrap или local reset.
- После чтения committed screen/state владеет server-side adapter, который
  фильтрует active interlocutor identity/equipment и добавляет неперсистентные
  presentation-only selectors: `portrait_spec_v1`, optional
  `active_interlocutor.portrait_asset_id` и optional top-level
  `scene_asset_id` к public response.
- Экспериментально владеет `POST /api/v1/portrait-spec` и одним server-side DeepSeek-вызовом, который преобразует свободный текст только в валидный `portrait_spec_v1`, включая перевод названий одежды в закрытые конструктивные категории neckline/sleeve/outer/fabric/trim.
- Владеет одним server-side in-memory LLM settings owner: `GET/PUT /api/v1/llm-settings` и `POST /api/v1/llm-settings/test`. Custom OpenAI-compatible base URL/model/key применяются атомарно к новым calls через `@rus/llm-runtime`; API key не входит в read model, persistence, save/replay или telemetry gameplay.
- В developer mode публикует transient `GET /api/v1/developer/llm-turn-reports/:partyId` (optional `/:requestId`): latest per-party waterfall и aggregate LLM calls, коррелированные существующей парой party/request ID. In-memory retention bounded; report не содержит prompts, hidden state, key или Authorization; probe calls исключены.
- Ведёт локальный диагностический `logs/<party_id>.jsonl`: отдельный append-only файл на партию с public runtime input/output/error, полным player intent, показанным экраном, длительностью и приватным LLM request/response trace. Credentials, provider overrides и LLM settings туда не передаются; PostgreSQL остаётся authoritative state.
- Владеет одним logical context для `submitTurn`: 30 с на весь ход, из них до 25 с на критический LLM path и 5 с детерминированного резерва. Role runner применяет одинаковый clamp к default и custom provider; autonomous retry остаётся в том же context и не получает новый budget. До provider call исчерпанный budget даёт controlled `LLM_TURN_BUDGET_EXHAUSTED`. После factual commit persisted projection и screen persistence получают remaining deadline через PostgreSQL `statement_timeout`; narration и остальные стадии проверяют тот же context до и после выполнения. Diagnostics показывает union wall time параллельных calls и их sum duration; `Promise.race`, detached work и обход общего context запрещены. Это gameplay deadline, не 120-секундный transport safeguard для admin/eval и других non-gameplay calls.
- Production turn narration uses `turn_runtime` Flash roles `gameplay_narrator`, optional one-shot `gameplay_narrator_format_repair`, `gameplay_narrator_auditor` and, only for flagged segments, `gameplay_narrator_semantic_repair`; writer получает player-safe action-intent context (`raw_text`/selected option) только для понимания попытки, не как evidence success/world fact; auditor и semantic repair получают only visible_context. `@rus/narration` deterministically validates schema, visible context, hidden leaks, immutable segment reassembly and final audit. No router, senior cascade or narration fallback exists.

## Не владеет

Не владеет temporal/body/movement/visibility formulae, route or endpoint logic, domain write-plan construction, Spatial materialization proposal/resolution, runtime LLM prompts/repair policy, narration prose, UI read-model rules or world-base writes. Небольшой prompt Portrait Lab относится только к экспериментальному text-to-contract endpoint и не участвует в игровой симуляции.

## Public API и контракты

- `.` exports the activated Spatial-v3 composition root, adapters, HTTP server/handler/static resolver and startup config validation.
- `./production-spatial-v3` exports the sole production composition.
- `createPortraitSpecNormalizer` выполняет единственный text-to-JSON вызов, повторно валидирует provider output до HTTP response и не поддерживает fallback на прежние named-garment enums.
- Scene selector выбирается только из committed player position: zone имеет
  приоритет над location, отсутствие exact server mapping опускает поле.
  Portrait selector выбирается только для единственного committed NPC,
  прошедшего player-safe active-interlocutor projection; server mapping не
  публикует participant slot или другую internal identity.
- Selectors вычисляются после committed read, не пишутся в `party_runtime`,
  visibility/knowledge или world-base и не участвуют в admission, narration,
  mechanics либо truth. Их exact web asset allowlist/fallback принадлежат
  `@rus/game-web`, не server.
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

On normal first entry, Spatial-v3 owner supplies any approved broad
`open_one_space` slot as part of that baseline plan; server only composes,
P16-revalidates and persists it. Late S1 keeps the baseline topology immutable:
it commits the owner-validated `local_ref` binding and semantic detail, not a
new G6, position, edge, route or mechanics.

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
The O1 plan keeps that exact semantic target in `semantic_target_ref`, separate
from the G6 simulation `scope_ref`; P16 binds owner output to the selected
`request_discovery` target before commit.
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
operation. Active O2a includes the authored wreck-shore abundant sand and one
first-entry context-bound finite prepared-clay stock. Player-safe state exposes
that committed stock as an ordinary source only when its separate approved
disclosure state is visible; concealed capabilities remain server-only. The
discovery marker is boolean and exposes no unresolved result, permission or
capacity. Stage B may choose an
unlisted ordinary semantic type/name inside the approved class, while the owner
rechecks mechanics, property, permission and source. The `ambient_ordinary`
enum alone never selects O2a, so existing clay/wood/bark/grass/stone/shell/root/worm direct actions retain
their legacy admission. Migration 025 conservation and bounded initialization/decrement
are active for every admitted `finite_source`; each selected source reloads its
own committed row, while constrained policy adds resource
permissions but does not own conservation. Unprovisioned precious/remnant profiles
remain fail-closed. Currency identity,
significant/hidden facts, template-less containers and O2b/A1/F1/N1 remain
disabled. Negative resolutions contain no item and
every failure rolls back.

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
`party_items` plus mechanics/property/placement and the container transition.
Mechanics-sensitive moves resolve unresolved contents concealed before exact
mass/packing calculation without opening the container; later access reveals
the committed safe name/type without reroll. Precommit/failed children remain
concealed and no partial batch leaks; reload/reopen uses committed coverage with zero model
calls. Narration consumes only the persisted post-reveal package and cannot add
items. No new HTTP operation, contents store or transaction owner is added.

Active revision 21 A1 accepts one or more committed or validated same-root
revealed non-container material sources and zero or more accessible actor-controlled
non-container tools through explicit disjoint source/tool refs; current-anchor
placement or an already revealed open actor-accessible container is sufficient,
and legal ownership need not belong to the actor. Qualitative outcome is part of
the sole `turn_step_plan_v1`; no A1 model or scenario planner exists. The
validated result is projected into the same root turn before pending continuation.
profile admits preserve, up to four mass-conserving independent outputs and
no-result, with output/source mechanics derived exactly from consumed
allocations; finite sources decrement, while a fully partitioned whole item
retires and leaves active placement/capacity without a synthetic resource row.
For multi-source preserve the first source keeps identity and later sources are consumed by grounded extent. Independent multi-source outputs require the same owner/claim basis; their property source is the canonical minimum source ref, while mixed basis fails closed independent of ref order.
Partial independent output carries only grounded qualitative
`minor|half|major` extent for one non-finite source; the item owner maps it to an exact gram decrement,
keeps the changed source active, updates its current physical facts and derives
its remaining mechanics. Odd mass
is distributed deterministically; output
hand/packing/carry is code-derived. Safe named result descriptors persist with neutral `ordinary_mundane` identity in ordinary item metadata and survive reload, including
partial/nonworking/waste, physical writing, non-authoritative token-like and
closed qualitative weapon-capable outcomes. Visible non-authoritative current
physical facts and separately typed physical inscriptions survive unrelated transforms, same-root continuation and reload; explicit visible fact refs allow physical
removal/replacement. Multiple causal A1 steps run in order over the shared
working projection and commit in one combined P16. Item mechanics, conservation,
identity and placement remain code-owned. Qualitative physical form is mapped
with exact mass to hands/carry/packing by the item owner. Weapon combat class is
ephemeral and belongs only to the combat boundary; every held A1 item without
exact weapon mechanics is classified from current facts/form, including a
closed not-weapon result, regardless of the last A1 output class. A1 state
stores no combat class or damage. Valid zero-positive classification keeps the
ordinary unarmed/default profile applicable; one positive selects its
code-owned danger, while ambiguity or invalid classification fails closed.
Positive weapon/token/writing outcomes require an admitted accessible tool;
ordinary/no-result keeps the zero-tool path. Partial survivor text facts may be
empty when its required form alone changes code-owned inventory geometry.
Uncertain actions perform a read-only authority preflight before RNG, then reuse one generic check and semantic activity/time resolution from turn owners; deterministic actions use `domain_request` without
RNG but still apply one ordinary semantic activity/time cost after a real
physical attempt. The same combined P16 write set contains the full turn snapshot,
append-only check resolution, clock/activity writes and the ordered A1 plans.
The existing transaction, state-version checks and idempotency owner bind the
physical transitions to the same root commit without a second RNG, clock, A1
execution ledger or A1-specific plan hashes.

A1 v1 limits are explicit: single-source preserve has no small subtractive mass-loss/waste model; one action produces homogeneous outputs; tools are unchanged pins without wear or consumption; finite partial partition and partial additional finite consumption are unsupported. Unspecified requested output count is `null` and resolves to one owner-chosen entity; impossible explicit count is a time-spending physical no-result without item writes.

Public new-game replay uses an exact persisted creation identity. Trace
publications pin materializer and RNG versions as historical execution
identity. Current build support is checked only before a new materialization;
persisted trace reads use the immutable publication/session/party pins.
Runtime release `spatial-v3-production-v10` сохраняет revision 19 appearance,
equipment-driven portrait path и revision 20 O2b content; active publication
revision 21 добавляет SHA-pinned open physical A1 M9/v17/v16 profile. Revision 20/v9 и
revision 19 остаются immutable historical compatibility paths, v9 — rollback
source.

Runtime release `spatial-v3-production-v11` сохраняет все inherited paths и
делает revision 22 / M10 / Phase 1A v18 / Phase 1B v17 sole current
publication. Он materialize-ит exact authored ignition basis и два concrete
whole fuel units, композирует production resolver и регистрирует due boundary у
существующего temporal owner. Любой другой item-owned whole fuel допускается
тем же generic правилом без ID whitelist; A1 output получает fuel class только
от causally consumed classified fuel source. Player capability берётся из
player-safe projection; Phase 7 строит NPC capability из NPC-safe доступных
ресурсов и публикует exact operation contract. Process ref появляется только
при source-backed NPC-safe evidence самого process; знание bound fuel не
раскрывает objective binding или process ref. Causal ignition basis model не
публикуется. Оба пути проходят один
DB/item-owner admission. Start/add/due и qualitative
whole-water affect, включая `no_effect`, входят в тот же combined P16; bound
fuel mutation, nested A1 source mutation, stale pins, duplicate transition и
late failure откатываются атомарно. Несколько ordered due, включая same-time
разные fires, фиксируются одной transaction и отражаются в canonical snapshot. Due
actor-neutral и продолжает процесс после ухода/смерти инициатора. Player-safe
marker содержит только visible refs. Player resolver применяет F1 plan к
текущему working projection, а item owner переносит bound fuel в process scope
и сразу убирает его mass/hands из carried inventory без смены ownership.
Для следующего actor step PostgreSQL loader принимает ordered prior F1 chain
только как code-owned input, проверяет party/actor/root/change set/base version,
step-specific request и process/item pins, затем последовательно проецирует
process state, placement, binding и retirement без промежуточной записи в БД.
Prepared time adapter получает весь accumulated same-root F1 chain, заменяет
committed runtime и temporal candidate текущим состоянием каждого process, а
due output применяет через существующий local-fire item projection owner до
следующего model request. Loader отдельно проверяет строгий actor-step и
system temporal-boundary provenance; completed process удаляет candidate.
Production Phase 7 использует тот же PostgreSQL-backed resolver; same-root
start и попавшая в remaining window due сохраняются ordered в одном P16.
Production player F1 resolver дополнительно возвращает только safe factual
seed `turn_step_world_process_<step_index>`: fire action/outcome/status без
process/item refs, pins, bindings, timestamps или causal evidence. Generic
visible projector строго принимает только согласованные start/started,
add_fuel/fuel_added и affect/no_effect|continue|complete combinations, сохраняет
их step order и строит approved Russian factual sentence/change token. Эти
facts накладываются на обычную phase projection того же root turn либо на
validated current-scene package pure F1, не удаляя видимых NPC, objects и
scene context; clarification остаётся после уже совершённых facts. NPC и
off-screen due seed не получают. Existing turn-step visible envelope сохраняет
combined package в `party_visible_packages`; narrator и screen читают тот же
persisted package, не механику F1 и не temporal state.
Отдельных F1 authority/commit tables,
evidence, digest или sealing нет; model выбирает только bounded qualitative
outcome воды вне SQL transaction.

## Ошибки, зависимости и effects

Uses `pg` only under `src/infrastructure/postgres`; `GameServerError`/server error envelopes, startup probes and adapter failures are explicit. This is the persistence and external-I/O boundary: owns pool/transaction/HTTP/provider/filesystem calls and rejects invalid schema, hidden public payload, stale knowledge artifacts and unqualified targets. Party JSONL logging is best-effort diagnostics: a filesystem failure is reported to stderr but cannot turn an already committed gameplay operation into a client failure. No deterministic runtime fallback is allowed. P16 factual commit remains atomic; post-commit narration failure is presentation handling and cannot roll back or veto an already committed deferred-presentation turn.

## Production activation и тесты

The current versioned production activation cutover is `spatial-v3-production-v13`.
The server and config expose only
`builtin:production-spatial-v3`; v2 has no runtime selector or public
composition export. Startup requires the complete Spatial-v3 bindings module
and the completed cutover stage `13`, and fails closed while any persisted
party remains on schema v2. Release metadata pins the exact approved
`novgorod_spatial_v3_production_v5_candidate_001` world tuple and manifest,
`temporal-world-v1.1`, exact dependency-pin mode and the
existing `rus.runtime_catalog_pin.v2` policy (active event only for a new
party; persisted historical pin thereafter).
Release v13 is the direct non-selectable child of v12 and pins Lower Dvina
Trace revision 25 / M13 / Phase 1A v21 / Phase 1B v20. It activates the
approved NPC actor-step Phase-7 profile: the existing Жданко boundary is the
first current activation participant/probe. Runtime NPC actor-step is the general current
actor-step owner-capability path: it admits registered, state-applicable
operations and NPC-safe current refs, with no action/ref/owner whitelist or
special Жданко action logic. S1 remains gated by its separate prepared
revision-24 profile. No runtime-catalog activation is added.
`test/game-server.test.js`, `party-store-runtime-catalog.test.js`,
`runtime-catalog-boundary.test.js`,
`test/spatial-v3/p16-committer-postgres.test.js`,
`temporal-world-postgres.test.js` and `presentation-store.test.js` cover
composition, atomic transaction/lock/idempotency, exact persistence and the
leased post-commit presentation lifecycle.
