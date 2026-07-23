# Item/container 120: V5 integration handoff

## Цель

Интегрировать в существующий PR #17 проверенный редакторский пакет из 120 предметов и контейнеров для Новгородской земли около 1230 года, не создавая параллельную архитектуру и не подменяя package-local проверки каноническими approval/import gates.

Работа продолжается только в этом PR. Новый PR запрещён.

## Каноническая база

- Repository: `PavelSlaven/Novgorod1230`.
- Base branch: `main`.
- Working branch: `chatgpt/item-container-120-approval-audit`.
- Pull request: `#17`.
- PR переведён в ready for review; актуальный merge gate указан только в последнем разделе `Актуальный статус`.

Перед локальной работой Codex обязан актуализировать ветку относительно текущего `origin/main` и зафиксировать фактические SHA. Указанный при создании ветки base SHA `8c9e8db9b275e2be9b9e5eb28b59c49e8baef068` не должен использоваться как предположение об актуальном `main`.

## Внешний вход V5

Пользователь передаёт архив Codex вручную. Архив намеренно не добавлен в GitHub этим изменением.

```text
filename: ITEM_CONTAINER_120_HISTORICAL_GAMEPLAY_V5_2026-07-22.zip
sha256: dc95ee730beea3f4ae7e153cd30fb505ea7b7285a765ea2b7b56979446075fc3
size_bytes: 84080
archive_files: 51
```

Codex обязан первым действием проверить SHA-256. При несовпадении работа с архивом блокируется.

Архив содержит отдельные datasets, schemas, manifests, canonical mapping, integrity checks и аудиторы. Его package-local результат:

```text
historical_readiness = PASS
gameplay_readiness = PASS
package_local_blocking_findings = 0
anachronisms = 0
content_ready = true
```

## Граница результата V5

V5 подтверждает содержательную готовность редакторского кандидата в пределах собственной модели. Он не подтверждает и не выполняет:

```text
canonical_repository_apply_performed = false
human_approval_attestation_present = false
postgresql_lifecycle_performed = false
canonical_world_revision_activated = false
```

Нельзя интерпретировать package-local `PASS` как канонический approval, Stage 3C promotion, импорт в `world_base` или runtime activation.

## Правило разумной достаточности

Для проверки отсутствия анахронизма не требуется отдельная монография или отдельная страница на каждую однородную бытовую вещь.

Допустимо использовать один профильный источник для группы однородных templates, если одновременно:

- источник охватывает период, включающий 1230 год;
- источник относится к Новгороду, Северо-Западной Руси либо явно допустимому сравнительному древнерусскому материалу;
- claim ограничен широким присутствием типа, материалом или технологией, которые источник действительно подтверждает;
- из группового источника не выводятся точные размеры, масса, частотность, цена или социальная доступность;
- спорный узкий подтип расширен до исторически безопасного класса либо имеет отдельный locator;
- редкая, военная, статусная или импортная вещь имеет ограниченный access policy и causal basis.

Главный исторический gate: предмет не должен быть анахронизмом для Новгородской земли около 1230 года. Дополнительные источники добавляются только для устранения конкретного риска, а не ради формального количества ссылок.

## Что закрывает пакет

V5 включает полную когорту:

- 102 item templates;
- 18 container templates;
- ровно 120 стабильных template IDs.

Для когорты подготовлены:

- исторические evidence и claim bindings;
- варианты материалов и конструкций;
- physical profiles с диапазонами и явным derivation kind;
- access policies по роли, занятию, статусу и хозяйственному контексту;
- quantity units и quantity profiles;
- packaging categories;
- container compatibility и nesting policy;
- materialization profiles и rules;
- canonical mapping;
- schemas и integrity manifest;
- package-local historical, gameplay и semantic audits.

Gameplay estimates не объявляются археологическими измерениями. Масса количественных ресурсов вычисляется из quantity. Неизвестная container compatibility запрещается, а не угадывается.

## Исходный план интеграции (история)

