# Система видимости, слышимости и реакций NPC

**Статус:** proposed
**Версия:** 0.1.0
**Область:** зрительное и слуховое восприятие игрока и NPC, распространение сенсорных сигналов, скрытность, внимание, настороженность, свидетели и реакции NPC.
**Период игры:** 1230–1250 годы.
**Целевой runtime:** `party_runtime v2`.
> Этот документ фиксирует целевую систему и не включает её в production runtime. До полной реализации и отдельного `PASS` критика действуют active-нормативы более высокого приоритета. Предложение не разрешает fallback, изменение старых партий или раскрытие скрытого состояния.

## 1. Назначение и граница ответственности

Система должна кодом определять:

1. какие сенсорные сигналы причинно возникли;
2. как они распространяются по сохранённому сценическому графу G5;
3. какие наблюдатели их физически достигают, слышат или видят;
4. уровень локализации, классификации и идентификации;
5. свидетелей, настороженность NPC и необходимость реакции;
6. результат, доступный персонажу игрока.

Расчёт симметричен для игрока, NPC, среды и действий NPC. Положение берётся из фактических G5 nodes, anchors и passages, а не из UI-координат.

Код владеет созданием сигнала, физическим распространением, слышимостью, линией зрения, обнаружением, распознаванием, свидетелями, привычностью, значимостью, переходами настороженности, candidate set реакций и последствиями выбранной команды. LLM не вправе утверждать, что персонаж услышал, увидел, распознал источник, понял речь, либо что стена, дверь или темнота пропустили сигнал.

LLM допустим только после code gates, когда для уже воспринятого значимого стимула остаются минимум две допустимые реакции. Его ответ содержит ровно один переданный `option_id` и точный `command_token`; последствия заново рассчитывает код.

Если отсутствуют обязательные профиль сигнала, профиль восприятия наблюдателя, профиль перехода, фонового шума, света, привычных звуков, policy реакции или зарегистрированный handler, операция возвращает типизированный `data_gap` и блокируется. Средние значения, «обычный слух», предполагаемая открытость двери, смысловые fallback и LLM repair запрещены.

## 2. Первая версия

В первую версию входят слух, зрение, свет и темнота, G5-расстояние, препятствия, фоновый шум, звуки действий/одежды/оружия/груза/транспорта, состояние и внимание наблюдателя, скрытное движение, привычные звуки, настороженность, свидетели, реакции NPC и вторичные звуки.

Не входят запах, тепловое восприятие, детальная физика частот и эха, 3D ray tracing, распространение между удалёнными G4, долговременные запаховые следы, медицинское моделирование нарушений чувств и галлюцинации. Для них требуется отдельный норматив.

## 3. Контракты

Все контракты versioned, immutable на входе и содержат `schema`, `version`, `party_id`, `state_version` и профильные digests там, где это применимо.

### 3.1. `SensoryEvent`

Событие создаётся только зарегистрированным consequence handler как причинное последствие действия, а не из прозы. Обязательные поля:

```text
event_id, party_id, turn_id, wave_index, modality,
source_kind, source_id, source_anchor_id, signal_profile_id,
causal_action_id, emitted_at, duration_ms, base_strength_units,
directionality_profile_id, semantic_class_id, routine_context_tags,
state_version, profile_digest
```

`modality` первой версии: `sound | visual`.

### 3.2. Каталоговые профили

`SensorySignalProfile` определяет approved параметры сигнала: modality, semantic class, strength, duration, directionality, repetition, speech capability, size/motion/light exposure, применимые actions/templates/surfaces, period, status, sources и confidence.

Каждое G5 edge ссылается на `SensoryTransitionProfile` с `sound_loss_units`, `sound_blocked`, `vision_transmission`, `vision_loss_units`, `speech_loss_units`, state/weather modifiers и material profile. `vision_transmission` имеет только `blocked | slit | partial | open`; отсутствие значения никогда не означает `open`.

`ActorPerceptionProfile` содержит `hearing_threshold_units`, margins локализации, классификации, идентификации и речи, визуальные thresholds/margins, `attention_profile_id`, `routine_sound_profile_id`, impairment bindings и state-modifier rules. Фоновый NPC получает ссылку на approved profile при materialization; он не получает параметр из роли или обстоятельств во время runtime.

`AmbientSoundProfile`, light/visibility profile, routine sound profile, reaction policy и command policy также являются approved, version-pinned authoring data. Runtime использует только применимые записи active world revision.

### 3.3. `SensorySceneSnapshot`

Чистый snapshot содержит только данные, нужные для расчёта:

```text
party_id, g4_id, state_version, clock, weather, light_state,
g5_nodes, g5_edges, g5_anchors, actor_positions,
actor_attention_states, actor_perception_profile_refs,
active_light_sources, ambient_sound_profiles,
prospective_edge_states, snapshot_digest
```

