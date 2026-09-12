# @rus/game-server

Состав безопасного входа для художественной сцены сверяется с
[ситуационными требованиями к прозе](../../data/knowledge-source/corpus/DOCUMENTS/situational_prose_requirements.md).
Server передаёт актуальные восприятие, память, тело, время, причины и остаток
действия от существующих owners; литературную композицию выполняет narration.

Development-only gameplay gap tracing использует существующий private party
log и `llmDiagnostics`. При `developerMode: true` сохраняет исходный committed
контекст, WK planner/query/consumer slice и owner commit/rejection. Эти поля
не входят в публичный diagnostic report, player/NPC prompt или authoritative
state. При выключенном developer mode capture callback отсутствует. Ошибка
snapshot помечает trace неполной (`capture_failed`), не изменяя игровой исход.
Gap Auditor работает отдельно в authoring workflow; в runtime не вызывается.

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

- Planner examples остаются flat semantic objects; mapping labels находятся
  вне JSON. Goal/result и exact continuation относятся ко всей заявке.
  Stable system rules предшествуют request-specific choices/mappings и audit
  shape/segment choices. Audit evidence краток, но сохраняет все разные findings.
  Planner private wire опускает дублирующий WK context_text только при наличии
  полного structured slice; facts/qualifiers/constraints/coverage/gaps/disputes,
  canonical grounding и telemetry сохраняются.
  Narration prompts проверяют также temporal/aspectual связи и конкретный
  pending choice; whole-prose repair повторно применяет все grounding rules.

- Production WK query planner может вернуть canonical empty six-field plan,
  когда raw semantic step не требует factual premise. Grounder фиксирует
  `NO_KNOWLEDGE_REQUIRED` в private boundary trace, не вызывает
  embedding/vector/Core и запрещает consumer дополнять факт из model memory.
  Непустая factual need сохраняет прежний validated retrieval path.

- Narration adapter даёт auditor request-local sources
  visible_change_N/uncertainty_N. Private wire разделяет required_current_beat
  (changes/uncertainties с ref/text), optional_support
  и constraints (do_not_imply/allowed_tensions/style_policy), без копии visible_context.
  При любом current change/uncertainty optional_support содержит только visible_scene и sensory_details:
  остальные static arrays/metadata не поступают writer/auditor/repair. Sensory details
  выбираются по текущему beat; полный пересказ окружения запрещён.
  Newly relevant facts приходят через visible_changes: applied observation
  продвигает воспринимаемые scene facts, arrival — destination facts/NPC/objects/route,
  включая safe entity label/status и уже human N1 ordinary cues; portrait enums
  не становятся prose и не требуют нового словаря,
  ordinary scene seed — только факты текущего результата. Общая projection
  выполняет arrival promotion после NPC enrichment, но берёт route knowledge
  из исходного arrival result. Snapshot self-knowledge и carried objects
  не продвигаются общим осмотром; ими владеет explicit item observation. Без current beat
  descriptive support сохраняется для scene-only perception. Outcome/intent
  передаются только своим ролям; used_references остаётся [].
  Private auditor возвращает только полный ordered reviewed_segments,
  ordered source_reviews `{ref,segment_choices}`, semantic `unsupported`,
  `literary_failures` и evidence. Adapter строго проверяет exact own-key set,
  refs/order, canonical segment choices, allowed failure kinds/checks и reasons,
  затем детерминированно собирает public source_index coverage, concerns,
  artistic/technical verdict и общий pass. LLM не назначает verdict или индексы.
  Пустой review частично либо полностью потерянного source становится
  missing_visible_change; malformed private output fail-closed и не получает
  синтезированного repair concern. Final audit всегда strict.
  Private writer/format-repair возвращает только prose; Adapter всегда собирает
  публичные action_options=[], used_references=[] и нейтральный self_check={},
  которые не служат model approval.
  Полноту coverage и согласованность художественного/технического verdict
  проверяет `@rus/narration` на initial/final audit. Narrator и цельный repair
  строят текущий beat вокруг изменений и неопределённостей; статический
  контекст поддерживает его, не вытесняя незавершённое действие или exact speech.

