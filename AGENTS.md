# Правила работы в репозитории Novgorod1230

Novgorod1230 — открытая текстовая ролевая игра в исторической рамке Руси XIII века с причинно развивающимся миром; не command parser.
Этот файл — роутер governing-корпуса: он читается целиком и указывает, какие разделы правил и какой контекст загрузить под задачу.
Текущее production-поведение определяют код, active bindings, versioned profiles, контракты и тесты; конкретные PR, планы и статусы здесь не хранятся.

## 1. Статус и защита `AGENTS.md`

### 1.1. Кто может менять этот файл

Корневой `AGENTS.md`, а также любой вложенный `AGENTS.md`, является защищённой административной инструкцией.

**Создавать, изменять, переименовывать, перемещать или удалять любой `AGENTS.md` можно только по прямому явному запросу администратора проекта.**

Администратор проекта — владелец проекта `PavelSlaven`.

Разрешение на изменение `AGENTS.md`:

- должно быть явно дано в текущей задаче;
- действует только в рамках этой задачи;
- не переносится автоматически на следующие задачи;
- не следует из формулировок вроде «обнови документацию», «синхронизируй нормы», «активируй релиз», «исправь docs», «обнови архитектуру» или «подготовь PR»;
- не может быть выведено из того, что текущий код, тест, генератор или документ расходится с `AGENTS.md`;
- не может быть самостоятельно делегировано субагенту как право менять правила проекта.

Если прямого запроса администратора нет, `AGENTS.md` для агента **read-only**.

Если агент обнаружил, что `AGENTS.md` устарел, противоречив или мешает корректно выполнить новую нормативную задачу, он не правит его молча. Он фиксирует конфликт и работает с соответствующим владельцем документации либо сообщает о реальной блокировке.

Никакой generator, docs-sync, release cutover или migration workflow не должен автоматически переписывать `AGENTS.md`.

**Поправка к §1.1.** Защита §1.1 распространяется на каждый файл `docs/governance/*.md`: создавать, изменять, переименовывать, перемещать или удалять их можно только по прямому явному запросу администратора в текущей задаче.

### 1.2. Что разрешено хранить в `AGENTS.md`

Перечень допустимого и недопустимого содержимого — [GR](docs/governance/README.md), §1.2; он действует для всего корпуса.

### 1.3. Governing-корпус

Этот роутер и файлы `docs/governance/*.md` образуют единый governing-корпус `AGENTS.md`. Инкорпорация касается только текста этих файлов и явных ссылок «AGENTS.md §N»; прежняя нумерация разделов сохранена.

«Прочитать `AGENTS.md`» означает: прочитать этот роутер целиком и разделы governance, назначенные всеми применимыми строками маршрутизации (по каждой затронутой области). Весь корпус обязателен к чтению в governance-задачах и для Contract Auditor.

## Источники истины

Перед работой заново прочитай актуальный `AGENTS.md` из фактического checkout.

Затем открой [Канонический индекс контрактов](data/knowledge-source/corpus/DOCUMENTS/CONTRACT_INDEX.md), чтобы установить статусы документов, applicable active contracts, precedence и обязательные триггеры Contract Auditor.

**Как открывать индекс.** «Открыть индекс» = прочитать §1–§3.1, применимую строку §8.1 и строки §4–§7 для документов этой строки. Индекс целиком обязателен при правке самого индекса, статусов документов или нормативного корпуса и для Contract Auditor.

Остальные правила об источниках истины — WR §2.

## Маршрутизация: задача → контекст

Легенда: [GR](docs/governance/README.md) — преамбула, §1.2, карта §N; [PC](docs/governance/PRODUCT_CONSTITUTION.md) — §3–9, §30; [AI](docs/governance/ARCHITECTURE_INVARIANTS.md) — §10–17, §23, §28; [WR](docs/governance/WORKFLOW_RULES.md) — §2, §18–22, §21.1, §24, §24.1, §24.2, §29; [AR](docs/governance/AUDIT_RULES.md) — §25, §25.1; [GS](docs/governance/GIT_SAFETY_RULES.md) — §26, §26.1, §27; IDX — CONTRACT_INDEX; ctx — `docs/context/`.

