# @rus/space-map

## Назначение

Pure spatial contracts for canonical G0–G5, party G5/G6 and scene positions;
typed topology, orientation and factual context. Код модуля работает only with
supplied data and does not create world entities. Принятое историческое P28
evidence не меняло composition; последующий `versioned production activation
cutover` release `spatial-v3-production-v1` сделал v3 sole production owner.

## Владеет

- closed spatial refs, direct containment, G1 grid and class/facet validation
- separated directed physical, visibility and acoustic topology indexes
- integer-millidegree orientation transforms and factual context snapshots
- explicit v2 migration/shadow adapter boundary

## Не делает

- route traversal decisions
- map knowledge visibility
- database queries or layout rendering
- Spatial semantic materialization proposal/resolution: `@rus/materialization`
  owns it. This module supplies only spatial contracts and committed scope;
  it never creates or changes topology, routes, baselines or positions.

## Public API

- Default `@rus/space-map`: `SPATIAL_REF_KINDS`, direct containment/G1-grid/classification validation, typed physical/perception topology indexes, orientation and factual-context helpers.
- `@rus/space-map/spatial-v2-compat`: only an explicit `migration` or `shadow_fixture` adapter with reviewed mappings; it is never part of v3 composition.
- `@rus/space-map/spatial-v3`: `createSpatialContextLoader`, `createSpatialTopologyRepository` (P08 target stubs)

## Контракты и инварианты

Входы являются plain-object/array значениями. Default API не принимает dangling или cross-kind topology endpoints и не выводит physical relation из containment, координат, canvas или title. Функции не придумывают отсутствующие ID, имена, предметы, причины или последствия. Выходы, которые предназначены для handoff, замораживаются. Нарушения структуры возвращаются как `{ ok, errors }` либо выбрасываются только для неверно подключённого технического порта.

## Зависимости

Разрешены только `@rus/kernel` и `@rus/contracts`. Запрещены импорты из `apps`, `legacy`, UI, БД, конкретного LLM provider и соседних workflow stages.

## Ошибки

Структурные ошибки возвращаются списком. Ошибки обязательных технических портов (`RandomSource`) являются `TypeError`/`RangeError`.

## Совместимость и тесты

Default entrypoint is v3-only. Legacy graph/position functions are available
solely through the explicit fixture adapter with `mode: migration |
shadow_fixture`; it is not imported by v3 composition. Production v2 is only
an explicit migration/rollback source. Unit/contract tests are in
`test/domain.test.js` and `test/spatial-v3/p17-space-map.test.js`.