1. Проверить архив и его SHA-256.
2. Открыть актуальные `AGENTS.md`, `.github/AGENTS.md` и все обязательные профильные нормативы.
3. Выполнить обязательный локальный readiness и RAG + Graphify workflow.
4. Сверить V5 с актуальными canonical DDL, JSON Schemas, table registry, generators, readiness и Stage 3C contracts.
5. Использовать `data/CANONICAL_MAPPING.json` как план преобразования, но не как разрешение создавать параллельные таблицы или второй approval workflow.
6. Перенести данные в существующие canonical datasets либо минимально расширить существующие contracts по нормативному основанию.
7. Сохранить exact cohort из 120 IDs и полную нормализованную dependency closure.
8. Запустить canonical generators, schema validation, cross-reference checks и readiness.
9. Выполнить PostgreSQL dry-run, transactional apply, readback и rollback только на локальной тестовой базе.
10. Получить независимый verdict `PASS` или допустимый `PASS WITH NOTES`.
11. Получить требуемую контрактом digest-bound human approval attestation. Не подделывать её и не считать передачу файла автоматической аттестацией, если формальный contract требует отдельного подтверждения.
12. Выполнить atomic all-120 approval и Stage 3C promotion без activation только после всех gates.
13. Обновить этот README фактическими командами, SHA, counts, digests, critic verdict и оставшимися ограничениями.

## Запреты интеграции

- Не создавать новый PR.
- Не коммитить переданный ZIP без отдельного указания пользователя.
- Не добавлять package-local schemas как вторую каноническую schema family, если существует canonical schema с той же ответственностью.
- Не ослаблять readiness, source, dependency или candidate filters.
- Не создавать fallback для отсутствующей category/template/profile/rule связи.
- Не активировать revision.
- Не менять Spatial v3, P28, production runtime, new-game orchestration или legacy-party migration вне необходимой совместимости текущего scope.
- Не утверждать частичную когорту.
- Не превращать gameplay estimate в историческое измерение.

## Файлы PR до интеграции V5

- `docs/implementation/item-container-120-approval-audit/README.md`;
- `docs/implementation/item-container-120-approval-audit/SOURCE_RESEARCH_LEDGER.json`;
- `docs/implementation/item-container-120-approval-audit/CODEX_HANDOFF_PROMPT.md`.

`SOURCE_RESEARCH_LEDGER.json` остаётся вспомогательной картой первоначального source discovery. При конфликте с проверенными V5 datasets или актуальным `main` применяется актуальная каноническая модель и фиксируется решение в этом README.

## Ранее выполненная локальная проверка

Codex ранее проверял отдельный worktree на HEAD `56f268257d7438c3e948485c8b6e99e57373a511` относительно `origin/main` `8c9e8db9b275e2be9b9e5eb28b59c49e8baef068`.

Были выполнены:

- `npm ci`;
- `npm run repo-intel:ensure`;
- `npm run repo-intel:status`;
- четыре `repo-intel:query`;
- `npm run docs:check`;
- `npm run test:docs` — 8/8;
- JSON syntax validation ledger;
- `git diff --check origin/main...HEAD`;
- GitHub `clean-clone-generation-test` — `SUCCESS`.

Эти результаты относятся к прежнему HEAD и не подтверждают интеграцию V5. После изменения игровых данных, schemas, generators или contracts обязательные проверки выполняются заново.

## Изменения исходного handoff-прохода (история)

- README переведён с исходного source-discovery handoff на V5 integration handoff.
- `CODEX_HANDOFF_PROMPT.md` обновлён для работы с конкретным архивом и его digest.
- PR description обновляется с точной границей package-local и canonical readiness.
- Архив, игровые datasets, DDL и runtime-код этим проходом не коммитятся.

## Статус исходного handoff-прохода (история)

```text
v5_external_package_received_by_chatgpt = true
v5_archive_committed_to_repository = false
content_package_ready_for_codex_integration = true
canonical_readiness_verified = false
canonical_approval_performed = false
stage3c_promotion_performed = false
runtime_activation_performed = false
pr_state = draft
```

Технический вывод того прохода был `READY_FOR_CODEX_LOCAL_INTEGRATION`, но не `READY_FOR_MERGE`.

## Обязательный итоговый отчёт Codex

После завершения интеграции в этом README должны быть указаны:

1. актуальные repository root, branch, HEAD и `origin/main` SHA;
2. прочитанные нормативы;
3. выполненные RAG и Graphify queries;
4. список изменённых canonical files;
5. mapping каждого V5 dataset в canonical tables/contracts;
6. фактически выполненные generators и tests;
7. PostgreSQL dry-run/apply/readback/rollback results;
8. readiness totals и digests;
9. human approval attestation status;
10. независимый critic verdict;
11. Stage 3C result и подтверждение отсутствия activation;
12. известные gaps и ограничения.

## Фактический локальный проход V5 — 2026-07-22

