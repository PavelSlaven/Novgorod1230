# Item/container 120: V5 integration handoff

## Цель

Интегрировать в существующий PR #17 проверенный редакторский пакет из 120 предметов и контейнеров для Новгородской земли около 1230 года, не создавая параллельную архитектуру и не подменяя package-local проверки каноническими approval/import gates.

Работа продолжается только в этом PR. Новый PR запрещён.

## Каноническая база

- Repository: `PavelSlaven/Novgorod1230`.
- Base branch: `main`.
- Working branch: `chatgpt/item-container-120-approval-audit`.
- Pull request: `#17`.
- PR остаётся draft до завершения локальной интеграции, тестов, PostgreSQL lifecycle и независимого аудита.

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

## Что остаётся выполнить Codex

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

## Изменения текущего прохода

- README переведён с исходного source-discovery handoff на V5 integration handoff.
- `CODEX_HANDOFF_PROMPT.md` обновлён для работы с конкретным архивом и его digest.
- PR description обновляется с точной границей package-local и canonical readiness.
- Архив, игровые datasets, DDL и runtime-код этим проходом не коммитятся.

## Текущий статус

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

Текущий технический вывод: `READY_FOR_CODEX_LOCAL_INTEGRATION`, но не `READY_FOR_MERGE`.

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
