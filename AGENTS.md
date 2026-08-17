# Правила работы в репозитории Novgorod1230

Этот файл — единственный канонический набор общих инструкций для агентов разработки.

Задавай точечные вопросы небольшими группами до тех пор, пока задачу нельзя будет переформулировать с уверенностью не менее 90%. Обычные низкоуровневые детали реализации не требуют согласования с человеком. Явное указание вроде «выбери сам» снимает необходимость согласования по этому вопросу и даёт агенту право самостоятельно выбрать разумный вариант.

## 1. Главная цель

Выполняй поставленную пользователем задачу от начала до конца.

Перед началом кратко определи:

- требуемый результат;
- границы изменения;
- критерии готовности.

Не расширяй задачу без необходимости. После получения достаточного контекста переходи к реализации, а не продолжай неограниченное исследование.

Если найденная проблема не мешает текущей задаче, зафиксируй её в итоговом отчёте, но не исправляй попутно.

## 2. Основные принципы

- Выбирай самое простое решение, полностью выполняющее требования.
- Не создавай дополнительные слои, реестры, абстракции и процессы без конкретной необходимости.
- Не выполняй несвязанный рефакторинг.
- Не создавай вторую реализацию уже существующей ответственности.
- Сохраняй публичные контракты, схемы и форматы данных, если их изменение не является частью задачи.
- Не перезаписывай и не удаляй изменения пользователя или другого агента.
- Не создавай рабочие README, evidence packages и дополнительные отчёты, если они не требуются задачей.

Перед каждым крупным этапом сверяй текущую работу с исходной целью и оставшимися критериями готовности.

### Универсальные механики и сценарные данные

Сценарий задаёт содержание: персонажей, предметы, события, условия и разрешённые последствия.

Общие runtime-владельцы определяют механику: время, порядок событий, activities, перемещение, тело, NPC, предметы, проверки, идемпотентность и сохранение.

Сценарному коду запрещено:

- создавать собственный resolver, scheduler или state machine;
- сортировать события разных подсистем;
- разделять общий same-time batch;
- вручную определять, что происходит до или после конкретного сценарного события;
- дублировать ответственность существующего владельца.

Если общей механике не хватает требуемого поведения, минимально расширяй существующего владельца, а не создавай сценарный обходной путь.

Каждое событие применяется к состоянию, полученному после предыдущих событий. Реакции возникают после причин и видят уже изменившийся мир.

Наличие scenario-local orchestration общей механики является блокирующим архитектурным дефектом.

## 3. Начало работы

Работай в текущем локальном checkout.

Минимальная обязательная проверка:

```powershell
git status --short --branch
git branch --show-current
```

Проверяй версии Node.js, Python, Docker, Graphify и других инструментов только тогда, когда текущая задача действительно от них зависит.

Не запускай установку зависимостей, Docker services, генерацию индексов или полный набор тестов автоматически.

## 4. Изучение проекта

Сначала изучи:

1. непосредственно затрагиваемые файлы;
2. их публичные контракты;
3. связанные вызовы;
4. существующие тесты;
5. документацию соответствующего модуля.

Для обычного поиска используй точечное чтение файлов и `rg`.

Repository Intelligence и Graphify применяй только когда:

- требуется обзор нескольких подсистем;
- необходимо проследить сложные зависимости;
- местонахождение реализации неизвестно;
- обычный поиск не дал достаточного результата.

Если Graphify намеренно используется и его граф отсутствует или устарел, выполни:

```powershell
npm run repo-intel:ensure
npm run repo-intel:query -- --query "<конкретная потребность>"
```

Не перестраивай и не обновляй Graphify автоматически после каждой правки.

## 5. Выбор документации

Не читай весь нормативный корпус перед каждой задачей.

Используй только документы, относящиеся к изменяемой подсистеме. Для выбора профильного норматива используй [навигацию по документации](data/knowledge-source/corpus/DOCUMENTS/llm_documentation_navigation.md).

Дополнительные документы по области задачи:

- граница ответственности кода и LLM, материализация — [code_driven_world_materialization_architecture.md](data/knowledge-source/corpus/DOCUMENTS/code_driven_world_materialization_architecture.md);
- база мира, DDL, импорт, profiles/rules, G5, NPC, предметы — [world_base_materialization_table_requirements.md](data/knowledge-source/corpus/DOCUMENTS/world_base_materialization_table_requirements.md);
- структура игрового графа или DDL — [read_only_database_and_graph_architecture.md](data/knowledge-source/corpus/DOCUMENTS/read_only_database_and_graph_architecture.md) и [SCHEMA_REFERENCE.md](infra/world-base/SCHEMA_REFERENCE.md);
- G0–G4 — [map_g0_g4_workflow.txt](data/knowledge-source/corpus/DOCUMENTS/map_g0_g4_workflow.txt) и актуальный региональный `G1_SEMANTIC_CATALOG.md`;
- время, activities, traversal, schedules и temporal boundaries — [temporal_world_and_interruptible_activities.md](data/knowledge-source/corpus/DOCUMENTS/temporal_world_and_interruptible_activities.md).

RAG используй для обнаружения нормативов, когда задача изменяет игровое или архитектурное поведение:

```powershell
npm run knowledge:query -- --query "<конкретная нормативная потребность>"
```

Результат поиска служит навигацией. Проверяй требования по исходному документу.

Недоступный документ является блокировкой только тогда, когда без него нельзя корректно выполнить текущую задачу.

## 6. Реализация

Перед созданием нового модуля проверь существующие модули и публичные интерфейсы.

Разделяй код только при наличии самостоятельной ответственности, отдельного контракта или реальной необходимости повторного использования.

Не создавай универсальную инфраструктуру для гипотетических будущих задач.

Побочные эффекты должны быть явными. Доступ к базе, файловой системе, сети и LLM не должен быть скрыт внутри чистой доменной логики.

Для материализации мира сохраняются следующие инварианты:

- код не придумывает отсутствующие категории, исторические факты и допустимые варианты;
- authored, significant и hidden экземпляры создаются только из утверждённого candidate set;
- пустой обязательный candidate set возвращает типизированную ошибку или data gap для authored, significant или hidden materialization;
- запрещено ослаблять фильтры и создавать смысловые fallback;
- LLM выбирает только из переданного закрытого набора, когда операция является bounded choice;
- для свободной заявки игрока единственная активная semantic boundary — `turn_step_request_v1` → `turn_step_plan_v1` в общем `@rus/turn`; exact registered commands сохраняют приоритет, а scenario-local planner и параллельный semantic fallback запрещены;
- ordinary direct action result (`direct_partition`, `ambient_ordinary`, `crafted`) не является authored world materialization: он допускается только через валидированный semantic plan соответствующего player/NPC-режима, code-owned admission и отдельный persisted exact runtime mechanics snapshot;
- ordinary direct action result не может создавать NPC, места, значимые или скрытые предметы, оружие, деньги, письма, улики, container contents, исторические факты либо отсутствующие категории;
- O1 активирует common ordinary discovery через существующий `request_discovery`: после authored/committed проверки и exact persisted resolution ordinary gap закрывается только при meaningful engagement. Его Stage A получает лишь committed objective context и candidate/player wishlist не содержит; Stage B имеет `evidence_weight = 0`, а код строит identity/classification/policy fields. Только normalized discovery query (NFKC, trim, collapse whitespace, ru-RU lowercase) передаёт `candidate_hint` и уточняет `coverage_ref`; неизвестная paraphrase получает отдельное coverage без magical equivalence. Положительный non-container `man_made` результат требует independently committed либо prepared supporting basis, code-owned admission и exact immutable mechanics/property/placement. Модель вызывается вне physical transaction; P16 атомарно сохраняет seed/basis/resolution/item (если есть), версии и idempotency, а positive/negative exact resolution переживает reload без reroll только по exact deterministic identity. Player получает только capability marker и committed/approved visible result; narration не создаёт entity;
- O2a активирует только authored SHA-pinned ambient source текущей sealed G6 binding: code-owned port выбирает closed source/profile/property/holder, semantic plan передаёт лишь exact quantity/mass, а конечный result item с property/placement и immutable mechanics snapshot фиксируется обычным combined P16 item commit. Abundant ambient source при этом не уменьшается; отдельный owner-native source transition и ordinary ledger обязательны только для finite resource node. Context-bound positive всё ещё требует permission и independent basis. При pin drift ambient port отсутствует и legacy direct-action path не становится fallback;
- O2b активен только для уже committed, доступного, template-backed container с exact SHA-pinned profile/policy и `ordinary_contents_context` через существующий `request_container_access`. Authored/authoritative contents имеют абсолютный приоритет и не вызывают ordinary resolver. Candidate-free Stage A строится только из committed container/template/mechanics/property/owner-controller/site/economic/permission/basis state и не получает root action, desired item, query, use или narration. Ordinary child обязан оставаться `authority=ordinary` и `disclosure=concealed` до reveal; clues/evidence, authentic documents, hidden history, secret caches, новый container, currency, significant/hidden truth и armament запрещены. Код до commit валидирует exact mechanics, individual mass, packing/capacity и approved limit `1..8`; текущий Lower Dvina profile допускает максимум 2. First-entry P16 в одной транзакции provision-ит authored container и его container-scoped aggregate/context/basis/enablement без отдельного party bump; последующий combined access P16 атомарно фиксирует переход того же ordinary ledger, children с property/placement/mechanics, open/reveal и player-safe package. Reload/reopen возвращает exact committed contents без model/reroll; template-less containers и F1/S1/N1 остаются disabled, а O2b сам по себе не активирует отдельный A1 profile;
- A1 активен только для SHA-pinned Lower Dvina revision 21 profile: после exact registered/external/authored handler priority неизвестный `request_item_use` с `use_kind=other` может использовать committed видимую рабочую верхнюю одежду как source и принадлежащий actor нож Микулы как единственный tool. Профиль требует уже выполненную общим `@rus/checks-rng` проверку dexterity/standard и semantic activity short/light общего temporal owner; A1 не вызывает второй RNG/clock/process. Runtime до model перечитывает persisted authority, ownership/placement и полный exact authored mechanics snapshot обоих предметов; model вне транзакции задаёт только qualitative preserve-source либо no-useful-result semantics. `@rus/items-property` рассчитывает identity/mechanics/conservation, а тот же combined P16 атомарно сохраняет source/tool/time/check causal pins, transition и replay-safe ledger с одним party bump. Current scenario activation намеренно ограничена `ordinary_mundane`, `preserve_source|no_useful_result`; lower-level independent output, writing, token-like и weapon-capable contracts не являются активными scenario promises. A1 не создаёт pre-existing world presence и не ослабляет O1/O2 authoritative fail-closed paths;
- последствия выбора рассчитывает код;
- LLM не пишет непосредственно в базу данных;
- сохранённые экземпляры не материализуются повторно без явной migration или repair-процедуры.

Для Lower Dvina Trace revision 14 активен conversation path, revision 15 активирует autonomous NPC path, revision 16 / `spatial-v3-production-v6` — общий combat path, revision 17 / `spatial-v3-production-v7` — Phase 9 recovery/evidence/temporary-disposition path, revision 18 / `spatial-v3-production-v8` — deterministic Phase 10 completion и player-safe epilogue, revision 19 / `spatial-v3-production-v9` — canonical appearance, revision 20 / M8 / Phase 1A v16 / Phase 1B v15 добавила O2b existing-container contents для exact authored pouch, а active revision 21 / M9 / Phase 1A v17 / Phase 1B v16 / `spatial-v3-production-v10` активирует узкий SHA-pinned A1 personal-tool transform profile. Revision 20 и прежние публикации остаются immutable historical recovery paths. Meaningful NPC response, автономное и боевое решение проходят через общие `npc_decision_signal_v1` → `npc_decision_boundary_v1`, профильные semantic request/plan и общий code-owned execution/commit. Бой использует `request_combat`, persisted `combat_session_v1`, общие checks/body/items/time owners и не создаёт scenario-local resolver. Phase 9 делегирует property/container transitions `@rus/items-property`, evidence resolution `@rus/visibility-knowledge-memory`, а временное disposition `@rus/social-law`; она не вскрывает документ. Phase 10 после отдельного committed Phase 9 change set детерминированно вычисляет `full|partial|case_open` только из committed producers, фиксируется отдельным zero-time P16 commit и передаёт narration только persisted player-safe projection. Bounded NPC selection допустим только для genuinely closed choices и явно pinned historical revisions, но не как fallback semantic path.