Внешний архив с ожидаемым SHA-256
`dc95ee730beea3f4ae7e153cd30fb505ea7b7285a765ea2b7b56979446075fc3` получен и
проверен, но согласно handoff не добавлен в Git. Пользователь явно подтвердил
историческую проверку всей когорты; digest-bound запись этого решения сохранена в
`evidence/HISTORICAL_REVIEW_ATTESTATION.json`. Она закрывает только historical scope и
не подменяет gameplay balance, canonical mapping, final all-120 approval или runtime
activation.

На чистой распаковке V5 фактически выполнены:

- `python tools/verify_integrity.py .` — `PASS`, 50 файлов, 0 ошибок;
- `python tools/audit_package.py .` — historical/gameplay `PASS`, 0 findings;
- `python tools/independent_gameplay_audit.py .` — 0 findings;
- `PYTHONUTF8=1 python tools/historical_critic.py .` — 0 findings;
- `python tools/deep_semantic_audit.py .` — `PASS`, 0 findings.

Пакетные audit-команды изменяют `reports/SEMANTIC_AUDIT.json` и
`reports/DEEP_SEMANTIC_AUDIT.json`, поэтому integrity проверялась первой на чистой
распаковке. Без `PYTHONUTF8=1` historical critic падает в Windows CP1251; это defect
package tooling, не содержательный historical finding.

Отдельно проверен работающий локальный operator PostgreSQL/NocoDB. В `world_db`
таблица `world_base.item_templates` существует и содержит 0 строк; новые
`container_templates`, migration inventory и materialization tables отсутствуют.
Проверенный zero-row input сохранён в
`evidence/OPERATOR_LEGACY_INVENTORY_SNAPSHOT.json`. Он позволяет пересчитать canonical
readiness без прежнего неизвестного состояния operator source; существующие Stage 3C
reports ещё не пересобраны и не объявляются актуальными.

Для канонической проверки был поднят отдельный PostgreSQL 16 на порту `55439`, применён
текущий DDL и штатно импортирован `rus13-base-v1`: 42 577 строк, 30 таблиц, 0 validation
errors/warnings. После проверки временные container, network и volume удалены. В базе
было обнаружено 9 332 G4 nodes, но:

- `g4_materialization_profiles`: 0;
- `g4_materialization_bindings`: 0;
- `materialization_slot_rules`: 0.

V5 содержит девять региональных context profiles и 120 generic rules, но не содержит
`graph_node_id`, `slot_rule_id` или approved profile-to-G4 bindings. Поэтому эти records
нельзя честно преобразовать в `g4_item_materialization_rules` и
`g4_container_materialization_rules`: required candidate/dependency set пуст. По
правилу materialization data gap это остаётся hard block; создавать фиктивный G4,
назначать один context всем 9 332 узлам или ослаблять readiness запрещено.

Независимый итоговый critic дал `PASS WITH NOTES`: evidence сохраняет fail-closed
Approval, historical attestation корректно ограничена, operator snapshot согласован с
zero-row состоянием, G4 dependency gap подтверждён. Package-local gameplay `PASS`
остаётся автоматическим результатом пакета, а не человеческим final approval.

Результат того прохода: historical review и verified operator legacy input получены;
canonical G4/slot dependency closure отсутствует. До появления утверждённого mapping
для девяти profiles atomic Approval и Stage 3C promotion остаются запрещены.

## Проверка spatial/materialization dependency gap — 2026-07-23

После уточнения допустимой минимальной проекции повторно проверены source bundle и
фактическая operator DB. В `world_base.graph_nodes` действительно существуют 9 332 G4,
но ни один из них не имеет `status = approved`:

- `draft`: 8 895;
- `usable_with_caution`: 437;
- `approved`: 0.

Поэтому начать цепочку с «existing approved G4 nodes» пока невозможно. Stage 3C
проверяет `graph_node_id` через approved dependency closure; использование
`usable_with_caution` как external approved ID означало бы обход нормативного gate.
Локально approved G1 content revision также не заменяет этот gate: его approval явно
исключает production import.

Из 437 существующих `usable_with_caution` G4 выбран минимальный семантически
обоснованный набор из девяти узлов: жилые дворы, ремесленные дворы, монастырские
огороды, лодочная зона, торговые ряды, Ярославово дворище, писцовый угол, сторожевое
место и монастырский храм. Он покрывает девять V5 profiles без полного mapping 9 332
узлов и без обращения к inactive Spatial v3 projection.

