# Реестр нормативных конфликтов Spatial v3

Статус: исторические conflict rows закрыты принятым target implementation
evidence, но не активировали production. Active materialization v2 остаётся
единственным production runtime до отдельного `versioned production activation
cutover`. Значения P02–P28 в таблице ниже — исторические phase labels, не
будущая activation boundary.

| ID | Active v2 wording / source | Target v3 exact replacement | Решение | Owner file | Activation phase |
|---|---|---|---|---|---|
| NC-01 | `code_driven_world_materialization_architecture.md`: `world_base` содержит G0–G4. | Standard §0.1, §3.1: `world_base` содержит canonical G0–G5, routes, templates и profiles. | Обновить норматив и DDL без ранней активации. | `code_driven_world_materialization_architecture.md` | P02/P09/P28 |
| NC-02 | `read_only_database_and_graph_architecture.md`: G5 materialized только в party. | Standard §0.1, §5: canonical G5 плюс finite party-generated G5. | Разделить canonical и generated ownership. | `read_only_database_and_graph_architecture.md` | P02/P09/P13/P28 |
| NC-03 | `map_g0_g4_workflow.txt`: рабочая карта заканчивается G4. | Standard §2: G0–G5 canonical, G6 party scene, position внутри G6. | Заменить модель масштаба. | `map_g0_g4_workflow.txt` | P03/P28 |
| NC-04 | `movement_locations_regions.txt`: движение опирается на G4/G5 без scene-position topology. | Standard §4, §9–§10: directed physical topology и exact endpoint snapshots. | Ввести route/scene contracts. | `movement_locations_regions.txt` | P03/P17/P28 |
| NC-05 | `world_generation_and_turns.txt`: first-entry создаёт party G5 как сцену. | Standard §5–§6: preparation сначала создаёт/проверяет approved G5, затем G6 baseline. | Разделить expansion и scene materialization. | `world_generation_and_turns.txt` | P03/P17/P28 |
| NC-06 | `base_turn_orchestration.txt`: cross-G4 movement materializes G5 в ходе. | Standard §6, §9–§10: proposal/commit, immutable plan и no mixed v2/v3 path. | Перевести orchestration на v3 owner. | `base_turn_orchestration.txt` | P03/P22/P28 |
| NC-07 | `time_system.txt`: длительность не обязана хранить exact rational progress. | Standard §11: slicing-independent rational arithmetic. | Добавить exact time contract и persistence. | `time_system.txt` | P04/P16/P20/P28 |
| NC-08 | `interface_ux.md`: UI map может быть источником локальной навигации. | Standard §1.9, §4: visual layout не выводит topology. | Сделать UI consumer-only. | `interface_ux.md` | P04/P23/P28 |
| NC-09 | `infra/world-base/SCHEMA_REFERENCE.md`: schema v2 не имеет canonical G5/routes. | Standard §3, §13: v3 normalised world and party domains. | Генерировать reference из v3 DDL. | `infra/world-base/SCHEMA_REFERENCE.md` | P09/P26/P28 |
| NC-10 | Active v2 допускает legacy compatibility composition. | Standard §15–§16: storage coexistence без dual write и forbidden mixed mode. | Atomic cutover; v2 только rollback/migration source. | `docs/adr/ADR-001-materialization-v3-spatial-g0-g6.md` | P25/P28 |