Он не является универсальным дампом партии.

`ActorAttentionState` содержит activity, focus mode/anchor, load, interruptibility, vigilance, body modifier, active listening и время обновления. Допустимые `focus_mode`: `relaxed | occupied | focused | watching | searching | sleeping | incapacitated`.

`PerceptionResult` содержит event/observer refs, modality, physical reach, `perceived`, perception level, direction, identified source/class/speech content, confidence, path, arrival strength, threshold/margin, applied profiles, check result, trace digest и state version.

## 4. Слух

### 4.1. Разделение этапов

```text
emission -> propagation -> hearing -> localization/classification/identification
-> significance -> reaction routing -> bounded decision (если нужен)
-> code consequence
```

Эти этапы не объединяются и не вызывают следующий этап самостоятельно.

### 4.2. Шкала и распространение

Используется целочисленная versioned шкала `perception_units_v1` с bounds в schema/DDL. Она является игровой абстракцией, а не децибелами.

Для каждого observer код находит в G5 путь с минимальной суммарной потерей:

```text
arrival_strength = source_strength - edge_losses - node_losses
                 - distance_loss - weather_loss
```

Поиск прекращается на `sound_blocked`, границе сцены или когда оставшиеся пути превышают допустимый предел профиля. Визуальная дистанция интерфейса не участвует.

У каждого G5 node есть approved `ambient_noise_floor`, `masking_classes`, routine classes и time/weather/activity modifiers. Фоновый шум повышает порог, а не удаляет событие.

### 4.3. Слышимость и уровни

```text
effective_threshold = hearing_threshold + activity_penalty + body_penalty
                    + impairment_penalty - vigilance_bonus - active_listening_bonus
masking_threshold = ambient_noise_floor + class_masking_modifier
final_threshold = max(effective_threshold, masking_threshold)
audibility_margin = arrival_strength - final_threshold
heard = audibility_margin >= 0
```

Каждый операнд приходит из approved profile или утверждённого состояния. Лестница результата:

```text
blocked -> below_threshold -> detected -> localized -> classified
-> identified -> speech_understood
```

Пассивное внимание использует текущий attention state. Активное слушание — отдельное доступное действие, которое меняет только утверждённые modifiers и занимает время; оно не отменяет blockers и не создаёт источник.

## 5. Зрение и скрытность

Зрительный event описывает target/source, anchor, light/motion/size exposure, semantic class и causal action. Код строит графовую линию зрения по G5 transition profiles; `blocked` edge никогда не создаёт line of sight. Потери света, заслонение, дистанция, поза, движение, состояние и внимание применяются профильными правилами.

Уровни зрения:

```text
blocked -> below_threshold -> detected -> localized -> classified -> identified
```

Скрытность не является автоматическим броском против каждого NPC. Сначала код определяет физическую возможность наблюдения. Очевидная видимость или физический blocker дают детерминированный результат. Лишь спорный случай использует утверждённый code-owned check; затем perception resolver, а не LLM, определяет свидетелей и уровень знания.

## 6. Привычность, настороженность и реакции

Услышанный звук не равен реакции. `RoutineSoundProfile` сопоставляет class, source/zone/time/activity context и policy. Совпадение routine profile может оставить NPC в `calm`; неизвестный или значимый стимул оценивается кодом по утверждённой policy.

Состояния настороженности:

```text
calm | attentive | suspicious | alarmed | engaged
```

Код применяет только разрешённые transitions, сохраняет stimulus memory, cooldown, causal event refs и trace. Никакая реакция не может быть создана для `blocked`, `below_threshold` или `no_reaction`.

`ReactionRoutingResult` содержит observer/event refs, awareness transition, significance, routing status и закрытые options. Варианты формируются из policy и registered handler после всех preconditions. Возможные статусы:

```text
no_reaction | code_reaction | bounded_decision_required | data_gap | blocked
```

- `no_reaction` — LLM не вызывается;
- ровно один code-valid option — выполняется кодом, без LLM;
- два и более valid options — создаётся request существующего bounded protocol;
- empty required option set — hard block/data gap.

LLM получает лишь NPC-visible facts, options digest, request/state/policy versions, `option_id`, `command_token`, visible reason, known risks/costs and expiry. Он не получает hidden facts игрока, physical thresholds, полный state или возможность сформировать новый plan. Ответ валидируется как exact request-bound token, затем code повторно проверяет state version и preconditions.

Каждая применённая reaction consequence может создать вторичный `SensoryEvent`; следующая волна имеет увеличенный `wave_index`, ограничение depth и idempotency key. Цикл не может сам себя бесконечно вызывать.

