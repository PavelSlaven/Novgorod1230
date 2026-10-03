# Интерфейс и UX

## Статус и граница миграции

Этот документ задаёт **target materialization v3** для player projection.
Принятое историческое P28 evidence не меняло production composition. До
отдельного `versioned production activation cutover` active production
остаётся materialization v2; target UI contract не включает runtime
activation, dual write или v3→v2 fallback. UI читает player-safe projection и
никогда не является источником factual topology, readiness или layout-derived
semantics.

Temporal World v4 требует `VisiblePackagePersistenceEnvelope`: code-owned
projector формирует player-safe factual package до commit, package сохраняется
атомарно со state change, а UI и narrator читают его только после commit.
Narration, layout и browser payload не могут добавить temporal fact,
consequence, schedule, route или hidden candidate.

Active O2b сохраняет ту же projection boundary для existing containers.
Visible template-backed container может показываться до открытия, но concrete
ordinary children со state `concealed` отсутствуют в player-safe package до
успешного combined P16. Concealed ordinary — не hidden authority: он не несёт
clue/evidence, authentic document, hidden history или secret-cache truth.
После атомарного container-ledger/items/open commit UI и narrator получают
только persisted approved children; failed/rolled-back batch не раскрывается.
Reload/reopen показывает exact committed contents без model/reroll. UI и
narrator не дополняют контейнер предметами, не пересчитывают mass/packing и не
показывают server ledger/profile diagnostics. Template-less containers O2b не
поддерживаются.

## 1. Player-safe movement and knowledge projection

Игрок получает intent-oriented movement options, а не скрытые IDs, все factual routes или candidate diagnostics. Каждая видимая опция сообщает только допустимую player-safe цель/направление, наблюдаемые условия, безопасно объяснённую readiness и последствия, которые персонаж может воспринять или знать.

```text
mechanical_readiness = ready | requires_frontier_resolution
                     | requires_preparation | temporarily_blocked | data_gap
knowledge_visibility = visible | hidden | misidentified
```

`ready` может показывать выполнимое намерение, но не обязан раскрывать endpoint chain. `requires_frontier_resolution` и `requires_preparation` показываются как нейтральное ожидание/подготовка без hidden topology, capacities, candidate IDs, internal validators или причины, недоступной персонажу. `temporarily_blocked` показывает наблюдаемое препятствие только в разрешённом knowledge scope. `data_gap` не раскрывает техническую диагностику: игрок видит безопасный отказ или необходимость вернуться к другому действию; полный typed error остаётся в development diagnostics.

`hidden` route, frontier, NPC motive, item slot, exact cost, internal route binding и candidate-set contents не попадают в игровой экран. `misidentified` отображается лишь как belief/слух/неуверенная ориентировка, не как factual correction. Свободный ввод игрока остаётся намерением и не подтверждает существование маршрута или объекта.

## 2. Route, scene and map behavior

Scene view отображает visible G6 и доступные `scene_position` relations только через perception/knowledge projection. Route map отображает известные или наблюдаемые связи, never factual topology by default. Линии, координаты, слои, zoom и визуальная близость — presentation only: они не создают containment, movement edge, distance, route cost или readiness.

Карта может явно показывать неизвестность, неполноту и ошибочное знание, но не может автоматически дорисовывать hidden branch. Отсутствие `visual_map_ready` не блокирует movement/simulation; отсутствие `semantic_ready` не маскируется layout или prose. UI не выводит G7/G8 и не превращает visual anchor в новый G-level.

## 3. Interruption, stranded state and diagnostics boundary

При interruption UI показывает только player-safe состояние: текущую наблюдаемую сцену/anchor, доступные безопасные действия, последствия для персонажа и то, что дальнейшее движение требует нового решения. `stranded` не получает invented nearest endpoint, скрытый teleport или ложную карту; интерфейс сообщает ограничение без раскрытия recovery topology.

Development diagnostics отделены от игрового UI: они могут содержать typed errors, traces, candidate diagnostics и raw payloads только в явном developer context. Ни журнал, ни prose, ни browser payload player-facing слоя не должны их включать. Target traceability: `spatial_architecture_standard_g0_g6.md` §§1.5, 7, 9, 14 и Appendix A §§A.7–A.8.

---
