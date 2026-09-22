# @rus/materialization

## Назначение

Детерминированный code-only materializer v2 и bounded decision protocol.

## Владеет

- versioned `mulberry32_v1` RandomSource и seed derivation;
- выбором из approved candidates и materialization trace;
- детерминированным completion `actor_base_appearance_v1` из approved
  demographic/appearance profile entries;
- детерминированной материализацией `actor_base_attributes_v1` только из
  verified active runtime-profile record; authoring candidate или equipment
  allocation policy не являются runtime authority;
- проекцией G5 из approved profile/layout/slot rules и NPC/items из нормализованных eligible candidates;
- code-only item placement primitive, который Stage 16 использует для
  equipment candidate → NPC/player instance resolution;
- pure ordinary foundation helpers: density metadata, supporting-basis and
  prepared-group validation, stable refs and minimal aggregate transitions;
- signed command tokens и проверкой bounded decisions.

## Не делает

- не создаёт категории, templates, profiles, rules или исторические факты;
- не читает базы и не выполняет commit;
- не подмешивает equipment в scenario party result: этот handoff завершает
  общий Stage 16;
- не вызывает LLM.

Revision 33 инициализирует calendar routine через `@rus/npc-runtime` из
approved profile. Current successor item templates use exact approved catalog
labels; materialization writes them once to existing `state.display_name` for
initial items and Stage 16 equipment. Historical template content is unchanged.
The current dossier binding also supplies player-known biography, memories,
received instructions and prior relations through the existing dossier fields.
Materialization copies those authored premises; it creates neither a new NPC
nor a current perceptual identification from a remembered relationship.
Stage 24 сохраняет её в canonical schedule table в общей
NewGame транзакции; подготовленный G6 при этом не materialize заранее.

## Публичный API

`materializeAuthoredStartPartyInstance` детерминированно материализует уже
утверждённый authored-start profile: actors, relations, finite resources,
geometry, body/time/environment и player-known facts. Функция не читает каталог,
не пишет БД и допускает profile только через переданные exact pinned closures:
canonical G5/G4/template/materialization profile из world-base, item template /
inventory / quantity / category из verified runtime catalog и approved
player-known refs. Player/NPC role и occupation разрешаются из exact
digest-pinned approved regional actor catalog; неизвестная, неодобренная или
несовместимая пара отклоняется до write plan.

Current authored binding v3 дополнительно выводит initial Spatial-v3
G5/baseline/G6/position input только из exact approved canonical G5 и
scene-template closure. Materializer не создаёт route/topology и не заменяет
canonical связи семантикой.

Authored resource mechanics additionally resolve exactly one approved
`size_band` binding and its approved item category from the verified runtime
catalog. The persisted inventory snapshot copies its exact packing slot cost,
bundle size and size-band ref; missing or ambiguous bindings fail before plan.

`materializeWorldInstances`, `materializeG5Scene`, `materializeNpcPlacement`, `materializeItemPlacement`, `materializeActorBaseAppearance`, RNG/digest helpers, bounded decision functions и pure ordinary foundation exports (`computeOrdinaryIdentityBudget`, basis/group validators, stable-ref helpers and the minimal aggregate reducer/normalizer). Candidate identity helper принимает только code-owned normalized ref/version и не хэширует model-owned semantic descriptor.

`profileFromVerifiedRuntimeRecord`, `materializeActorBaseAttributes` и
`materializeOrPreserveActorBaseAttributes` принимают exact
`rus.actor_base_attributes_runtime_profile.v1`: active catalog revision,
activation event, approved import/readback и profile membership. Отсутствующая
active membership остаётся typed
`ACTOR_BASE_ATTRIBUTES_RUNTIME_PROFILE_DATA_GAP`; default `strength` и чтение
authoring-only candidate запрещены.
`attachActorBaseAttributesToNpcs` применяет тот же owner ко всем новым NPC из
approved occupation→archetype mapping и сохраняет уже materialized snapshot
при profile-level promotion/reload вместо повторного RNG.

`compileProceduralSceneProfile` is an authoring/readiness compiler over exact
approved landscape, water, land-use, place-function, item and actor owner rows.
Bindings contain refs only. Compiled components retain typed layer/category,
owner refs, source field/value, exact quantity bounds and source selection
weight. Missing applicable required layers are a typed data gap. The compiler
does not treat selection weight as presence probability and does not call LLM.

`compileApprovedNpcRuntimeBasis` derives schedule, property, tool/clothing/
container requirements, local/route knowledge, relationships, fears, goals and
LLM boundaries from exact approved enriched role/occupation rows. Every field
keeps its owner source ref. Missing source data or incompatible role/occupation
blocks before party commit; this basis does not fabricate concrete equipment.

`deriveApprovedInitialEnvironment` computes first-entry season/light and one
weighted weather state from exact approved Temporal v4 calendar/daylight and
weather records plus the pinned materialization RNG. It preserves owner refs
and exact daylight boundaries; missing date coverage or weather candidates is a
typed data gap. It does not accept authored light/weather prose.

`materializeApprovedProceduralNpc` consumes only the verified actor/Temporal
bundle plus one approved placement binding. It creates stable identity,
canonical base appearance, social/legal/occupation refs, approved skills/body,
schedule/current activity and private behavior/knowledge basis. Names remain
absent without exact authored basis; required tools/clothing hard-block unless
an active exact equipment mapping is supplied.