- Phase 2 объединяет одновременные retries одной party/idempotency identity
  в одну runtime promise до чтения replay. Другой input digest получает conflict.
  Promise удаляется после завершения; durable replay и commit остаются у P16.
  Это координация одного server process, не межпроцессная блокировка.
  Только workflow failure до входа commit owner выдаёт публичный
  `error.turn_commit_status: not_started`; replay и неопределённый commit
  не получают этот признак.
- Публикует player-safe progress только для exact active request через
  `GET /api/v1/parties/:partyId/turns/:requestId/progress`. Ответ — nullable
  `turn_progress_v1` со status `running`, request ID, monotonic sequence,
  started/phase-start timestamps, factual `elapsed_seconds`, всегда
  `remaining_seconds: null` и одной закрытой phase: `accepted`,
  `understanding_action`, `resolving_world`, `saving_result`, `preparing_screen`
  либо `recovering_saved_result`. `commit_state` остаётся `unconfirmed` до
  одобрения commit stage и затем только `committed`; replay/presentation recovery
  использует committed recovery phase. DTO не содержит ETA, percent, LLM role,
  prompt, provider trace или hidden mechanics. Ordered workflow stage events
  только обновляют этот request-scoped in-memory read model; ход и commit остаются
  authoritative, завершённый либо неизвестный request возвращает null.
- Владеет production composition, HTTP `/api/v1/*`, pool/probe/migrations, physical `party_runtime` transaction/Stage 25/combined atomic commit adapters, session/delivery stores and `createTemporalPresentationPostgresStore`.
- Запускается как обычный production server entry. `tools/local-play` снаружи
  подготавливает owned embedded PostgreSQL, Gemma/Giga runtime, актуальные
  env/pin и readiness; server не создаёт второй launcher или inference transport.
- После чтения committed screen/state владеет server-side adapter, который
  фильтрует active interlocutor identity/equipment и добавляет неперсистентные
  presentation-only selectors: `portrait_spec_v1`, optional
  `active_interlocutor.portrait_asset_id` и optional top-level
  `scene_asset_id` к public response.
- Общий screen projector строит Character/Inventory/Route из текущего committed
  actor/body, player-safe вещей и code-owned inventory calculations. Opening,
  pending, ready и historical replay используют тот же owner. Точные catalog
  labels читаются по scenario pins; неизвестные/скрытые вещи не раскрываются.
  Header получает готовые `presentation_context` place/date/time; этот DTO
  не изменяет сохранённый `visible_context` и не является новой world truth.
- Тот же projector строит ordered `screen.checks` из committed check results:
  generic, player-conversation, negotiation и treatment checks, а в combat
  только шаги player actor.
  Он добавляет safe actor/action и modifier labels, удаляет check identity,
  audit/seed/policy refs и не публикует NPC checks без perception binding.
  Pending semantic/combat screen, ready screen и historical replay используют
  ту же persisted арифметику; presentation recovery не reroll-ит её.
- Экспериментально владеет `POST /api/v1/portrait-spec` и одним server-side
  provider-selected LLM-вызовом, который преобразует свободный текст только в
  валидный `portrait_spec_v1`, включая перевод названий одежды в закрытые
  конструктивные категории neckline/sleeve/outer/fabric/trim.
