# Импорт `world_base`

Канонический импорт воспроизводится из чистого checkout. Утверждённые входные файлы находятся в tracked-архиве `data/world-base-sources/rus13-base-v1.tar.gz`; его состав, размеры и SHA-256 зафиксированы в `rus13-base-v1.manifest.json`.

Python importer валидирует и преобразует данные, но не придумывает отсутствующие факты. Неизвестный путь, отсутствующий файл, несовпадение digest, ошибка cross-reference либо FK являются hard block.

## 0. Подготовка

Установите Python-зависимости и соберите ignored staging:

```bash
python -m pip install -r tools/rus13-world-base-importer/requirements.txt
npm run world-db:prepare-staging
```

По умолчанию staging создаётся из tracked bundle и не зависит от пользовательского `Desktop`.

Для редакторской пересборки из внешнего каталога требуется явный override:

```text
RUS13_BASE_SOURCE_ROOT=C:\path\to\БАЗА
RUS13_NOVGOROD_SOURCE_ROOT=C:\path\to\БАЗА\по регионам\НОВГОРОДСКИЙ РЕГИОН
RUS13_BASE_INPUT_ROOT=C:\temporary\rus13-base-staging
```

Один `RUS13_BASE_SOURCE_ROOT` переключает staging в режим `external_authoring_override`. Неявного fallback на `Desktop/Русь 13 ВЕК/БАЗА` нет.

## 1. Dry run и FK-аудит

```bash
npm run world-db:import:dry-run
npm run world-db:fk-audit:staged
```

Importer report обязан содержать `0 errors`, staged FK audit — `0` блокирующих нарушений. SQL для ручной проверки формируется отдельно:

```bash
npm run world-db:import:emit-sql
```

## 2. Применение

```bash
npm run world-db:up
npm run world-db:seed
npm run world-db:import:apply
npm run world-db:fk-audit:db
node scripts/seed-world-base.js --check
```

`world-db:seed` выполняет `DROP SCHEMA world_base CASCADE`. После успешного импорта его нельзя запускать повторно без нового полного импорта.

## 3. Региональные шаблоны

```bash
npm run world-db:import:novgorod-regional:dry-run
npm run world-db:import:novgorod-regional:emit-sql
npm run world-db:import:novgorod-regional:apply
```

Этот контур загружает региональные rules/templates и не активирует map revision автоматически. Активация разрешена только после import report, post-import validation, runtime visibility и digest gate.

## 4. Runtime preflight

Новые партии используют только нормализованную схему `party_runtime_v2`:

```bash
npm run party-db:seed
npm run new-game:preflight
```

`party-db:seed` применяет `schemas/party-db/001_party_runtime.sql`. Preflight проверяет `WORLD_DATA_SOURCE=postgres`, runtime `DATABASE_URL`, LLM credentials, staged Novgorod G1–G4 sources, импортированные строки `world_base` и обязательные таблицы схемы `party_runtime`.

Если `PARTY_DATABASE_URL` отсутствует, используется документированный порядок: `WORLD_DB_ADMIN_URL`, затем `DATABASE_URL`, затем `POSTGRES_*`.

## 5. Текущий статус Новгородской revision 002

```text
approval_status = draft
production_import_status = not_performed
runtime_visibility_status = not_verified
```

Статическая подготовка и production candidate не являются production import. До прохождения apply/readback/runtime E2E запрещено присваивать G1 статус `approved_local` или активировать revision 002.
