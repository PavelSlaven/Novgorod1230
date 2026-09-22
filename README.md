# Русь XIII век

**«Русь XIII век»** (Novgorod1230) — историческая текстовая RPG-симуляция с постоянным миром, свободным вводом действий и LLM-управляемым повествованием.

Игрок действует как человек своей эпохи: путешествует, общается, торгует, работает, исследует местность, вступает в конфликты и сталкивается с последствиями собственных решений. Мир сохраняет время, положение персонажа, состояние мест, NPC, предметы, отношения, знания и произошедшие события — и продолжает жить без нового ввода игрока, когда для этого есть причинное основание.

Первый подробно разрабатываемый регион — Новгородская земля около 1230 года. Карта строится как вложенный граф G0–G5: от исторического региона и дневных территорий до конкретных мест, локаций и точек сцены.

Проект находится в активной разработке и пока не является законченной игрой.

## Статус

- Текущие задачи и порядок работ — [CURRENT_SPRINT](docs/work/CURRENT_SPRINT.md) (производная выжимка) и GitHub Issues / milestones.
- Изменения — [CHANGELOG](CHANGELOG.md), секция `Unreleased`.
- Известный техдолг — [LEGACY_WARNINGS](docs/work/LEGACY_WARNINGS.md).

## Текущий runtime

Локальный запуск использует актуальный production release Spatial v3 (точная ревизия — в active bindings и `MODULE.md` владельцев, не в этом файле). Spatial v3 и Temporal World v4 — единственные владельцы authoritative reads/writes; runtime fallback запрещён. `versioned production activation cutover` завершён.

Свободный ввод проходит через единую semantic boundary `turn_step_request_v1` → `turn_step_plan_v1` в `@rus/turn`. Время, RNG, механика и persistence остаются code-owned. Перед semantic LLM-вызовами runtime подмешивает компактный срез World Knowledge для текущего региона; factual claims не создают state и не заменяют механику кода.

## Принципы

- свободный текстовый ввод вместо списка команд: игрок может попытаться сделать любое осмысленное действие, результат определяется реальностью мира;
- код владеет известной механикой и authoritative state, LLM — неизвестной семантикой (намерение, свободная речь, решения NPC, ordinary-детали) внутри authoritative envelope;
- произошедшее фиксируется и не переписывается; save/load и retry не перерешивают события;
- NPC — самостоятельные участники мира и проходят ту же механику, что и игрок;
- историческая, социальная и материальная правдоподобность без тяжёлой архитектуры «на будущее»;
- одна ответственность — один владелец; простейший полный общий механизм.

Полная формулировка — governing-корпус [AGENTS.md](AGENTS.md) (продуктовая конституция — [docs/governance/PRODUCT_CONSTITUTION.md](docs/governance/PRODUCT_CONSTITUTION.md)).

## Архитектура

Модульный монорепозиторий (npm workspaces `apps/*`, `packages/*`, `tools/*`) с формальными контрактами:

- `packages/*` — доменные владельцы: ход (`turn`), время, NPC, предметы, пространство, материализация, повествование и др.;
- `apps/game-server` — сервер и production composition; `apps/game-web` — веб-интерфейс;
- `infra/world-base`, `schemas/` — схемы read-only канонической базы мира и изменяемого состояния партии;
- `data/knowledge-source` — нормативный корпус; `data/world-catalogs` — региональные каталоги;
- `tools/*` — проверки, генераторы и подготовка каталогов.

Карта папок, слои и лимиты — [docs/context/ARCHITECTURE.md](docs/context/ARCHITECTURE.md); модули — [MODULE_INDEX](MODULE_INDEX.md).

## Быстрый старт

Нужен Node.js 22+.

```powershell
npm ci
npm run play:local
```

`npm run play:local` при первом запуске сам подготавливает локальное окружение (PostgreSQL, Python, embeddings, LLM-провайдер); после readiness откройте <http://127.0.0.1:3000>. Повторный запуск использует ту же party DB. Выбор и настройка LLM-провайдера — [docs/setup/LLM_PROVIDERS.md](docs/setup/LLM_PROVIDERS.md); детали launcher — [tools/local-play/MODULE.md](tools/local-play/MODULE.md).

`npm start` — low-level entry для уже подготовленного production environment; пользовательский provisioning он не выполняет.

Стек и версии — [docs/context/STACK.md](docs/context/STACK.md); какие проверки запускать — [docs/context/TESTING.md](docs/context/TESTING.md).

## Документация

Карта всей документации и правила размещения новых документов — [docs/README.md](docs/README.md).

- нормативные контракты и их статусы — [Канонический индекс контрактов](data/knowledge-source/corpus/DOCUMENTS/CONTRACT_INDEX.md);
- поиск по нормативному корпусу — `npm run knowledge:query -- --query "<потребность>"`;
- карты проекта — `docs/context/`; процедуры — `docs/process/`;
- архив прошлой миграции — [docs/migration/README.md](docs/migration/README.md); снятые инструкции агентов и журналы — [docs/archive/README.md](docs/archive/README.md).

## Для агентов разработки

Точка входа — [AGENTS.md](AGENTS.md): короткий роутер, который указывает, какие правила и какой контекст загрузить под задачу. Рабочий цикл — [docs/process/WORKFLOW.md](docs/process/WORKFLOW.md).