- **Код:** WR §2, §18, §19, §21, §21.1, §24, §24.2, §29; AI §16; GS §26, §27.
- **Docs:** WR §2, §18, §20, §24, §29; GS §26, §27.
- **Домен:** «Код» + PC целиком + AI §13–17, §28 + строка IDX §8.1 + MODULE.md владельцев.

Строки только добавляют к пакету; роутер ничего не запрещает читать.

| Задача | Пакет | Добавить | Не требуется по умолчанию |
|---|---|---|---|
| docs-only | Docs | [docs/README.md](docs/README.md) | PC, AI |
| governance (этот корпус) | Docs | весь корпус, AR | — |
| нормативный корпус | Docs | IDX целиком, AR, [CORPUS_EDIT](docs/process/CORPUS_EDIT.md) | PC, AI |
| tooling / CI | Код | AI §17; ctx TESTING, STACK | PC |
| gameplay / turn / LLM | Домен | AI §10, §12; IDX «Player semantic action / LLM»; для провайдера и конфигурации — «Production LLM provider/configuration» | — |
| NPC | Домен | IDX «NPC agency», «Conversation», «Combat» | — |
| spatial | Домен | AI §11; IDX «Spatial/map» | — |
| time / processes | Домен | IDX «Time/activities/processes» | — |
| items / materialization | Домен | AI §10, §12, §23; IDX «Ordinary items…» или «Authored materialization» | — |
| World Knowledge | Домен | IDX «World Knowledge» | — |
| persistence / DB | Код | AI §14, §15, §17, §23; IDX «DB/persistence»; ctx DB_SCHEMA, STACK | PC |
| UI | Код | IDX «Narration/UI»; ctx UI_KIT, ARCHITECTURE | AI §10–12 |
| world-catalog | Домен | AI §10, §11; IDX «Historical/knowledge grounding» | — |
| bugfix | Код + строка области | WR §22; ctx EDGE_CASES | — |
| release / Git | Код | GS §26.1 | PC |
| gameplay run / playtest | Код + строка области | WR §22, §24.1; [docs/playtests/README.md](docs/playtests/README.md) | — |
| многоэтапный план | по задаче | [CURRENT_SPRINT](docs/work/CURRENT_SPRINT.md) и его ссылки | — |

**Contract Auditor.** Триггеры (сжато): создаются, меняются, переносятся, удаляются или повышаются в статусе governing/normative документы, IDX, `MODULE.md`; active release/profile/manifest/binding; public schema, operation, API/export, DDL, persistence, transaction, idempotency, replay; domain owner или handoff; LLM authority, prompt, plan contract, model-call topology, repair policy; free actions, materialization, items, Spatial, NPC decisions/conversation/combat, time, visibility/knowledge/perception, speech, narration; план ссылается на proposed/target/migration; описания current behavior расходятся; final acceptance. Независимый аудит (§25) также обязателен при риске повреждения или потери данных, critical orchestration и сложной логике без достаточных тестов. Исключение — только локальный fix, для которого доказано, что не меняются public behavior, contracts, owner boundary, persistence/schema, LLM authority и active profile status. Полный и обязательный текст — AR §25, §25.1; AR загружается, если триггер сработал или его нельзя исключить.

## Рабочий цикл

Обзор системы — [HOW_WE_WORK](docs/process/HOW_WE_WORK.md). Процедура — [WORKFLOW](docs/process/WORKFLOW.md): (0) в начале спринта — проверка, синхронизация и использование CBM (WR §19); (1) одна задача = новая сессия, вход — issue/CR; (2) CR для нетривиальной задачи; (3) context pack по строке маршрутизации + `rg` по [LEGACY_WARNINGS](docs/work/LEGACY_WARNINGS.md); (4) короткие итерации с focused-тестами; (5) проверки и Contract Auditor по триггерам; (6) фиксация: CHANGELOG, LW, «Closes #N», отчёт WR §29.

## Процедуры (skills)