- Владеет одним server-side LLM settings owner: `GET/PUT /api/v1/llm-settings` и `POST /api/v1/llm-settings/test`. Режимы `local`/`custom`, OpenAI-compatible base URL/model/optional key и существующая O1 qualification identity сохраняются в одном локальном user-config (`RUS_LLM_SETTINGS_PATH` либо platform config directory) и атомарно применяются к новым calls через `@rus/llm-runtime`. API key не входит в public read model, party save/replay, logs или telemetry; отдельного provider/gameplay path и silent fallback нет.
- В developer mode публикует transient `GET /api/v1/developer/llm-turn-reports/:partyId` (optional `/:requestId`): latest per-party waterfall и aggregate LLM calls, коррелированные существующей парой party/request ID. In-memory retention bounded; report не содержит prompts, hidden state, key или Authorization; probe calls исключены.
- Ведёт локальный диагностический `logs/<party_id>.jsonl` (каталог переопределяется `LOG_DIRECTORY`): отдельный append-only файл на партию с public runtime input/output/error, полным player intent, показанным экраном, длительностью и приватным LLM request/response trace. Credentials/API key, base URL и runtime provider override туда не передаются; non-secret provider/model, config hash и effective generation parameters сохраняются. PostgreSQL остаётся authoritative state.
- Владеет одним logical context для `submitTurn`, который объединяет диагностику, одноразовые repair-claims и шестиминутный safety deadline всего хода. Это защита от зависания, не SLO: поздний LLM-вызов ограничивается оставшимся временем, до factual commit сохраняется пятисекундный резерв, а после commit используется pending-presentation recovery без повторения effects или RNG. Каждый runtime LLM-вызов следует каноническому production-limits invariant из `@rus/llm-runtime`. Diagnostics показывает deadline, union wall time параллельных calls и их sum duration. Повторный repair одного вида для той же immutable request identity блокируется до provider call.
- Lower Dvina turn-step model adapter до core validator выполняет только однозначную canonicalization закрытых provider-shape ошибок: choice wrappers, exact misplaced/duplicated continuation, отсутствующие diagnostic reason fields и single-target `request_discovery`. Остальные targets и исходный later-continuation передаются core как typed code-owned pending queue; prompt её не строит и не ремонтирует. LLM repair остаётся только для semantic mismatch; неисправимая структура даёт typed technical failure без commit/narration.
- Focused speech auditor после faithful verdict может вернуть bounded metadata projection полного direct speech envelope по §8.2.1: только независимо проверенный input mode, exact unexecuted suffix, равный прежнему continuation или восстанавливающий его префикс, и pending goal; speaker/text неизменны, dependencies пусты, prepared/discovery carriers отсутствуют. Plan после допустимого trial валиден либо имеет только isolated verbatim exact-copy/goal-continuation ошибки. Existing preflight передаёт corrected plan в core для полной strict revalidation/freeze без нового planner или re-audit; остальные ошибки сохраняют one-repair/fail-closed path.
- Existing grounding validator детерминированно отклоняет literal direct/not_achieved
  только при operations=[], check/continuation/clarification/direct_result_kind=null
  и player-safe discovery_available=true: `operation_semantic_grounding` по
  `$.resolution` запускает тот же single repair без initial LLM audit. Ошибка
  resolution включает зависимые operations/activity/goal/continuation: repair
  заменяет весь rejected causal shape по существующему prerequisite mapping. Repair
  сохраняет literal и полный physical intent через ordinary_material_prerequisite;
  nominal query только о недостающем referent/material, без физического действия
  и цели использования; complete intent остаётся exact continuation. Это закреплено
  stable planner и final repair-specific tail для единственной ошибки
  `$.resolution/operation_semantic_grounding`. Focused auditor получает operation,
  полный continuation и remaining_intent, различает prerequisite и выполненный
  discovery prefix; код не подменяет его mode и не добавляет retry. Повторный literal denial
  terminal. Reality-limited, make-believe и disabled discovery не затронуты.
  Domain-owner-unavailable repair использует lawful reality_limited без выдуманного
  успеха или физической невозможности; слова игрока остаются evidence weight 0.
- Для этого audit core может подготовить effort→none trial по §8.2.1; существующий auditor не меняет effort/owner/duration и не получает нового LLM role. Trial должен пройти core admission полного speech envelope без requested duration; ошибки за пределами copy/goal не разрешают metadata projection.
- Та же bounded metadata projection разрешена после faithful re-audit structurally valid единственного repair: strict validation/freeze сохраняются, дополнительного planner/audit нет. Effort trial и structural recovery на repair не распространяются; оставшаяся ошибка terminal.
- Ordinary presence и semantic activity накладывают подтверждённые изменения
  на текущую committed player-safe сцену. Наличие activity seed не заменяет
  место, наблюдаемые вещи и sensory details синтетическим сообщением об успехе.
  Domain-native projection сохраняет приоритет; невыполненный intent остаётся
  отдельной неопределённостью и не доказывает частичное достижение цели.
  Успешно применённый физический поиск связывает собственный no_change или
  authority_required с activity seed: подтверждённой находки в этой попытке
  нет. Это не доказывает отсутствия вещи в мире; inspect/preflight и другая
  activity не получают такой вывод по соседнему query.