Точный запрос на approval сохранён в
`evidence/G4_DEPENDENCY_APPROVAL_REQUEST.json`; SHA-256 exact payload:
`1a583ba6be5c66b11baa9d8b799bed446e8d0b2a811d1d2d2573325f868d8350`.
До явного digest-bound подтверждения
этого exact набора его записи остаются только proposal; G5 templates, slot rules,
concrete item/container rules, PostgreSQL apply и Stage 3C promotion не выполняются.

## История реализации минимальной dependency-проекции — 2026-07-23

Весь раздел ниже до `Актуальный статус` описывает прежний кандидат
`d55b4e8a7ac44340301f89dbb2d1cc9dca13d5761fdad92afb11a599af29745e`.
Он сохранён как история и не является состоянием текущего рабочего дерева.

Два предыдущих абзаца фиксируют состояние до решения пользователя по
spatial/materialization gap. Пользователь подтвердил правильный способ закрытия gap:
не создавать 9 332 отдельных profiles, а использовать допустимые DDL bindings и
небольшой набор семантически подходящих G4. Это разрешило техническую компиляцию
проекции. Финальная digest-bound аттестация `approve_all_120` впоследствии получена
и сохранена отдельным immutable evidence.

### Зафиксированная локальная среда

```text
repository_root = C:\Users\Slaven\Documents\Новгород\.tmp-pr17-review
repository = PavelSlaven/Novgorod1230
branch = chatgpt/item-container-120-approval-audit
head_before_implementation_commit = 32d24ac49f3b1c79a7e2e58003b85f7da025e38b
post_approval_functional_commit = 95ac6665c245a806a21cedc4762a366de1c4ad26
origin_main = 8c9e8db9b275e2be9b9e5eb28b59c49e8baef068
node = v24.16.0
npm = 11.13.0
python = 3.13.3
uv = 0.8.12
docker_client_server = 29.5.3 / 29.5.3
docker_compose = v5.1.4
graphify = 0.9.17
```

Перед анализом полностью прочитаны обязательные `AGENTS.md`, `.github/AGENTS.md`,
`development_rules.txt`, `code_critic_invocation_rule.txt`,
`code_driven_world_materialization_architecture.md`,
`llm_documentation_navigation.md` и
`world_base_materialization_table_requirements.md`, а также найденные навигацией
профильные contracts Stage 3C, Stage 8 и Stage 13–16.

Выполнены оба канала Repository Intelligence со следующими точными запросами:

```text
PR17 item container V5 canonical approval Stage 3C promotion without activation
G4 materialization profiles bindings slot rules item container runtime Stage 8 Stage 13 Stage 16
```

`repo-intel:status` вернул готовый Graphify graph версии `0.9.17`; нормативный
knowledge-source имеет известный `degraded` warning о semantic coverage gaps, но без
readiness errors. Graphify после итоговых исправлений пересобран: 24 276 nodes,
48 066 edges, 1 426 communities. Его результаты использовались только для навигации и не
подменяли нормативы.

### Канонический mapping и coverage

V5 перенесён в существующие canonical contracts, без второй schema family:

- templates и физические параметры → `item_templates`, `container_templates`,
  `item_template_inventory_profiles`, `container_template_inventory_profiles`;
- quantities → `quantity_unit_definitions`, `item_template_quantity_profiles`;
- категории и facets → `universal_categories`, `universal_category_relations`,
  `category_labels`, `region_category_options`, template bindings;
- sources → `source_records`, `record_sources`, template source bindings;
- contents/access/equipment → существующие content, property и equipment tables;
- spatial dependency closure → `g4_materialization_profiles`, bindings, G5 templates,
  anchors, layout edges, slot rules и concrete G4 item/container rules.

Скомпилированы девять exact context bindings для выбранных реальных G4 и один
явный общий `node_type=location` профиль без предметной материализации. Поэтому все
9 332 импортированных G4 однозначно разрешаются в профиль, но предметы и контейнеры
доступны только в девяти семантически обоснованных контекстах; случайный G4 не может
использоваться для прохождения readiness.

Фактические ключевые counts:

```text
item_templates = 102
container_templates = 18
cohort_templates = 120
item_quantity_profiles = 102
context_profiles = 9
g4_nodes_with_deterministic_profile_resolution = 9332
g4_materialization_profiles = 10
g4_materialization_bindings = 10
g5_minilocation_templates = 10
g5_anchor_templates = 30
g5_edge_templates = 10
g4_materialization_layout_edges = 20
materialization_slot_rules = 52
g4_item_materialization_rules = 9
g4_container_materialization_rules = 18
```