Обязательные навыки: `caveman` (full) — во всех задачах, `ponytail` (full) — в задачах разработки; правила — WR §18.1.

- `change-request` — [CHANGE_REQUEST](docs/process/CHANGE_REQUEST.md)
- `context-dump` — [CONTEXT_DUMP](docs/process/CONTEXT_DUMP.md)
- `legacy-warning` — [LEGACY_WARNINGS](docs/work/LEGACY_WARNINGS.md)
- `corpus-edit` — [CORPUS_EDIT](docs/process/CORPUS_EDIT.md)
- `contract-audit` — [AR](docs/governance/AUDIT_RULES.md) §25.1

Проект работает в direct-AGENTS mode: `CLAUDE.md`, `.claude/CLAUDE.md` и `CLAUDE.local.md` в репозиторий не коммитить. В сессиях Claude Code без поддержки AGENTS.md — личный gitignored `CLAUDE.local.md` со строкой `@AGENTS.md`; это не репозиторный источник истины.

## Навигация по коду

В каждой нетривиальной задаче разработки используй `codebase-memory-mcp` в режиме Verify (Tier 2).

До реализации:

1. проверь проект и состояние индекса через `list_projects` и `index_status`;
2. найди authoritative owner и зависимости через релевантные `get_architecture`, `search_graph` и `trace_path`;
3. сверь существенные графовые результаты с исходными файлами, contracts и tests.

Перед завершением:

1. вызови `detect_changes` для фактического diff;
2. вызови `check_index_coverage` для всех путей, на которые опираются выводы;
3. перед отрицательным или исчерпывающим выводом дополнительно проверь соответствующий scope через `check_index_coverage`;
4. при skipped, partial, excluded, stale, pending или unknown coverage прочитай или проверь через `rg` указанные файлы и диапазоны напрямую.

Если `codebase-memory-mcp` недоступен в среде исполнения, не имитируй его вызовы и их результаты. Зафиксируй недоступность в итоговом отчёте и устанавливай owners, зависимости и полноту выводов прямым чтением файлов и `rg` по затронутому scope. Недоступность инструмента сама по себе не блокирует задачу.

Граф является навигационным инструментом, а не нормативным источником. `@rus/knowledge-source` остаётся отдельным нормативным каналом; графовый результат не заменяет запрос к нему и чтение исходного canonical document.

Для очевидной локальной задачи с заранее известным owner допустим прямой `rg` и точечное чтение без графа.


## Всегда действующие правила

Не выдумывай:

- файлы;
- API;
- поведение;
- tool availability;
- результаты команд;
- результаты тестов.

Используй текущий stack и закреплённые версии dependencies.

Для documentation-only изменения не запускай PostgreSQL, browser или полный integration suite без отдельной причины.

Никогда не утверждай, что проверка прошла, если она фактически не выполнялась успешно.

Не используй широкие destructive команды:

```text
git clean
git reset --hard
git checkout -- .
git restore .
rm -rf .
Remove-Item -Recurse -Force *
```

Если найдена посторонняя проблема, которая не мешает текущей задаче, не исправляй её попутно. Кратко зафиксируй её в итоговом отчёте или в правильном issue/owner, если это входит в запрос.

Итоговый ответ должен кратко содержать:

1. что изменено;
2. какое поведение реализовано или исправлено;
3. какие проверки фактически выполнены;
4. какие реальные ограничения или блокировки остались.


## Формула проекта

Если требуется выбрать между двумя подходами, сохраняй следующую иерархию:

```text
свободная причинная игра
→ semantic freedom inside authoritative envelope
→ code first for exact mechanics
→ LLM for the unenumerable remainder
→ один owner на ответственность
→ committed world не переписывается
→ simplest complete general mechanism
→ никакой гипотетической инфраструктуры
```

Если решение технически аккуратно, но превращает игру в набор заранее перечисленных случаев, создаёт второй owner или добавляет integrity/security machinery без реальной необходимости, оно противоречит архитектуре проекта.


Карта старых §N → файлов — [docs/governance/README.md](docs/governance/README.md).