Ordinary foundation в этом PR остаётся shadow-only: API не вызывает LLM, не
читает БД, не выполняет commit и не активирует production O1 route. Он только
валидирует code-owned inputs и возвращает immutable logical state/result.
Применение результата reducer к общей working projection принадлежит только
`@rus/turn`; отдельного materialization projection type/API нет.

Ordinary foundation API (`createOrdinaryAggregate`,
`assertAndNormalizeOrdinaryAggregate`, transition/key/context helpers и working
projection) остаётся одним generic exact-scope ledger для O1 и O2b. O2b не
создаёт отдельное contents storage: aggregate получает
`scope_ref.entity_kind=container`, хранит deterministic seed/resolution/coverage
history и тем самым закрывает exact reload/reopen без reroll. Module не решает
container eligibility, contents semantics, mechanics, reveal или persistence.

`@rus/materialization/spatial-v3` owns immutable Spatial proposals and snapshots.
Its P20 helpers never commit or invoke v2; production S1 reuses the same owner
to resolve formal state from one exact world-catalog closure.

Spatial semantic materialization owns formal proposal/resolution: exact
physical topology comes only from the exact Spatial catalog closure through
`@rus/materialization/spatial-v3`. A scenario binding supplies only profile
refs and slot keys. The owner validates a finite code-owned envelope bound to
committed spatial scope, admits open ordinary semantic detail and produces
formal refs, capacity effect and only profile-provided mechanics. Capacity
consumption remains in P16. It creates no unapproved topology, movement,
hazards, resource effects or persistence writes; `@rus/game-server` performs
only P16 revalidation and SQL commit.

During normal first-entry/baseline materialization, Spatial-v3 owner creates
each approved broad `open_one_space` slot with its G6, position and local
topology in the immutable baseline. Late S1 resolution never augments that
baseline: LLM supplies only name, description and qualitative required
semantics; Spatial owner validates them and binds `local_ref` to the already
persisted formal placement.

Live-world authored binding revision 6 selects `code_materializer_v3` and
produces `rus.authored_start_party_materialization_result.v3`. Its initial S1
topology is derived only from the exact approved profile slot and pinned
world-base closure; missing or ambiguous authority fails before party commit.
Older persisted authored results remain read-only compatibility inputs and are
never rerun through the current materializer.

Revision 6 сохраняет в player dossier versioned opening context: source hint,
near/far facts и local-structure labels с exact persisted anchor/G6/position/
movement-edge refs. Это player-safe causal source для Stage 22/23, не prose и
не параллельный scene owner. NPC, carried items, activity, body, clock и
environment берутся из committed party state при построении opening package.

## Контракты

Принимает `world_materialization_request_v2` либо stage-specific approved bundle. Authoring candidates ссылаются на будущие экземпляры через однозначные `slot_key`, которые код разрешает после deterministic selection. Generic result содержит стартовую позицию и исполняемый, но не записанный materializer-ом `proposed_write_set` для нормализованных таблиц `party_runtime`. Profile/layout/slot/template refs, capacities, access, visibility, quantity, condition, legal status, causal basis и property policy обязательны; пропуск завершает операцию typed failure.

## Допустимые зависимости

`@rus/kernel`, чистый routine API `@rus/npc-runtime` и стандартная библиотека Node.js.

## Запрещённые зависимости

Apps, DB drivers, provider SDK, UI, legacy и смысловые workflow packages.

## Инварианты

Одинаковые versioned inputs дают byte-equivalent output; каждый выбор входит в
trace; `Math.random` запрещён. Для runtime-catalog materialization
`trace.catalog_digest` сохраняет exact domain pin, а
`trace.catalog_bundle_digest` — digest конкретной immutable projection.
Explicit authored appearance сохраняется без draw; только отсутствующие поля
выбираются из approved/applicable entries, отсортированных по stable ID. Эти
draws идут после прежнего deterministic prefix, а пустой required facet
возвращает typed data gap. Applicability authored dependent-полей заранее
ограничивает prerequisite draws: например, authored `braided` требует
совместимую длину волос, а facial hair — совместимые sex/age. Противоречивый
authored набор отклоняется до первого RNG draw.
Ordinary aggregate transition также детерминирован и CAS-bound; legacy
`identity_budget`, `remaining_identity_budget` и `resolution_record_cap`
сохраняются как compatibility fields, но не ограничивают суммарную
конкретизацию scope. Повторный candidate/coverage/context или identity
отклоняется вместо reroll. `concealed` либо container access не меняют authority
и не являются фактом этого ledger.

## Полнота воспринимаемой сцены

Литературная приёмка использует единую
[ситуационную норму](../../data/knowledge-source/corpus/DOCUMENTS/situational_prose_requirements.md).

Полнота воспринимаемой сцены принадлежит исходным world/profile owners и
материализации, а не длине текста narrator. При появлении в новом месте должны
быть доступны причинно подтверждённые ориентиры ближнего и дальнего плана,
видимые выходы и значимые препятствия; погода, свет и слышимая деятельность —
когда для них есть актуальное основание. Это не обязательный список ощущений
для каждого хода. Видимость пути не доказывает знание его назначения или
безопасности. Недостающую ordinary-конкретику разрешает существующая
materialization boundary; значимая география, люди и hidden facts требуют
соответствующей authority. Narration не восполняет отсутствующий источник.

## Ошибки

`MaterializationError` с машиночитаемым code и immutable details.

## Тесты

Детерминизм, gaps, invalid candidates/tokens и bounded option membership.