- Production turn narration uses `turn_runtime` Flash roles `gameplay_narrator`, optional one-shot `gameplay_narrator_format_repair`, `gameplay_narrator_auditor` and optional one-shot whole-prose `gameplay_narrator_semantic_repair`; writer и repair получают only confirmed player-safe visible context/outcome, а auditor отдельно получает optional action-intent только как non-evidence для обнаружения intent-to-success. `@rus/narration` deterministically validates schema, visible context, hidden leaks, whole-prose replacement and final audit. No router, senior cascade or narration fallback exists.

Каждый applied direct `not_achieved`, в том числе после achieved speech, передаёт через общий turn-step result overlay недостигнутую `interpretation.player_goal` как отрицательный результат. Это не утверждает невозможность способа `grounded_attempt`, выполнение контакта или причину неудачи. Duration нескольких direct semantic seeds суммируется до текстовой дедупликации. Applied speech и failed results выводятся в порядке step traces; unapplied plans не проецируются как результаты.

Revision 33 production temporal registration читает canonical NPC schedules,
применяет approved routine transitions в текущем рабочем состоянии и сохраняет
их через существующий P16. Несколько границ одного окна дают последовательные
causal transitions и один CAS итогового состояния. Deferred prepared scope
допустим до первого входа; first-entry связывает точную позицию без сброса
занятия или времени. Сон меняет доступность NPC для разговора. Этот cutover
не расширяет историческую Phase-7 activation свободных решений NPC.
Routine movement проходит существующий route owner с проверкой committed source
и exact endpoints; adapter переносит NPC только при completed handoff, а blocked
handoff сохраняет исходную позицию и следующий причинный schedule state.

Semantic continuation без изменения тела использует existing prepared-effect
chain уже с первого timed шага. Runtime передаёт advanced committed projection
следующему planner/ordinary owner; изменённые temporal NPC views перестраиваются
из authoritative state. Generic commit replays approved semantic activity/body
bindings каждой prepared slice, сверяет общий time/body и сохраняет существующую
activity/body history в том же P16. Раннее temporal прерывание no-body semantic
slice сохраняет original/planned duration отдельно от actual elapsed и оставшегося
времени; paused execution и paused attempt используют существующие activity rows,
а terminal completion operations не входят в прерванный commit.
Domain-command ledger contracts сохраняются.

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
to numeric budget by a versioned code-owned policy. A normalized discovery
query equal to the normalized remaining intent, with one visible target owned
by ordinary discovery and no continuation or check, is structurally grounded
without an LLM audit; altered or compound discovery still crosses the semantic
auditor. The normalized query and exact target derive the code-owned candidate
identity; the query reaches
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
approved ambient capability bounds for schema-valid direct extraction, while
concealed capabilities remain server-only. The
discovery marker is boolean and exposes no unresolved result, permission or
capacity. Stage B may choose an
unlisted ordinary semantic type and independently classifies the full
candidate, including its qualifiers and relations, for admission;
the descriptor's `semantic_type` remains the specific model-classified material
or object type. Player-facing name and facts are code-owned neutral values, so
unsupported model wording cannot become a committed premise. Its prompt uses an
explicit non-null type placeholder and accepts no name/facts; null or omitted
types retain the existing strict validation and single repair.
the owner accepts it only when that class matches the code-owned candidate, then
rechecks mechanics, property, permission and source. Before item admission, the
same full candidate must be `standalone_item` rather than `non_item_detail`;
ordinary non-item details bind to persisted `no_change` and cannot reach item mechanics, ownership or placement,
but mandatory unavailable evidentiary, significant or hidden authority takes
precedence over physical form and requires `authority_required` when every viable
alternative needs it. Independent mundane alternatives remain separately eligible for admission.
The `ambient_ordinary`
enum alone never selects O2a, so existing clay/wood/bark/grass/stone/shell/root/worm direct actions retain
their legacy admission. Migration 025 conservation and bounded initialization/decrement
are active for every admitted `finite_source`; each selected source reloads its
own committed row, while constrained policy adds resource
permissions but does not own conservation. Unprovisioned precious/remnant profiles
remain fail-closed. Currency identity,
significant/hidden facts, template-less containers and O2b/A1/F1/N1 remain
disabled. Negative resolutions contain no item and
every failure rolls back.
A new admitted ordinary `search` with any normal presence decision applies
the existing `short/light` activity profile through the same activity, body,
time and P16 owners. The approved domain search binds this activity to its
exact step; a fresh ordinary request requires it, and a known answer permits
it without a new ordinary write. Preflight refusal and `inspect` material
prerequisites do not execute that search.
A model `no_change` or `authority_required` limits the answer, not the executed
search. A presence preflight with no decision may retain a first scene seed,
but creates no presence resolution and incurs no search activity.
The admitted activity projects a performed search with its exact duration;
its separate candidate query remains a question, never ownership or success.
An admitted O1 item adds a strict `ordinary_presence_seed` with resolution
`materialized`, exact query and admitted `display_name`. The current beat reports
that discovery once. Applied step traces and prepared ledger slice seed keys group
each step into one required change: exact speech then its elapsed time; search time
then discovery; physical result after its activity. The ordinary material prerequisite
mapping binds `inspect` for an exact full-intent continuation in ordinary scope;
focused audit still checks its semantics and real focused searches retain activity/body boundaries. Query alone implies
neither ownership nor execution. An already resolved A1 owner can continue a
prepared semantic chain when no authored command was selected; its existing
scope, preflight, revalidation, conservation and atomic P16 owners remain required.
A new physical search can reuse an existing negative presence answer without a model call or materialization write, while applying a new activity/body cost. The applied domain search authorizes that activity. Inspection/recall remains free.
The item or negative resolution and the search cost commit together; transport retry
replays the committed result without another activity or model call.

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

