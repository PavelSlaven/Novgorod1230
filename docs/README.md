# Документация: карта и правила размещения

> status: REFERENCE / DOMAIN GUIDE. Карта папок `docs/**` и соседних источников. Норм не создаёт: при конфликте действует AGENTS.md, [Канонический индекс контрактов](../data/knowledge-source/corpus/DOCUMENTS/CONTRACT_INDEX.md) и профильные контракты. Проверено: 2026-09-22, commit c5501419.

## Как читать карту

- **status** — только метки CONTRACT_INDEX §2: `GOVERNING`, `ACTIVE`, `ACTIVE SPECIALIZATION`, `PROPOSED / UMBRELLA TARGET`, `MIGRATION / ROLLBACK`, `REFERENCE / DOMAIN GUIDE`, `SUPERSEDED / REDIRECT`, `UNDECLARED`. Второй шкалы нет. Папка без записи в CONTRACT_INDEX — `UNDECLARED`: её нормативную роль устанавливает владелец или Contract Auditor.
- **kind** — природа файлов: context / procedure / plan / work-digest / evidence / generated / archive / legacy / template.
- Статусы документов нормативного корпуса здесь не дублируются — смотри CONTRACT_INDEX.
- Размеры файлов не указываются: они устаревают с каждой правкой.

## Карта

| Где | status | kind | Когда загружать |
|---|---|---|---|
| `AGENTS.md` | `GOVERNING` | правила (роутер) | всегда, целиком, при старте задачи |
| `docs/governance/` | `GOVERNING` (корпус `AGENTS.md` §1.3) | правила | разделы, назначенные строкой маршрутизации роутера; целиком — governance-задачи и Contract Auditor: [карта §N](governance/README.md) |
| `data/knowledge-source/corpus/DOCUMENTS/` | по CONTRACT_INDEX | нормативный корпус | строка scope matrix CONTRACT_INDEX §8.1 для области задачи; поиск — `npm run knowledge:query` |
| `docs/context/` | `REFERENCE / DOMAIN GUIDE` | context | когда задаче нужен факт о стеке, структуре, БД, ошибках, UI, тестах: [STACK](context/STACK.md), [ARCHITECTURE](context/ARCHITECTURE.md), [DB_SCHEMA](context/DB_SCHEMA.md), [EDGE_CASES](context/EDGE_CASES.md), [UI_KIT](context/UI_KIT.md), [LINKS](context/LINKS.md), [TESTING](context/TESTING.md) |
| `docs/process/` | `REFERENCE / DOMAIN GUIDE` | procedure | обзор системы и её принципов: [HOW_WE_WORK](process/HOW_WE_WORK.md); рабочий цикл и процедуры: [WORKFLOW](process/WORKFLOW.md), [CHANGE_REQUEST](process/CHANGE_REQUEST.md), [CONTEXT_DUMP](process/CONTEXT_DUMP.md), [CORPUS_EDIT](process/CORPUS_EDIT.md) |
| `docs/work/CURRENT_SPRINT.md` | `REFERENCE / DOMAIN GUIDE` | work-digest | выбор следующей задачи: [CURRENT_SPRINT](work/CURRENT_SPRINT.md) |
| `docs/work/LEGACY_WARNINGS.md` | `REFERENCE / DOMAIN GUIDE` | work-digest | до правки — `rg` по затрагиваемым путям: [LEGACY_WARNINGS](work/LEGACY_WARNINGS.md) |
| `docs/work/temporal-world-v4/` | `UNDECLARED` | evidence | только задачи temporal v4; файлы читают tools (LW-010) — не переносить |
| `docs/playtests/` | `UNDECLARED` | evidence | отчёты реальных gameplay runs по WR §24.1: [README](playtests/README.md); текущее поведение не описывают, читать только нужный run |
| `docs/architecture/` | `UNDECLARED` | правила модулей и knowledge-source | код в apps/packages, границы зависимостей, правка корпуса |
| `docs/domain/` | `UNDECLARED` | context (OWNERSHIP_MAP) | поиск владельца; точный owner и public contract — `MODULE.md` |
| `docs/pipelines/` | `UNDECLARED` | context | turn / new-game / temporal-advance flow |
| `docs/modules/` | `UNDECLARED` | context | knowledge-source и инвентарь tools |
| `docs/setup/` | `UNDECLARED` (CONTRACT_INDEX §3 называет CBM-настройку технической инструкцией) | procedure | локальная настройка CBM, LLM-провайдеров, embeddings |
| `docs/adr/` | `UNDECLARED` (строки «Status» в шапках ADR — отдельная шкала, LW-008) | decision record | задача меняет решение, записанное в ADR |
| `docs/plans/` | `UNDECLARED` | plan | только задачи соответствующего плана |
| `docs/implementation/` | `UNDECLARED` | plan / evidence | только задачи соответствующей реализации; часть читают tools (LW-010) |
| `docs/migration/` | `UNDECLARED` | archive / evidence | исторический архив прошлой миграции; `CANONICAL_PATHS.json` — реестр canonical-путей для `docs:generate` |
| `docs/archive/` | `UNDECLARED` (не норматив) | archive | снятые agent instructions и журналы: [индекс](archive/README.md); не читать как правила |
| `MODULE_INDEX.md`, `generated/` | — | generated | навигация; вручную не править, пересобирать `npm run docs:generate` |
| `legacy/` | `UNDECLARED` | legacy | не читать как норму; production до `legacy/src` не доходит (LW-003), `legacy/DOCUMENTS` — зеркало `canonicalized_from_legacy` |
| `DOCUMENTS/`, `src/`, `prompts/`, корневые `test/*.test.js` | `UNDECLARED` | legacy | не читать как норму и не расширять; вне production runtime, но `src/` и `DOCUMENTS/` ещё читают операторские скрипты и gate-тесты (LW-001, LW-002, LW-003) |

