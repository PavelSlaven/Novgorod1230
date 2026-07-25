# Карта production integration contracts

## Composition

`builtin:production-spatial-v3` → `createSpatialV3ProductionCompositionRoot`

Обязательный внешний binding обязан предъявлять точные `releaseBinding` и
`runtimeCatalogPin`, а также:

- `targetCompositionPorts`;
- `commitRecheck(input)`;
- `acknowledgeOpening(input)`;
- `getPartyScreen(input)`.

`production-v2` отсутствует в runtime loader. Его infrastructure exports и
непубличный root допускаются только как явно названный migration/rollback
source и не являются selectable composition.

## Infrastructure ports

- `worldBase` — только target-v3 read-only projection;
- `committer.commit(writePlan)` — единственная PostgreSQL-транзакция
  combined write plan;
- domain ports — чистые handlers без скрытых DB/FS/network/LLM reads.

## Runtime tables

Schema `party_runtime`:

- `parties` с `schema_version=3` и exact release pins;
- `party_catalog_pins`;
- target-v3 journey, traversal, first-entry, perception, reaction,
  knowledge и visible-package relations;
- presentation-pending metadata.

Эти таблицы технические. Они не определяют мир, игровые сущности или последствия.

## Browser E2E boundary

`game-web bundle` → `/api/v1/new-games` → `FirstGameScreen` → `/opening-ack` → `/turns` → `TurnScreen`.

На каждом public boundary действует hidden-field validation.