## 7. Visible boundary и persistence

Игрок — обычный observer. `@rus/perception` возвращает объективные `PerceptionResult`; `@rus/visibility-knowledge-memory` строит player projection только из результата персонажа игрока и его знаний. UI и prose не получают hidden awareness NPC, thresholds, raw paths, LLM call факт, policy internals или технические trace details.

После будущей реализации `party_runtime` будет хранить нормализованные sensory events, perception results/batches, attention/awareness states, stimulus memory и cycle trace. Изменения проходят через code-owned change set, allowlisted write plan и атомарный commit. `world_base` остаётся read-only; он хранит profiles, bindings, policies и catalog digests. Старые партии не получают новую систему без явной migration procedure.

Обязательные version pins: `perception_algorithm_id`, `sensory_catalog_digest`, `reaction_policy_digest`, `state_version`, profile digests и idempotency keys.

## 8. Целевая модульная архитектура

Новый будущий пакет: `@rus/perception`. Он является pure code-only engine без DB, UI, LLM transport, global state или orchestration. Его ответственность:

```text
validate sensory snapshot -> emit validated event -> resolve propagation
-> resolve perception -> evaluate awareness -> route reaction
```

Публичный API будет создан только в фазе контрактов и включает `resolveSoundPaths`, `resolveVisibility`, `resolvePerception`, `evaluateAwareness`, `routeNpcReaction` и contract validators. Пакет не формирует prose, не читает party storage, не сохраняет state и не создаёт authoring facts.

`@rus/visibility-knowledge-memory` сохраняет ownership visible/hidden boundary. `@rus/checks-rng` сохраняет ownership approved check execution и explicit RandomSource. `@rus/turn` остаётся orchestration owner; stages не знают о соседних stages.

## 9. Целевой pipeline

После реализации turn pipeline расширяется только следующими отдельными этапами:

```text
consequence
-> sensory_event_emission
-> sensory_propagation
-> perception_resolution
-> npc_reaction_routing
-> npc_reaction_decision (только при bounded_decision_required)
-> npc_reaction_consequence
-> hidden_update
-> visible_projection
```

New-game после G5 materialization будет вычислять initial perception и передавать в player-facing stages только projection игрока. Это изменение не выполняется настоящим proposed-документом.

## 10. Целевые данные и readiness

До runtime нужны normalized, approved catalog bindings для sensory signal profiles, G5 transition profiles, ambient/routine sound profiles, light/visibility profiles, NPC perception profile sets, reaction policies, decision policy options и registered code handlers. G5 templates обязаны ссылаться на sensory/visibility properties, а NPC profile sets — на perception profile.

Readiness audit блокирует отсутствие ссылок, внепериодные/неприменимые записи, ambiguity и пустые required sets. JSONB допустим лишь для versioned closed policy payloads и traces; queryable external relations нормализуются.

## 11. Ошибки, детерминизм и тесты

Типизированные ошибки включают как минимум `sensory_profile_missing`, `perception_profile_missing`, `transition_profile_missing`, `ambient_profile_missing`, `light_profile_missing`, `routine_profile_missing`, `reaction_policy_missing`, `reaction_handler_missing`, `required_candidate_set_empty`, `stale_state` и `invalid_bounded_decision`.

Детерминированный trace фиксирует input/snapshot/catalog digests, algorithm id, event/path IDs, применённые profiles, thresholds/margins, decisions и secondary-wave causality. В чистых resolvers отсутствуют `Date.now`, `Math.random`, DB access и provider calls.

Обязательные будущие тесты: contract/unit/negative/property/integration/E2E. Минимальные свойства:

```text
увеличение sound loss не улучшает слышимость;
уменьшение source strength не повышает level;
blocked vision edge не создаёт line of sight;
неуслышанный звук не создаёт reaction;
no_reaction и один valid command не вызывают LLM;
LLM не выбирает option вне закрытого набора.
```

Нужны также сценарии routine sound без реакции, минимум двух options, stale/token/precondition rejection, secondary wave, atomic rollback, hidden leak, readback и old-party isolation.

## 12. План внедрения и критерий повышения

Работа выполняется последовательно:

1. норматив, ADR и устранение документарных противоречий;
2. versioned contracts, schemas, validators и падающие тесты;
3. pure `@rus/perception`;
4. `world_base` authoring data и readiness audit;
5. `party_runtime` persistence;
6. turn integration без LLM;
7. bounded reactions, new-game, UI/prose и shadow rollout.

Статус может стать `active` только после реализации contracts/DDL/catalogs/runtime, generated references, полного набора проверок, PostgreSQL/turn/new-game/browser/shadow validation и отдельного `PASS` критика. До этого документ — архитектурное предложение, а не основание изменить production поведение.