The current versioned production activation cutover is `spatial-v3-production-v15`.
The server and config expose only
`builtin:production-spatial-v3`; v2 has no runtime selector or public
composition export. Startup requires the complete Spatial-v3 bindings module
and the completed cutover stage `13`, and fails closed while any persisted
party remains on schema v2. Release metadata pins the exact approved
`novgorod_spatial_v3_production_v6_candidate_001` world tuple and manifest,
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
Release v14 is the direct non-selectable child of v13. It pins Lower Dvina
Trace revision 32 / M20 / Phase 1A v23 / Phase 1B v27 and the approved
`lower_dvina_trace_n1_background_npc_v1@1` profile for the existing visible
background fisher. This is a profile-specific N1 activation only: look/inspect
may persist and replay an audited semantic descriptor plus the exact activity
already created by the code-owned materialized schedule; schedule state is
never exposed to or authored by the N1 model. Broader N1 capability remains
unactivated.
Release v15 is the direct non-selectable child of v14. It pins
`wk-pack:novgorod-1230@revision:production-v1` and
`wk-embedding:giga-480m-0826:v1`. The server loads the compiled bilingual
pack and flat vector index and starts the exact offline embedding worker at
startup, then grounds player semantic resolution, S1/N1 ordinary
materialization, conversation, and autonomous NPC decisions before their
semantic LLM calls. Ordinary WK planning receives the same admitted scene
context as the materializer. Its information need retains the complete candidate
query and code-owned admission/coverage/entity bounds; opaque IDs and policy refs
are not natural-language retrieval vocabulary. Candidate focus recall uses the
query and approved scene text. The full ordinary request still reaches its own
semantic and code admission owners unchanged.
O1 prompts contain common rules and only the current seed/presence mode rules.
Only the semantic response shape is shown; authoritative plan fields stay server-assembled.
A grounded positive presence requires an exact supporting in-slice claim ref;
empty or unsupported refs still fail admission.
The private O1 wire omits only duplicate `world_knowledge.context_text` when
the full structured factual slice is present. Facts, qualifiers, constraints,
coverage, disputes and gaps remain; claim binding and telemetry use the full request.
The private WK planner wire sends each ranked focus ref once as a key in
`available_knowledge_refs`, with its allowed claim domains as the value (including
empty arrays). Native planner requests retain the complete ordered ref array for
validation and diagnostics; candidate and retrieval budgets are unchanged.
Retrieved claims are bounded context only: domain owners
still control current state, mechanics, persistence, access, and outcomes.
The Giga/vector path is mandatory whenever v15 needs a WK slice. Missing local
weights, startup/encode timeout, malformed vector or scan failure returns typed
`WORLD_KNOWLEDGE_UNAVAILABLE` before the semantic consumer and P16 commit; no
lexical gameplay fallback, mutation or failure ledger is created. HTTP hides
the internal cause in its normal temporary-unavailable envelope, and a retry
after encoder recovery follows the existing idempotency owner.
Один WK need объединяет approved search hints в один query text и выполняет
ровно один Giga encode и один vector lookup перед одним Core resolution.
`test/game-server.test.js`, `party-store-runtime-catalog.test.js`,
`runtime-catalog-boundary.test.js`,
`test/spatial-v3/p16-committer-postgres.test.js`,
`temporal-world-postgres.test.js` and `presentation-store.test.js` cover
composition, atomic transaction/lock/idempotency, exact persistence and the
leased post-commit presentation lifecycle.

