# Импорт пакета БАЗА

Канонический путь загрузки `world_base` — Python importer из пакета `БАЗА`.
Код не создаёт факты мира: staging только копирует и распаковывает утверждённые файлы, importer валидирует и загружает их в `world_base`.

## 0. Staging

По умолчанию source root берётся из `Desktop/Русь 13 ВЕК/БАЗА`, staging пишется в ignored `data/rus13-base-staging/`.

```bash
npm run world-db:prepare-staging
```

Переопределения:

```bash
RUS13_BASE_SOURCE_ROOT="C:\Users\Slaven\Desktop\Русь 13 ВЕК\БАЗА"
RUS13_NOVGOROD_SOURCE_ROOT="C:\Users\Slaven\Desktop\Русь 13 ВЕК\БАЗА\по регионам\НОВГОРОДСКИЙ РЕГИОН"
RUS13_BASE_INPUT_ROOT=data/rus13-base-staging
```

Скрипт копирует root CSV/XLSX, кладёт региональные файлы в `nov_region_audit/`, распаковывает nested zip в пути из manifest и печатает missing list + `sha256`/size summary.

## 1. Dry Run

```bash
npm run world-db:import:dry-run
npm run world-db:fk-audit:staged
```

Ожидание: importer report содержит `0 errors`; FK audit staged возвращает `0`.

## 2. Apply

Перед apply нужна пустая/актуальная schema v2:

```bash
npm run world-db:up
npm run world-db:seed
npm run world-db:import:apply
npm run world-db:fk-audit:db
node scripts/seed-world-base.js --check
```

`world-db:seed` делает `DROP SCHEMA world_base CASCADE`. После успешного Python import не запускайте `world-db:seed` повторно без повторного import.

## 3. Regional Templates

Оставшиеся Новгородские шаблоны грузятся отдельным импортёром:

```bash
npm run world-db:import:novgorod-regional:dry-run
npm run world-db:import:novgorod-regional:emit-sql
npm run world-db:import:novgorod-regional:apply
```

Этот importer покрывает `region_place_generation_rules`, `place_generation_limits`, `rumor_templates`, `conflict_templates`, `price_bands`, `seasonal_rules`, `weather_profiles`, `historical_events`, `historical_event_phases`, `item_templates` и G5 context pack в `llm_context_packs`.

Expanded `region_place_generation_rules` требует schema patch из пакета. `apply` применяет его автоматически; для ручного контроля используйте `emit-sql`.

## 4. Runtime Preflight

Перед запуском нового 26-step pipeline:

```bash
npm run world-db:import:novgorod-regional:apply
npm run party-db:seed
npm run new-game:preflight
```

`new-game:preflight` проверяет `WORLD_DATA_SOURCE=postgres`, `DATABASE_URL`, `DEEPSEEK_API_KEY`, наличие исходных Novgorod G1-G4 TSV, импортированные строки `world_base` для Новгорода и таблицы `party` из seed. Если `PARTY_DATABASE_URL` пустой, seed и preflight используют один fallback: `WORLD_DB_ADMIN_URL`, затем `DATABASE_URL`, затем `POSTGRES_*`.
