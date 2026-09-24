# @rus/new-game

## Назначение

Модульный workflow создания новой игры: изолированные Stages 2–26, compatibility facades и общий orchestrator.

## Владеет

- каталогом и публичными entrypoints Stages 2–26;
- stage-local precheck/validation/repair contracts;
- общим new-game orchestration order;
- handoff к Stage 25 persistence и Stage 26 first-screen result.

## Не делает

- не содержит конкретный provider transport или PostgreSQL adapter;
- не создаёт категории, историю или отсутствующие варианты;
- не хранит UI state;
- не выполняет соседний stage через внутренний импорт.

## Публичный API

`NEW_GAME_STAGE_CATALOG`, `runNewGamePipeline`, orchestrator exports и версионированные stage subpaths.

Stage 24 exports `approvedNpcBodyRows`, `approvedNpcConditionRows` and
`initialNpcRoutineRecords` for reuse by generated first-entry P16 composition.
These pure projections retain the canonical body and routine row formats.
A supplied `npc.position_id` binds a routine directly to its materialized
Spatial v3 position; existing prepared-scene/legacy bindings remain deferred.

## Контракты

Phase 1A internal materialization принимает как historical Lower Dvina result,
так и общий approved authored-start result; оба используют один Stage 24/25
atomic commit contract и одну physical transaction boundary game-server.
Для authored result Stage 24 сверяет полный вычисленный admission, exact
world/domain closure digests и resolved refs; одного `pass` boolean недостаточно.
Current authored binding v3 сохраняет из approved closure один initial
Spatial-v3 baseline/G6/position и actor journey location в той же new-game
transaction; route либо local topology этим не синтезируются.
When the authored result carries an exact `canonical_scene_proposal`, Stage 24
serializes its complete approved scene rows and selects the unique arrival
endpoint for the player journey. It retains authored acoustic values and
returns the actual G5/baseline/G6/position IDs; no S1 topology is added.
Supplied player base attributes persist in the actor profile binding and
persisted projection. Every supplied snapshot requires the actor attribute
catalog pin matching its materialization trace and compatible world; an active
player attribute gate also requires a complete snapshot. The selected initial
position must match the unique authored arrival endpoint.
Canonical-start NPCs retain the initial scene's compatibility anchor for the
legacy foreign key. Their exact Spatial v3 position is serialized separately
through the existing `entity_placements` owner and routine schedule; every
position must exist in the same approved canonical scene proposal.
Для явно активированного new-development runtime Stage 24 сохраняет exact
`actor_base_attributes_v1` party pin и полные snapshots шести характеристик
в той же Stage 24/25 transaction. Reload, retry и profile promotion используют
persisted snapshots без reroll; inactive или несовместимый binding остаётся
typed DATA GAP/INVALID.

Каждый stage принимает точный input contract. Для активированного
`actor_base_appearance_v1` Stage 7 требует pinned actor profile snapshot и
возвращает typed hard block при его отсутствии; historical revisions сохраняют
нестрогий контракт. Stage 8 связывает equipment candidate с target NPC slot,
Stage 11 сохраняет разрешённый player intent и передаёт пропуски общему
code-owned appearance completion, Stages 12/15/24 требуют полный контракт для
новых actors, а Stage 16 разрешает target NPC/player и создаёт одежду как
реальные item instances. Stages
13, 15, 16 и 24 выполняются кодом; LLM используется только в явно разрешённых
ролях.

Stage 23 сохраняет литературную оценку opening отдельно от фактического допуска:
чисто литературный finding не блокирует первый экран, а factual, hidden,
coverage и technical failures остаются fail-closed.

Authored live-world opening также использует существующие Stage 22/23 owners.
Его code-owned player-safe package строится после committed materialization из
persisted actor/NPC/item/spatial refs, проходит eight-question reader control и
только затем передаётся writer/auditor. Static profile prose остаётся hint, не
готовым первым экраном.

## Допустимые зависимости

`@rus/contracts`, `@rus/kernel`, `@rus/materialization`, `@rus/pipeline-engine`, `@rus/party-store` через публичные APIs.

## Запрещённые зависимости

Apps, UI, provider SDK, DB driver и внутренние файлы соседних stages.

## Инварианты

Код материализует instances только из approved profiles/rules; LLM repair не создаёт runtime state; commit идемпотентен.

## Ошибки

Stage-specific typed failures, validation failures, upstream repair requests и persistence failures.

## Тесты

Module/parity tests Stages 2–26, orchestrator tests, integration и browser E2E.

## Совместимость

Legacy facade доступен только через отдельный explicit rollback export; default modular graph его не загружает.
