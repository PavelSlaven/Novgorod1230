# ADR-008: first-playable activity и materialization amendment

Статус: accepted for candidate implementation  
Дата: 2026-07-25

## Решение

`timed_activity` продолжает принадлежать единственному owner
`@rus/turn/spatial-v3-execution`. Standalone activity расширяет тот же
`ActivityExecution` ветвью `execution_scope=standalone`, общим
`activity_series_id`, типизированным `activity_owner_ref` и sealed origin
command evidence. Вторая таблица или второй lifecycle engine запрещены.

Универсальный resolver использует только versioned approved
`ActivityProfile`. Сценарий задаёт фактическую доступность участников,
ресурсов, инструментов и мест, но не длительность или отдельную action policy.
После утверждённых applicability, priority и bounded-decision правил resolver
обязан получить один исполнимый результат. Отсутствующий обязательный профиль
даёт `activity_profile_gap`; отсутствующая policy или конечный candidate set —
`activity_policy_gap`. Несколько кандидатов допустимы только при явно
утверждённой bounded-decision policy. Иначе это authoring conflict. Все эти
исходы блокируются до execution, времени и мутаций; default, lexical, random,
LLM repair и вопрос игроку о скрытой механике запрещены.

Semantic d20 identity типизирована:

- immediate action — `action_run_id`;
- timed activity — `activity_execution_id + attempt_ordinal`;
- traversal — `traversal_interval_result_id`.

ResourceBinding для верёвки имеет `binding_kind=required_tool`. Owner не
меняется. Holder/controller передаются рыбаку при approved activation policy.
Возврат выполняется только как completion effect pinned resource policy после
повторной проверки текущего состояния. Pause, interruption, failure или
изменившееся владение не вызывают автоматический возврат.

Малая гребная лодка — transport entity без G6 interior. Её root world position
хранит `party_journey_locations`, стояночное сценическое размещение —
`entity_placements`, постоянные права — `party_entity_controls`. Boarding
удаляет own root location актёра и создаёт carrier attachment. Alighting
освобождает attachment и создаёт проверенную own location. Фиктивный G6 и
безусловный `party_actor_carrier_position` запрещены.

First-entry receiving materialization использует
`prepared_scene_materialization_snapshot` с versioned scope kind, slot ID,
party-derived scope key, ID derivation version и generation. Exactly-once
обеспечивают детерминированные reserved IDs и существующие PK/UNIQUE.
`preparation_claim` остаётся временной execution reservation; отдельный
materialization claim/ledger не создаётся.

Разговор — standalone timed activity. Минимальное NPC enrichment, нужное для
адресного взаимодействия, коммитится при activation с сохранением NPC ID.
Immutable interaction projection создаётся только из terminal execution
evidence. Completed/failed/aborted execution не возобновляется; retry создаёт
successor series member. Relation effect использует typed causal evidence и не
требует фиктивной conversation projection для совместной работы.

`save` является zero-time immediate action над уже committed persisted state.
Отдельная save-checkpoint таблица не вводится.

Approved local connection с `cost_kind=action`, положительным
`action_units` и `base_minutes=null` исполняется существующим owner
`timed_traversal`. Его traversal interval сохраняет нулевое planned elapsed:
часы не продвигаются, если не закоммичена отдельно утверждённая additive
hazard delay. Сценарий не подменяет это отсутствующим минутным cost profile.

## Boundary

Local scene и boundary crossing являются независимыми capability gates.
Неполный boundary skeleton остаётся staging candidate и не компилируется в
production route records. Исполнимый crossing допускается только после
source-bound approval всех directed segment, environment, cost, timing,
recheck, risk, check и consequence dependencies.