Каждый G5 template имеет `start`, `work`, `exit`, связный маршрут
`start -> work -> exit` и явный resource slot на `work`. Item rules связываются с
девятью profile sets, которые в совокупности содержат все 102 items; container rules
ссылаются на все 18 templates напрямую. Каждое правило сохраняет конкретные
`graph_node_id`, `slot_rule_id`, count bounds, causal basis, applicability и status.

### Реализация и проверенные contracts

Добавлены детерминированные compiler/generator/validator/importer и runtime loaders:

- `v5-canonical-catalog.js` компилирует проверенный source snapshot;
- `g4-item-container-coverage.js` разрешает bindings и доказывает coverage;
- `item-container-g4-projection.js` строит profiles, G5 layouts, slots и rules;
- `pr17-candidate-bundle.js` проверяет manifest, digest, schemas, FK closure,
  dependency order и выполняет transactional apply/readback;
- `runtime-catalog-loaders.js` fail-closed загружает только approved revision/catalog
  в Stage 8 и Stage 13–16;
- `run-pr17-item-container-postgres.mjs` разрешает apply только в отдельную БД с
  именем `pr17_*`.

Схема `mass_grams_per_unit` приведена к `NUMERIC`, а JSON/runtime contracts — к
положительному конечному числу. Это необходимо для сохранения V5 density-derived
значения мёда `1.4 g/ml` без округления и не ослабляет обязательность поля.

Runtime integration test доказывает:

- Stage 8 получает 102 items, 18 containers, 120 quantity records и equipment profile;
- фактический Stage 13 materialization block проходит на разрешённых G5 templates;
- Stage 14 code precheck получает явный approved weather state;
- Stage 16 materializer и code precheck проходят с packing, size, weight и capacity;
- все девять контекстов изолируют свои candidate sets;
- unapproved G4 и unapproved revision отклоняются fail-closed.

### Reproducibility и Stage 3C closure

Сгенерированный candidate содержит 39 datasets и три reports. Его exact digest:

```text
d55b4e8a7ac44340301f89dbb2d1cc9dca13d5761fdad92afb11a599af29745e
```

Immutable candidate manifest намеренно остаётся исходным approval input:

```text
approval = pending_approve_all_120
activation = not_requested
deletion_policy = none
```

После completion-аудита прежнего кандидата обнаружен отдельный dependency gap:
обычный Stage 3C workflow продвигал item/container rows, но не включал spatial
closure и атомарные переходы выбранных G4. Gap закрыт без создания 9 332 профилей и
без ослабления readiness:

- 9 существующих G4 выбраны по фактическим `node_type`, `place_template_id`,
  `building_template_id` и функции места, а не случайно для прохождения проверки;
- bindings разрешают общий профиль по допустимому DDL selector, но каждое из 9 item
  rules и 18 container rules указывает конкретные `graph_node_id` и `slot_rule_id`;
- общий coverage report доказывает разрешение всех 9 332 G4, включая явный
  no-item/container profile для остальных approved узлов;
- Stage 3C plan содержит все 39 таблиц, 102 item и 18 container transitions, а также
  ровно 9 G4 status transitions в одной транзакции;
- readback mismatch откатывает и datasets, и G4 transitions;
- promotion не активирует revision, не запускает rematerialization и не изменяет
  existing parties.

Технический запрос на человеческое утверждение сформирован только после проверки
manifest, всех dataset digests, readiness 120/120 и полного G4 coverage. Его exact
request digest:

```text
a0a667b47bf42225a4bc2a1059c43f8dc3697008618b929359e1e9f228a8ea91
```

Пользователь явно подтвердил `approve_all_120`, exact request и candidate digests,
девять G4 transitions и запрет activation/rematerialization. Аттестация сохранена в
`evidence/FINAL_APPROVAL_ATTESTATION.json`; её digest:

```text
207338995ea7c8849793216d2cec668dea4e7371291b690da7f32cbc06d28471
```

Approval-bound lifecycle выполнен на одноразовой PostgreSQL 16 БД
`pr17_item_container_stage3c`. Первый реальный проход выявил порядок readback,
который отличался от canonical locale-sort manifest для `universal_categories`;
транзакция корректно откатила все datasets и девять G4 transitions. Executor
исправлен так, чтобы insert/readback использовали тот же canonical sorter, и
добавлен красно-зелёный regression test.

После исправления выполнены rollback probe, полный apply/readback всех 39 datasets и
повторный apply в заново созданной чистой schema:

```text
rollback = pass
first_apply = pass
first_readback_dataset_count = 39
repeat_clean_apply = pass
repeat_readback_dataset_count = 39
target_revision_status = approved
target_catalog_digest = 996c823c373fedf9080f7395233c54d78807c3a768c2ca9c39a3c0c53927d951
approved_g4_count = 9
approved_item_template_count = 102
approved_container_template_count = 18
parent_revision_unchanged = true
activation_performed = false
existing_parties_rematerialized = false
```

Promotion result сохранён в `evidence/STAGE3C_PROMOTION_RESULT.json`. Временный
container удалён; operator/production database не изменялась.

### Исторически выполненные проверки кандидата d55b4e8a

```text
npm run docs:generate                                              PASS
npm run docs:check                                                 PASS
npm run item-container-120:generated-check                         PASS (43 files)
npm run item-container-120:validate                                PASS
npm run item-container-120:stage3c-request-check                   PASS
npm run item-container-120:stage3c:dry-run                         PASS
npm run item-container-120:stage3c:postgres:lifecycle              PASS
DATABASE_URL=<isolated-world_base_ci>
npm run world-db:import:stage3b1:integration                       PASS
node --test tools/world-catalog-workflow/test/pr17-stage3c-promotion.test.js
                                                                   6/6 PASS
npm run test:world-catalog                                         130/130 PASS
npm test                                                           PASS
git diff --check                                                   PASS
graphify update .                                                  PASS
```

В составе последнего полного `npm test`: modules `193/193`, shadow `6/6`, cutover
`4/4`, integration `21 PASS` и `5` PostgreSQL-dependent skips. Browser E2E имеет
один skip из-за отсутствия Chromium executable в локальной test-конфигурации; это
явно зафиксированное ограничение, а не скрытый runtime failure. Graphify обновлён до
24 276 nodes, 48 066 edges и 1 426 communities; отдельно сохранены предупреждения о
31 SQL-файле без `tree_sitter_sql` и 294 файлах без извлечённых nodes.

Первый GitHub CI для evidence commit `2e7d9bd9dceba68510c53157b4a92e89615212df`
обнаружил отдельное расхождение Stage 3B-1 PostgreSQL readback:
`mass_grams_per_unit NUMERIC` возвращался драйвером `pg` как строка, тогда как
supplemental bundle содержит JSON number. Исправлен только readback projection:
поле явно читается как `float8`, аналогично уже проверенному Stage 3C adapter.
Проверка сохраняет дробное значение `1.4`, остальные поля и canonical digest не
изменены. Точная команда CI воспроизведена локально до исправления и после него
проходит 25 datasets, repeat apply, rollback и все quantity/source guards.
Независимый повторный critic дал `PASS`.

### Исторический gate кандидата d55b4e8a

```text
historical_review = user_confirmed
canonical_candidate_compiled = true
canonical_candidate_validated = true
all_9332_g4_resolved = true
selected_context_g4_count = 9
stage3c_technical_plan = PASS
stage3c_atomic_rollback_unit_test = PASS
approval_request_digest = a0a667b47bf42225a4bc2a1059c43f8dc3697008618b929359e1e9f228a8ea91
approval_attestation_digest = 207338995ea7c8849793216d2cec668dea4e7371291b690da7f32cbc06d28471
approve_all_120 = completed
stage3c_postgresql_lifecycle = PASS
stage3c_promotion = completed_in_isolated_review_database
current_post_fix_independent_critic = PASS
current_post_fix_standards_review = PASS
current_post_fix_clean_clone_acceptance = PASS
current_post_fix_clean_clone_sha = 95ac6665c245a806a21cedc4762a366de1c4ad26
remaining_item_container_architecture_gaps = 0
runtime_activation = false
pr_state = ready_for_review_ci_rerun_pending
```

Повторный независимый critic прежнего Stage 3C diff дал `PASS`; Standards-аудит —
`PASS WITH NOTES` без hard violations. Проверены 39-table FK closure и self-reference
ordering, digest-bound request/attestation, exact 120 IDs, readiness и G4 coverage,
атомарность и rollback девяти G4 transitions, совместимость прежнего promotion API,
а также отсутствие activation, rematerialization и operator DB access. Targeted
tamper probes для readiness, coverage, 120 IDs и transitions блокируются fail-closed.

Предыдущий clean-clone acceptance exact commit
`317fd35e179161d3d941adce827f74636bc2666a` прошёл полностью, но после обнаруженного
PostgreSQL ordering defect executor и regression test изменены. Поэтому он не
подменяет обязательные повторные post-fix full tests, critic и clean-clone.