Current unpublished publication v28 introduces the player's family, trade work,
received assignment and remembered river journey from the current authored
dossier, before the wreck/body/shore facts. These premises persist in existing
origin, memory, knowledge and relation fields. They establish no cargo contents,
destination, cause of the wreck or present fate of remembered people/property.
Historical publication prose and dossier content remain unchanged.

Current-scene and final visible composition retain the safe projector's own
identity, biography, memories and available player-safe knowledge text as
`known_context`, including
authored actions. This enriches the resulting scene without restoring old scene
objects or people after movement. The Character panel receives the same safe
self-history; hidden records and raw dossier metadata remain private. Prior
relations do not automatically recognize an unidentified visible person.

Final safe composition uses the actual body owner's `state_after` and time
owner's `clock_after` for the resulting turn, across authored and general
actions. Current qualitative conditions come from the existing safe body
projection; changes retain their before/after meaning. Narration may translate
supplied semantic condition states, but cannot add symptoms, diagnoses or
intensity. Opening time and initial bodily prose are not timeless knowledge.

Committed authored conversations expose only their player-facing `journal_text`
and actual speaker through the existing safe interaction projection. Private NPC
`memory_text` remains private. Recalled testimony is historical attributed
knowledge, not objective truth or evidence of current presence. Safe summaries
remain available to planner, narration and Character after reload. Textless
acquired fact references require their own approved presentation; this path does
not reconstruct hidden facts or claim complete Phase 9 knowledge delivery.

Current scene presentation supplies perceived exits from the existing pinned
movement bindings and source location. A visible path does not disclose its
destination name, exact duration, safety or unseen occupants. The same safe
route projection feeds planner context, movement labels and the Route panel;
remembered routes use existing route knowledge/history after traversal. It is a
read projection, not a second route store. Inspection and reload retain the
visible path; movement recomposes routes for the actual destination.

Current publication adds an authored shore path, its limit of sight and nearby
water sound. These are approved current sensory premises, not deductions made
by narration from the mere presence of water. Historical presentations remain
pinned. Dynamic weather/light and complete acquired-fact presentation remain
separate delivery gaps; this change does not activate weather simulation.

`request_item_use` с `use_kind: other` и semantic `description`, без
`action_production`, разрешает transient non-transforming физическую попытку.
Existing item runtime owner перепроверяет current actor, item ref, доступ
в текущем placement и player-safe target refs. Current-visible item доступен
на месте при точном совпадении всех его scope refs с текущей position;
`scene_position_id` сравнивается с player-safe `position_id`. Held actor item
тоже доступен. Pickup не требуется; `move_entity` обслуживает только явно
заявленное перемещение. Semantic activity owner сохраняет
время/body. Результат фиксирует только попытку: без durable item/world facts,
расхода, трансформации, скрытых сведений и подтверждённого результата наблюдения.
Existing handler supports оставляет authored/legacy use и A1 их владельцам.
Known material ref не отправляется повторно в ordinary discovery при repair.

