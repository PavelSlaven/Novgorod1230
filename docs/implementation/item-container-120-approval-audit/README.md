# Item/container 120 approval audit and execution handoff

## Цель

Проверить и подготовить к атомарному approval полный набор из 120 item/container templates. Выполнить в доступной среде source discovery, mapping и формализацию требований. Действия, требующие канонического локального checkout, PDF/page extraction, Graphify, PostgreSQL, полного test suite и независимого критика, передать Codex в этом же PR.

Approval допускается только при полном прохождении всех gates. Частичное утверждение, ослабление фильтров и фиктивные evidence bindings запрещены.

## Каноническая база

- Repository: `PavelSlaven/Novgorod1230`.
- Base branch: `main`.
- Base commit при создании ветки: `8c9e8db9b275e2be9b9e5eb28b59c49e8baef068`.
- Working branch: `chatgpt/item-container-120-approval-audit`.
- Pull request: `#17`.

## Граница работы

В PR входят только:

- аудит и подготовка approval 120 item/container templates;
- исторические source records и claim-scoped evidence;
- physical, quantity и container compatibility review;
- dependency closure;
- readiness, Stage 3C promotion и связанные проверки.

В PR не входят Spatial v3, P28, production cutover, new-game orchestration, preflight и миграция старых партий.

## Изученные нормативы и реализация

Полностью либо последовательными диапазонами прочитаны актуальные:

- `AGENTS.md`;
- `.github/AGENTS.md`;
- `data/knowledge-source/corpus/DOCUMENTS/development_rules.txt`;
- `data/knowledge-source/corpus/DOCUMENTS/code_critic_invocation_rule.txt`;
- `data/knowledge-source/corpus/DOCUMENTS/code_driven_world_materialization_architecture.md`;
- `data/knowledge-source/corpus/DOCUMENTS/llm_documentation_navigation.md`;
- `data/knowledge-source/corpus/DOCUMENTS/world_base_materialization_table_requirements.md`;
- `data/knowledge-source/corpus/DOCUMENTS/items_and_property.txt`;
- `data/knowledge-source/corpus/DOCUMENTS/character_inventory_equipment.txt`;
- `data/knowledge-source/corpus/DOCUMENTS/npc_inventory_item_marks.txt`;
- `data/knowledge-source/corpus/DOCUMENTS/information_sources_llm_prompts.md`.

Изучены связанные данные и workflow:

- Stage 3B-1 catalog, bundle и readiness report;
- Stage 3B-2 source register, assignments, review policies, gaps и audit summary;
- Stage 3C request/result/README;
- `tools/world-catalog-workflow/src/editorial-readiness.js`;
- `tools/world-catalog-workflow/src/all-template-promotion.js`.

## Исходное состояние

Канонические reports фиксируют:

- templates total: `120`;
- item templates: `102`;
- container templates: `18`;
- ready for approval: `0`;
- blocked: `120`;
- activation: `forbidden`;
- promotion: `blocked`;
- target revision: `blocked_not_created`;
- inserted rows: `0`.

Все 120 templates остаются `draft`.

## Выполненный план

### 1. Инвентаризация когорты

Подтверждены ровно 120 уникальных IDs: 102 items и 18 containers. Текущие Stage 3B-2 assignments объединяют их в 11 source groups.

### 2. Source discovery

Для всех 11 групп найдены или подтверждены стабильные точки доступа к официальным каталогам, библиотечным записям, цифровым корпусам либо каноническим repository-ссылкам. В частности охвачены корпуса Колчина, Медведева, Кирпичникова, Седовой, Рыбиной, берестяных грамот, сельскохозяйственных орудий и промыслов.

Результат записан в:

- `SOURCE_RESEARCH_LEDGER.json`.

Ledger содержит все 120 template IDs, source group, библиографию, access points, обязательные claim scopes и остающиеся gates. Каталожная карточка или поисковый результат не объявлены page/object-level evidence.

### 3. Формализация approval требований

Для каждого шаблона зафиксированы обязательные направления:

- historical presence;
- narrow typology;
- dating and region;
- material;
- construction;
- physical parameters;
- commonness and access.

Дополнительно зафиксированы:

- обязательные physical fields для items и containers;
- 12 quantity templates и их обязательные поля;
- 18 containers и полный compatibility review;
- минимальный контракт claim-scoped binding;
- запрет hidden defaults, source-family substitution и page-free exact claims.

### 4. Проверка штатного approval workflow

Подтверждено, что существующий код требует:

- exact cohort из 120 IDs;
- reviewed обязательные source scopes;
- полную profile/rule dependency closure;
- `approval_cohort_ready = true`;
- `ready_for_editorial_approval_count = 120`;
- digest-bound all-120 attestation;
- атомарные transitions;
- запрет partial approval.

Проверки не ослаблялись и параллельный approval mechanism не создавался.

### 5. Передача локальных этапов Codex

Создан:

- `CODEX_HANDOFF_PROMPT.md`.

Он требует продолжать только branch/PR #17 и последовательно выполнить page/object extraction, historical review, physical parameters, quantity, container compatibility, normalized bindings, dependency closure, readiness, PostgreSQL lifecycle, полный test suite, независимый аудит и только затем atomic approval и Stage 3C promotion без activation.

## Блокирующие gates

На текущем состоянии остаются:

- narrow typology: `120`;
- dating and region: `120`;
- materials and construction: `120`;
- physical parameters: `120`;
- commonness and access: `120`;
- quantity models: `12`;
- container compatibility: `18`;
- materialization chain: `120`.

Для source groups найдены точки доступа, но в этой среде не были получены и проверены PDF/page/object payloads. Поэтому claim bindings не переводились в `reviewed`, а templates и dependencies не переводились в `approved`.

## Принятые решения

- Bibliographic/source location не считается доказательством конкретного claim.
- Broad presence не расширяется до типологии, материала, размеров, commonness или социальной доступности.
- Точные параметры не создаются по памяти или аналогии.
- Gameplay estimate допустим только как явно reviewed estimate с методикой и диапазоном.
- При одном незакрытом обязательном claim вся cohort остаётся `draft`.
- Stage 3C promotion не выполняется до readiness `120/120` и независимого PASS.

## Изменённые файлы

- `docs/implementation/item-container-120-approval-audit/README.md`;
- `docs/implementation/item-container-120-approval-audit/SOURCE_RESEARCH_LEDGER.json`;
- `docs/implementation/item-container-120-approval-audit/CODEX_HANDOFF_PROMPT.md`.

Игровые данные, template statuses, source-binding statuses, revisions, runtime candidates, DDL и код не изменялись.

## Фактически выполненные проверки

- сверка канонических GitHub `main` reports по totals и statuses;
- проверка соответствия 120 template IDs Stage 3B-2 source assignments;
- локальная генерация ledger с assertion: `120` IDs и `120` unique IDs;
- JSON syntax validation для ledger через `python -m json.tool` до публикации;
- inspection существующих readiness и all-template promotion contracts;
- внешний source discovery с сохранением provenance и без повышения статуса claims.

Не запускались:

- `npm ci` и npm suites;
- локальные RAG/Graphify команды;
- PostgreSQL dry-run/apply/readback/rollback;
- clean-clone acceptance;
- независимый агент-критик.

Причина: текущая среда не предоставляет канонический локальный checkout и обязательные local services; GitHub API не используется как замена локальным проверкам.

## Аудит

Текущий результат: `CHANGES REQUIRED BEFORE APPROVAL`.

Это содержательный fail-closed вывод, а не verdict независимого критика. Независимый critic должен быть вызван Codex после фактического закрытия evidence и technical gates. Цикл продолжается до `PASS` или допустимого `PASS WITH NOTES`.

## Порядок интеграции

1. Codex открывает branch PR #17 и актуализирует её относительно `main` без создания нового PR.
2. Выполняет обязательное чтение, RAG и Graphify.
3. Использует `SOURCE_RESEARCH_LEDGER.json` как карту поиска, не как evidence.
4. Заполняет page/object extraction ledger и normalized claim bindings.
5. Закрывает physical, quantity, compatibility и dependency gaps.
6. Получает readiness `120/120`.
7. Выполняет PostgreSQL lifecycle и тесты.
8. Получает независимый PASS.
9. Применяет atomic all-120 approval и Stage 3C promotion без activation.
10. Обновляет этот README фактическими командами, результатами, commit SHA и оставшимися ограничениями.

## Известные ограничения и оставшиеся задачи

- Не извлечены страницы, таблицы, рисунки и object/catalog locators для всех 120 templates.
- Не выполнена редакторская аттестация конкретных claims.
- Не закрыты physical parameters, quantity и container compatibility.
- Не построена approved dependency closure.
- Не выполнены локальные readiness, PostgreSQL, full tests и critic.
- Approval и promotion обоснованно не выполнены.