Post-fix independent critic и Standards-аудит дали `PASS`. Критик пересчитал
attestation digest, воспроизвёл dry-run digests, проверил 39 datasets, 9 transitions,
102/18 cohort, rollback/readback/repeat и отсутствие activation/rematerialization.
Для текущего exact candidate также подтверждено одинаковое ordering всех
`[a-z0-9_]+` IDs в проверенных locales.

Финальный clean-clone acceptance выполнен на exact functional commit
`95ac6665c245a806a21cedc4762a366de1c4ad26`. В чистой копии прошли `npm ci`, docs,
43 generated files, candidate/request/attestation dry-run digests, world-catalog
130/130 и полный `npm test`. В одном новом PostgreSQL 16 container независимо
проверены оба контура: Stage 3B-1 против `world_base_ci` и Stage 3C
rollback/apply/readback/repeat против `pr17_clean_stage3c_ci`. Stage 3C результат
совпал с сохранённым promotion evidence; оба временных database container и
clean-clone удалены.

На том этапе PR №17 был переведён из draft в ready for review. Дальнейшее состояние
этого кандидата заменено актуальным remediation gate ниже.

## Актуальный статус — remediation после `CHANGES REQUIRED`, 2026-07-23

Единственный актуальный вывод для текущего рабочего дерева:
`LOCAL_AND_CLEAN_CLONE_VALIDATION_PASS_AWAITING_GITHUB_CI`.
Прежние аттестация и PostgreSQL promotion относятся к кандидату `d55b4e8a...` и
перемещены в `evidence/history/`. Они не переносятся на новый candidate автоматически.

Исправления:

- удалён общий `node_type=location` binding
  `explicit_no_item_container_default` со всеми синтетическими G5 dependencies;
- coverage ограничен runtime-доступными `approved` G4 и теперь доказывает ровно
  `9/9`; новый approved G4 без отдельного approved binding возвращает
  `G4_MATERIALIZATION_BINDING_MISSING` в coverage и
  `RUNTIME_G4_BINDING_UNRESOLVED` в runtime loader;
- PostgreSQL Stage 3C lifecycle расширен обязательным чтением target revision и
  всех 39 datasets обратно из `world_base`, после чего все девять G4 проходят
  `buildApprovedItemCatalogSnapshot` → `buildAllowedG5TemplateSet` → Stage 8 →
  Stage 13 → Stage 14 → Stage 16 → repeat-entry;
- PR17-specific approval helpers и spatial schema переведены во внутреннее immutable
  migration tooling (`src/internal/`) и удалены из публичного package entrypoint;
- старые взаимоисключающие статусы выше явно помечены историей.

Реальный DB-readback E2E последовательно обнаружил и закрыл два ранее невидимых
integration gaps: Stage 16 должен получать canonical historical frame с
`calendar.year/season`, а PostgreSQL `NUMERIC mass_grams_per_unit` должен
преобразовываться runtime loader-ом в конечное положительное число. Для второго
случая добавлен red/green regression test; неверное значение возвращает
`RUNTIME_QUANTITY_UNIT_MASS_INVALID`.

Текущие counts:

```text
item_templates = 102
container_templates = 18
cohort_templates = 120
approved_runtime_g4_coverage = 9/9
g4_materialization_profiles = 9
g4_materialization_bindings = 9
g5_minilocation_templates = 9
g5_anchor_templates = 27
g5_edge_templates = 9
g4_materialization_layout_edges = 18
materialization_slot_rules = 48
g4_item_materialization_rules = 9
g4_container_materialization_rules = 18
```

Актуальные immutable inputs:

```text
candidate_digest = e3bddda4b31cdbb91d430254db5e6f2d34a8d9d0a08e5f7e4c1e1d6cb9832a24
approval_request_digest = 046344b570789b008da8685d0dad3824512d529f9c161a122ecdc59e3cb73771
readiness_report_digest = b65b9a966c4b07a97cbad30cb09456b63272ae3891607819790f2eff0315dcf6
g4_coverage_report_digest = 1bee1492cb25f615414f951282a14f3228b892afeda327c7703653df6577e8e0
approval_attestation_digest = 67baf3e92a2aacde2566a60c13e5a3a2410e3544549f096684d473d8588f18f8
promotion_manifest_digest = 9daf6cd47e341869ee3c0e2641873a507cc6fb38dcef145f9d33a48843f3ed94
target_revision_id = world_revision_novgorod_1230_item_container_approved_001
target_catalog_digest = a24fe55497a8aca018fa28a43ab1f54e26e2f30a5c74931ed2570ab69bc07a87
activation = not_requested
existing_parties_rematerialized = false
```