Focused ordinary location audit допускает strict `prerequisite_query` correction:
LLM выделяет только отсутствующий ordinary referent; code сохраняет exact полный
remaining intent, связывает inspect/current scope и повторяет owner admission без
нового LLM вызова. Hidden/significant/authored evidence не является prerequisite.
Empty target_refs одной unselected discovery связывается только с доступным
current location при ordinary capability; explicit refs не заменяются.

Unsupported direct_result_kind у literal direct/not_achieved no-op denial может
быть обнулён только в audit-only trial, если весь plan после этого strict valid.
Trial не принимается как результат. Existing focused classifier может выделить
ordinary prerequisite тем же протоколом; code соберёт corrected plan и перепроверит
owner/schema без full planner repair. Disabled/authority-limited случаи не получают
ordinary bypass; прежний lawful repair/fail-closed сохраняется.

Single transient use с отсутствующим item_ref допускает audit-only material trial
только при unknown_ref (и optional source_placement_grounding того же ref), literal,
пустом continuation и доступном ordinary current location. Known недоступный item
не дублируется. Existing focused classifier выделяет nominal prerequisite; code
сохраняет полный exact intent. Для strict-valid single literal accessible transient
use без continuation/check/clarification code подставляет exact remaining_intent в
description ДО первого semantic audit. Transformation/discovery/independent actions
не становятся transient от копирования текста. Только pass возвращает corrected_plan
для strict owner/schema revalidation; stable ref/placement и visible seed сохраняют
точный intent, дополнительный auditor/full planner repair не нужен.

Denial/missing-ref trials помечают focused input `correction_candidate:
missing_ordinary_referent`: pseudo query передаёт полный physical intent, а не
выбранный поиск. В этом режиме аудитор проверяет missing ordinary prerequisite;
успех требует nominal prerequisite_query. Normal discovery input marker не имеет;
negative different_action остаётся reject, отсутствие/authority guards сохраняются.

Narration distinguishes committed transient handling from an unexecuted continuation:
applied physical motion happened for the grouped duration; only observation/discovery
result remains open. Pending goal does not undo an applied operation. Narrator renders
the motion concretely, without status metadata or an invented future action choice.

Narration auditor использует exact `request.segments[].segment_id` во всех
reviewed_segments, source_reviews, unsupported и literary_failures. Positional
aliases и нормализация не допускаются; Adapter детерминированно собирает
coverage/verdict, а final audit строго проверяется по IDs
повторно сегментированной approved prose. Длительность хода не входит в private
prose wire: её вычисляет temporal owner и показывает server-owned UI projection.
Любая придуманная narrator временная величина является unsupported fact, а
служебная формулировка дополнительно проваливает elapsed_as_service_report.
При current beat private wire
допускает visible_scene + sensory_details; narrator выбирает только относящиеся
к этому эпизоду признаки, а unrelated/all-facts dump остаётся static_context_dump.
Полный grounded пересказ required sources по одному в исходном порядке является
weak_literary_composition, если действие или воспринятый результат не организует
поддержанные пространственные детали в сцену; выдуманная связка недопустима.

Temporal/aspect grounding не позволяет выводить длительность из действия или
sensory sky/weather/sound. Sensory support связывает сцену. Source review требует все propositions каждого atomic
required source; неизвестный результат нельзя опустить или заменить
failure/success. Речь передаётся естественно с дословным
содержанием и speaker, discovery — через подтверждённое восприятие без status report.
Грамматически подчинённое раннее действие допустимо при однозначном
completed-before смысле; reversal и simultaneous/ongoing embedding запрещены.

Applied-step causal projection оставляет semantic_activity duration temporal owner;
single transient_item_use получает два соседних atomic current-beat source:
выполненную попытку с exact description, затем отдельно неизвестный observation result.
Каждый source получает собственный ref и проверяется независимо. Отдельный elapsed component этого step
удаляется перед финальной сборкой; search передаёт только выполненное действие и результат.
Narrator переводит evidence wording в естественную речь и конкретное движение,
не копирует служебные слова step/attempt и не добавляет минуты.
