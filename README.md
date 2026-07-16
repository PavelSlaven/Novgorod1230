# Русь XIII век

**«Русь XIII век»** — историческая текстовая RPG-симуляция с постоянным миром, свободным вводом действий и LLM-управляемым повествованием.

Игрок действует как человек своей эпохи: путешествует, общается, торгует, работает, исследует местность, вступает в конфликты и сталкивается с последствиями собственных решений. Мир сохраняет время, положение персонажа, состояние мест, NPC, предметы, отношения, знания и произошедшие события.

Редакторские каталоги задают категории, шаблоны, профили, правила и историю. Код детерминированно материализует конкретные G5, NPC, предметы и последствия из этих данных. LLM создаёт персонажа игрока и прозу, проводит аудит и принимает только формально ограниченные решения.

Первым подробно разрабатываемым регионом является Новгородская земля около 1230 года. Карта строится как вложенный граф G0–G5: от исторического региона и дневных территорий до конкретных мест, локаций и точек сцены.

Проект находится в активной разработке и пока не является законченной игрой.

## Основные принципы

- свободный текстовый ввод вместо жёсткого списка команд;
- устойчивое состояние мира и память последствий;
- разделение видимой игроку информации и скрытого состояния симуляции;
- историческая, социальная и материальная правдоподобность;
- модульные LLM-этапы с отдельными валидацией, аудитом и repair;
- read-only база канонического мира и отдельное изменяемое состояние каждой партии;
- вложенная графовая карта G0–G5 и карта знаний персонажа.

## Архитектура

Проект организован как набор изолированных модулей с формальными контрактами.

- `packages/new-game` — конвейер создания новой игры, Stages 2–26;
- `packages/materialization` — code-only materializer v2 и bounded decision protocol;
- `packages/turn` — обработка игрового хода;
- `packages/narration` — генерация player-facing прозы из разрешённого видимого контекста;
- `packages/presentation` — модели первого экрана и игрового хода;
- `apps/game-server` — сервер и production composition;
- `apps/game-web` — игровой веб-интерфейс;
- `infra/world-base` — read-only схема канонической базы мира;
- `data/knowledge-source` — нормативный корпус проекта;
- `tools/world-catalog-workflow` — подготовка и проверка региональной карты.

Главное архитектурное правило:

```text
Код не придумывает категории, историю и отсутствующие варианты.
Код материализует экземпляры из утверждённых profiles/rules; LLM выбирает только из закрытых команд.
```

## Быстрый запуск

Требуется Node.js 22+.

```bash
npm ci
npm test
npm start
```

CLI-запуск:

```bash
npm run start:cli
```

## Основная документация

- [Индекс модулей](MODULE_INDEX.md)
- [Правила модулей](docs/architecture/MODULE_RULES.md)
- [Правила зависимостей](docs/architecture/DEPENDENCY_RULES.md)
- [Политика контрактов](docs/architecture/CONTRACT_POLICY.md)
- [Политика knowledge-source](docs/architecture/KNOWLEDGE_SOURCE_POLICY.md)
- [Конвейер новой игры](docs/pipelines/new-game.md)
- [Конвейер игрового хода](docs/pipelines/turn.md)
- [Схема world_base](infra/world-base/SCHEMA_REFERENCE.md)
- [Высший норматив materialization v2](data/knowledge-source/corpus/DOCUMENTS/code_driven_world_materialization_architecture.md)

## Нормативный корпус

Канонические документы находятся в:

```text
data/knowledge-source/corpus/DOCUMENTS
```

Проверка и генерация производных представлений:

```bash
npm run knowledge:check
npm run knowledge:generate
npm run docs:check
```

Graph и RAG являются производными представлениями корпуса и хранятся в `generated/knowledge-source`.

## Карта Новгородской земли

Технический контур подготовки региональной карты находится в:

```text
tools/world-catalog-workflow
data/world-catalogs/novgorod
schemas/world-catalogs
```

Проверка ревизии карты:

```bash
npm run test:world-catalog
npm run world-catalog:validate-novgorod-revision
```

Инструменты карты валидируют утверждённые данные и формируют планы импорта, но не создают исторические факты, названия, маршруты, NPC или предметы.

## Архив разработки

Завершённые планы, отчёты, parity-материалы и evidence предыдущей архитектурной перестройки сохранены в [архиве](docs/migration/README.md). Они не описывают текущий статус игры и не являются основной точкой входа в документацию.

## RAG readiness — текущая работа

### Цель

Привести RAG нормативного корпуса к формальному правилу полноты metadata, status-aware retrieval, явной фиксации semantic gaps и проверяемых контрольных запросов.

### Выполненные изменения

- добавлен `data/knowledge-source/retrieval-policy.json` с metadata для всех 28 зарегистрированных документов;
- зарегистрированы нормативный приоритет, подсистемы, связи с документами, модулями и контрактами, поисковые термины и semantic coverage disposition;
- добавлен отдельный `createKnowledgeRagReader`, не изменяющий совместимость существующего full-text reader;
- ranked retrieval работает только по committed semantic/lexical RAG chunks и возвращает provenance каждого результата;
- `active` используется по умолчанию; `proposed` и `deprecated` требуют явного разрешения и запроса;
- stale corpus/policy/RAG pins, отсутствующая metadata и ложное semantic coverage завершаются typed failure;
- добавлены контрольные top-k запросы и readiness report;
- добавлены unit, negative и repository contract tests.

### Принятые решения

Lexical ranking не объявляется семантическим поиском. Текущие 23 документа без утверждённых embeddings зафиксированы как `baseline_gap`; пять документов с approved snapshot отмечены как `covered`. Для новых изменений используется `required_before_merge`, если semantic snapshot не обновляется в том же PR.

### Структура результата

- policy registry: `data/knowledge-source/retrieval-policy.json`;
- validation/ranking: `packages/knowledge-source/src/domain/`;
- read-only retrieval service: `packages/knowledge-source/src/services/rag-reader.js`;
- filesystem port: `packages/knowledge-source/src/adapters/filesystem-storage.js`;
- нормативная техническая политика: `docs/architecture/KNOWLEDGE_SOURCE_POLICY.md`;
- tests: `packages/knowledge-source/test/rag-*.test.js`.

### Порядок интеграции

Изменения объединяются одним PR. Сначала проходят knowledge-source tests и полный CI, затем обязательный аудит критика. Merge допустим только при `PASS` или допустимом `PASS WITH NOTES`.

### Выполненные проверки

Локально выполнены синтаксические проверки новых JavaScript-модулей и `node --test packages/knowledge-source/test/rag-retrieval.test.js` на изолированном fixture: 6 тестов прошли. Полные repository checks выполняются CI PR.

### Обязательный аудит

Результат критика фиксируется в PR после CI. До получения `PASS` или допустимого `PASS WITH NOTES` работа считается незавершённой.

### Известные ограничения и оставшиеся задачи

Approved embeddings существуют только для 5 из 28 документов. Остальные 23 документа имеют полноценное lexical coverage, но остаются явным semantic coverage debt. Их embedding snapshot должен обновляться редакторским процессом без deterministic или эвристического fallback.