Текущая среда перед remediation:

```text
repository_root = C:\Users\Slaven\Documents\Новгород\.tmp-pr17-review
repository = PavelSlaven/Novgorod1230
branch = chatgpt/item-container-120-approval-audit
head_before_remediation = c6279bad5971636adefb68c12c33da4b79b8df80
origin_main = 8c9e8db9b275e2be9b9e5eb28b59c49e8baef068
node = v24.16.0
npm = 11.13.0
python = 3.13.3
uv = 0.8.12
docker = 29.5.3
docker_compose = v5.1.4
graphify = 0.9.17
```

Полностью перечитаны обязательные нормативы: `AGENTS.md`, `.github/AGENTS.md`,
`development_rules.txt`, `code_critic_invocation_rule.txt`,
`code_driven_world_materialization_architecture.md`,
`llm_documentation_navigation.md`, `world_base_materialization_table_requirements.md`,
`read_only_database_and_graph_architecture.md`, `map_g0_g4_workflow.txt`,
`G1_SEMANTIC_CATALOG.md`, `SCHEMA_REFERENCE.md`, `items_and_property.txt`,
`character_inventory_equipment.txt`, `npc_inventory_item_marks.txt` и профильные
разделы `world_generation_and_turns.txt`.

Выполнены нормативный RAG и Graphify queries:

```text
Stage 3C promoted target revision PostgreSQL runtime loader Stage 8 Stage 13 Stage 14 Stage 16 repeat entry
generic node_type location materialization binding fallback G4 coverage typed hard block
PR17 Stage 3C approval request promotion plan public API internal migration tooling
```

Фактически выполненные проверки нового кандидата:

```text
npm run repo-intel:ensure                                           PASS
npm run repo-intel:status                                           PASS (knowledge-source degraded warning only)
repo-intel:query + graphify query, три запроса                       PASS
npm run item-container-120:generate                                 PASS (43 files)
node --test item-container-g4-projection, g4 coverage,
  runtime-catalog-loaders, pr17-stage3c-promotion                    24/24 PASS
npm run item-container-120:stage3c-request                          PASS
npm run item-container-120:stage3c:dry-run                         PASS
npm run item-container-120:stage3c:postgres:lifecycle              PASS
  rollback/apply/readback 39 datasets/repeat clean apply            PASS
  PostgreSQL readback → Stage 8/13/14/16 → repeat-entry, 9 G4       PASS
node --test runtime-catalog-loaders                                 12/12 PASS
npm test                                                            PASS
  world-catalog                                                     131/131 PASS
  modules                                                           194/194 PASS
  shadow                                                            6/6 PASS
  cutover                                                           4/4 PASS
  integration                                                       21 PASS, 5 PostgreSQL skips
  browser E2E                                                       1 skip: Chromium executable absent
  architecture                                                      PASS
clean-clone acceptance exact commit
  7ddb03e11e8c432e7ced1f0e7b86923ee87b4038                         PASS
  npm ci, docs/generated reproducibility, candidate/request/dry-run  PASS
  PostgreSQL Stage 3C runtime E2E 9/9 and repeat clean apply         PASS
  npm test                                                           PASS
```

Актуальный gate:

```text
historical_review = user_confirmed
canonical_candidate_compiled = true
canonical_candidate_validated = true
generic_location_fallback = removed
approved_runtime_g4_coverage = 9/9
fresh_approve_all_120_attestation = completed
stage3c_postgresql_runtime_e2e = PASS
stage3c_promotion_for_current_candidate = completed_in_isolated_review_database
full_npm_test = PASS
independent_critic_for_current_candidate = PASS
clean_clone_acceptance_for_current_candidate = PASS
clean_clone_functional_sha = 7ddb03e11e8c432e7ced1f0e7b86923ee87b4038
github_ci_for_current_candidate = PASS (workflow 29990348896, head 622fe847f67eb212771f8c7a25d1dc42ad823346)
runtime_activation = false
existing_parties_rematerialized = false
pr_state = ready_for_review
merge_ready = true
```

Независимый critic проверил текущий exact remediation diff, digests, evidence,
отсутствие generic fallback, coverage `9/9`, PostgreSQL DB-readback runtime E2E,
internal API boundary и актуальность README; verdict: `PASS`.

GitHub clean-clone CI для текущего functional/evidence tree завершён успешно.
Следующий возможный шаг — только ручной merge после review. Автоматический merge,
activation и rematerialization этим approval не разрешены.