## 7. Тестирование

Во время работы запускай минимальный набор тестов, относящийся к изменяемому поведению.

Для исправления дефекта по возможности сначала добавь тест, воспроизводящий ошибку.

После реализации выполни:

- профильные тесты затронутого модуля;
- проверки изменённых контрактов или схем;
- `git diff --check`;
- документационные проверки, если изменена документация.

Полный `npm test` запускай один раз для финального кандидата, если изменение широкое, рискованное или затрагивает несколько подсистем.

Не повторяй тяжёлые проверки, если после их прохождения не менялись проверяемые код, данные, контракты или поведение.

Для documentation-only изменений не запускай PostgreSQL, браузерные или полные интеграционные тесты.

В итоговом отчёте перечисляй только фактически выполненные команды и их результаты.

## 8. Базы данных и опасные операции

Не направляй migrations, import, seed или tests в operator либо production database.

По умолчанию используй локальную или тестовую базу и dry-run.

Не выполняй необратимую миграцию или удаление данных без явного требования пользователя.

Запрещены широкие разрушительные команды:

```text
git clean
git reset --hard
git checkout -- .
git restore .
rm -rf .
Remove-Item -Recurse -Force *
```

Не перемещай и не удаляй неизвестные файлы, пользовательские материалы, секреты, базы данных, stash, незакоммиченные изменения и чужие worktree.

Архивирование локальных материалов выполняется только по отдельному явному заданию.

## 9. Субагенты и аудит

Используй субагентов только для самостоятельных задач, разделение которых действительно ускоряет работу или обеспечивает независимую проверку.

Главный агент сохраняет ответственность за общую цель, план, интеграцию изменений, критерии готовности и итоговый результат.

Передавай субагенту краткое самостоятельное описание текущего шага, а не полный контекст диалога. При поддержке параметра используй:

```text
fork_turns: "none"
```

Не создавай субагента для каждого мелкого последовательного действия.

Независимый аудит обязателен для изменений с повышенным риском:

- публичные контракты нескольких подсистем;
- DDL, migrations и persistence;
- изменение границы кода и LLM;
- возможность повреждения или потери данных;
- критическая orchestration;
- сложная логика, для которой тестов недостаточно.

Для обычного локального исправления отдельный агент-критик не требуется.

После замечаний повторяй аудит только после содержательного исправления.

Выбор модели и reasoning level не является политикой репозитория и определяется средой выполнения.

## 10. Git и GitHub

Не создавай commit, branch, push, pull request или merge, если это не входит в поставленную задачу.

Если задача включает публикацию изменений:

- используй одну ветку;
- используй один pull request;
- не включай несвязанные изменения;
- перед commit проверь `git status`, diff и профильные тесты.

GitHub CI дополняет локальные проверки, но не требует предварительного запуска всех возможных локальных тестов независимо от области изменения.

## 11. Завершение

Перед завершением проверь соответствие результата исходной задаче.

Итоговый отчёт должен кратко содержать:

1. что изменено;
2. какое поведение реализовано или исправлено;
3. какие проверки выполнены;
4. известные ограничения или блокировки.

Не объявляй задачу завершённой, если известная обязательная проверка затронутой области завершилась ошибкой.