## Куда класть новый документ

| Что появилось | Куда |
|---|---|
| правило работы агентов, продуктовый инвариант | governing-корпус (`AGENTS.md` и `docs/governance/`) — только по явному разрешению администратора (AGENTS.md §1.1) |
| норма подсистемы | нормативный корпус через [CORPUS_EDIT](process/CORPUS_EDIT.md) и CONTRACT_INDEX |
| ответственность и public contract модуля | `MODULE.md` этого модуля |
| процедура (как делать) | `docs/process/` |
| факт о проекте (что есть) | `docs/context/` + обновление по [CONTEXT_DUMP](process/CONTEXT_DUMP.md) |
| статус, план итерации, review findings | GitHub issue / PR, не файл |
| известный костыль, техдолг | [LEGACY_WARNINGS](work/LEGACY_WARNINGS.md) + issue по форме `tech_debt` |
| история изменений | `CHANGELOG.md` → `## Unreleased` |
| архитектурное решение | `docs/adr/` |
| новый корневой .md | никогда: allowlist `ROOT_MARKDOWN_ALLOWLIST` (`tools/docs-tools/src/documentation.js`) проверяют `docs:check` и `architecture:check` |

## Инструменты агентов

Проект работает в direct-AGENTS mode: Codex, Cursor, GitHub Copilot и Claude Code (≥ 2.1.277) читают корневой `AGENTS.md` сами. `CLAUDE.md`, `.claude/CLAUDE.md` и `CLAUDE.local.md` в репозиторий не коммитить: любой из них отключает прямое чтение `AGENTS.md` в Claude Code. Для сессий Claude без такой поддержки — личный gitignored `CLAUDE.local.md` с одной строкой `@AGENTS.md`; он не становится репозиторным источником истины. Подробнее — [STACK](context/STACK.md), раздел «Инструменты агентов».

Что не является источником истины и куда переносить решения — WR §2.

Skills лежат байт-в-байт одинаково в `.agents/skills/` и `.claude/skills/`: процедуры проекта — заглушки с каноном в `docs/process/` или governance; обязательные навыки `caveman` и `ponytail` (AGENTS.md §18.1) — полные копии upstream с указанием источника.
