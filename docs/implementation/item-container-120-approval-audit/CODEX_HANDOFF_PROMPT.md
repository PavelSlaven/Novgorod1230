# Codex handoff: integrate V5 into PR #17

Работай только в существующем PR #17 репозитория `PavelSlaven/Novgorod1230`.

- Branch: `chatgpt/item-container-120-approval-audit`
- Single work log: `docs/implementation/item-container-120-approval-audit/README.md`
- Existing source ledger: `docs/implementation/item-container-120-approval-audit/SOURCE_RESEARCH_LEDGER.json`
- External archive supplied manually by PavelSlaven: `ITEM_CONTAINER_120_HISTORICAL_GAMEPLAY_V5_2026-07-22.zip`
- Expected SHA-256: `dc95ee730beea3f4ae7e153cd30fb505ea7b7285a765ea2b7b56979446075fc3`
- Expected size: `84080` bytes
- Expected file count: `51`

Не создавай новый PR. Не коммить ZIP без отдельного указания пользователя. Scope — интеграция историко-игрового V5-кандидата для полной когорты 120 item/container templates, canonical readiness, atomic approval и Stage 3C promotion без activation.

## 1. Обязательное начало

1. Полностью прочитай актуальные `AGENTS.md` и `.github/AGENTS.md` из текущего `main`.
2. Выполни все обязательные чтения, local readiness и Repository Intelligence требования.
3. Полностью прочитай как минимум:
   - `development_rules.txt`;
   - `code_critic_invocation_rule.txt`;
   - `code_driven_world_materialization_architecture.md`;
   - `world_base_materialization_table_requirements.md`;
   - `llm_documentation_navigation.md`;
   - `items_and_property.txt`;
   - `character_inventory_equipment.txt`;
   - `npc_inventory_item_marks.txt`;
   - `weapons_and_armor.txt`;
   - `information_sources_llm_prompts.md`.
4. Зафиксируй repository root, remote, branch, HEAD, `origin/main`, версии инструментов и локальные изменения.
5. Выполни RAG и Graphify queries:
   - all-120 editorial readiness and atomic promotion;
   - item/container canonical schemas and import mapping;
   - physical, quantity, packaging and compatibility profiles;
   - Stage 3C PostgreSQL lifecycle and approval attestation.
6. Актуализируй ветку относительно `origin/main` без создания второго PR.

## 2. Проверка входного архива

До распаковки проверь SHA-256 и размер. При несовпадении остановись с hard block.

Распакуй архив во временную рабочую директорию вне репозитория. Запусти из чистой распакованной копии:

```text
python tools/verify_integrity.py
python tools/audit_package.py
python tools/independent_gameplay_audit.py
python tools/historical_critic.py
python tools/deep_semantic_audit.py
```

Проверь manifest, JSON Schema, counts и cross-references. Зафиксируй результаты в README.

Package-local ожидаемый результат:

```text
102 item templates
18 container templates
120 unique templates
historical_readiness = PASS
gameplay_readiness = PASS
anachronisms = 0
package_local_blocking_findings = 0
```

Этот результат не является canonical approval.

## 3. Принцип исторической достаточности

Не требуй отдельный источник для каждой однородной бытовой вещи. Источник достаточен, если он исключает анахронизм и подтверждает широкий класс для периода, включающего 1230 год.

Разрешено групповое evidence для однородных templates, если:

- period scope включает 1230 год;
- региональная применимость указана честно;
- claim не шире фактической поддержки источника;
- exact mass/dimensions/commonness не выводятся из broad presence;
- редкие, военные, статусные и импортные вещи ограничены access policy и causal basis;
- спорный узкий подтип расширен до безопасного класса либо имеет отдельный locator.

Не перегружай source model дополнительными доказательными сущностями без конкретного риска.

## 4. Mapping V5 в canonical model

Сначала изучи `data/CANONICAL_MAPPING.json`, затем сверяй каждый dataset с актуальными canonical DDL, schemas, generators и public modules.

V5 datasets:

- `TEMPLATES.json`;
- `TEMPLATE_VARIANTS.json`;
- `HISTORICAL_EVIDENCE.json`;
- `CLAIM_BINDINGS.json`;
- `PHYSICAL_PROFILES.json`;
- `ACCESS_POLICIES.json`;
- `QUANTITY_UNITS.json`;
- `QUANTITY_PROFILES.json`;
- `CONTENT_CATEGORIES.json`;
- `PACKAGING_CATEGORIES.json`;
- `CONTAINER_COMPATIBILITY.json`;
- `NESTING_POLICIES.json`;
- `MATERIALIZATION_PROFILES.json`;
- `MATERIALIZATION_RULES.json`.

Правила:

1. Не создавай параллельную schema family или второй approval workflow.
2. Используй существующие canonical tables и generators.
3. Расширяй contracts только при нормативном основании и через TDD.
4. Все plural ID relations, candidates и profile entries нормализуй через binding/entry tables.
5. Не храни queryable external IDs только в JSONB.
6. Сохрани stable template IDs и exact cohort 102 + 18.
7. Не допускай зависимостей от draft/missing records в approved closure.
8. Gameplay estimates должны сохранять явный derivation kind и не становиться historical measurements.

## 5. Исторические claims

Для каждого template обеспечь достаточные reviewed claims:

- historical presence;
- period/region applicability;
- material family;
- construction family;
- ограничение узкой типологии при необходимости.

Commonness и социальная доступность должны поступать из access/role/occupation/property/legal policies, а не выводиться из единичной археологической находки.

При конфликте V5 с актуальным canonical source record или нормативом:

- не скрывай конфликт;
- следуй более приоритетному источнику;
- исправь candidate data;
- добавь регрессионный тест;
- обнови README.

## 6. Physical, quantity и containers

Для всех 120 templates должны разрешаться approved physical profiles без нулевого или среднего fallback.

Проверь:

- mass range и dimensions;
- carry form;
- external hand cost;
- packing slot cost и bundle size;
- condition model;
- material/construction variants.

Для количественных ресурсов:

- quantity задаётся явно;
- unit существует в canonical registry;
- mass/volume вычисляется по quantity;
- hidden default запрещён;
- packaging category разрешается хотя бы в один конкретный container candidate;
- historical measure display не выдумывается.

Для 18 containers:

- capacity, closure, access, mobility и nesting заданы явно;
- liquid/wet/dry/hot/sharp/long/fragile compatibility нормализована;
- неизвестная compatibility блокируется;
- knife sheath, sword scabbard, quiver и needle case используют matching-template constraints;
- пустой контейнер разрешён только явно.

## 7. Access и materialization chain

Каждый template должен иметь:

```text
category/template
→ region permission
→ access policy
→ item/container profile membership
→ property/equipment/content dependencies
→ G4 materialization rule
→ causal basis
→ approved candidate closure
```

Военное и статусное снаряжение не должно попадать в общий бытовой или охотничий profile. Рыболовные, сельскохозяйственные и ремесленные инструменты должны иметь соответствующий occupation/context basis.

Пустой required candidate set создаёт typed data gap и hard block. Fallback запрещён.

## 8. Readiness, approval и Stage 3C

Используй существующие public modules и contracts, включая актуальные equivalents:

- editorial readiness;
- evidence review plan;
- coherent all-template approval plan;
- all-template revision promotion plan.

Не ослабляй readiness ради прохождения данных.

Approval разрешён только если одновременно:

- exact cohort = 120;
- reviewed claims достаточны;
- canonical schemas и cross-references проходят;
- approved dependency closure полна;
- readiness возвращает 120/120;
- PostgreSQL lifecycle проходит;
- полный требуемый test suite проходит;
- независимый критик возвращает `PASS` или допустимый `PASS WITH NOTES`;
- digest-bound human approval attestation присутствует по формальному контракту.

Передача ZIP пользователем не считается автоматически формальной human attestation, если contract требует отдельный exact-digest payload. В таком случае подготовь payload и запроси одно явное подтверждение перед apply.

Stage 3C создаёт новую version-pinned revision без activation. Existing parties не рематериализуются.

## 9. PostgreSQL и проверки

Используй только локальные тестовые базы. Найди фактические команды через актуальные `package.json`, Repository Intelligence и module docs; не придумывай CLI names.

Минимально должны быть выполнены относящиеся к scope:

```text
npm ci
npm run repo-intel:ensure
npm run repo-intel:status
профильные world-catalog tests
schema/reference checks
canonical import dry-run
PostgreSQL apply/readback/rollback integration
Stage 3C promotion tests
docs checks
knowledge checks
полный финальный test suite
git diff --check
clean-clone acceptance
```

Проверь exact counts/digests, transactional rollback, idempotency, parent revision immutability, отсутствие activation и отсутствие draft dependency в closure.

## 10. Независимый критик

Вызови одного независимого критика по `code_critic_invocation_rule.txt` после завершения функционального кандидата.

Передай:

- все изменённые code/data/schema/generated files;
- нормативы;
- mapping V5 → canonical model;
- source/claim decisions;
- readiness/approval/promotion reports;
- PostgreSQL logs;
- tests;
- полный diff;
- предыдущие замечания при повторном аудите.

При `CHANGES REQUIRED` или `REJECT`:

```text
исправление
→ профильные tests
→ повторная индексация
→ повторный аудит
```

Продолжай до `PASS` или допустимого `PASS WITH NOTES`.

## 11. Завершение

Только после всех gates:

1. Атомарно утверди все 120 templates и полную dependency closure.
2. Выполни Stage 3C promotion в новую revision без activation.
3. Выполни PostgreSQL readback и зафиксируй exact counts/digests.
4. Обнови единственный README:
   - repository/branch/SHAs;
   - прочитанные документы;
   - RAG/Graphify queries;
   - mapping datasets;
   - изменённые files;
   - фактические commands;
   - readiness totals;
   - PostgreSQL result;
   - human attestation;
   - critic verdict;
   - Stage 3C result;
   - remaining gaps.
5. Проверь scope, `git status` и `git diff --check`.
6. Push только в branch PR #17.
7. Не merge и не активируй revision без отдельного прямого указания пользователя.

## Условие остановки

При любом незакрытом обязательном claim, invalid mapping, missing dependency, failed test, PostgreSQL mismatch или отсутствии требуемой human attestation:

- не утверждай partial cohort;
- не создавай фиктивный binding;
- не ослабляй schema или filters;
- оставь PR draft;
- зафиксируй точный hard block в README.
