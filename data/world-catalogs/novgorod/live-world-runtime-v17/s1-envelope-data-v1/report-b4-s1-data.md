# b4-s1-data — candidate-only результат по issue #163

## Решение этого шага

Пакет оставляет `profile: null`; envelope S1 не выдуман. В `out/s1-source-map.json` сохранены 33 точных target selectors и проверенные refs. Для каждой строки и каждого из девяти обязательных полей создан typed gap в `out/s1-typed-gaps.json` (297 gaps). Это field-level отчёт в пределах уже утверждённой семьи; не закрытие issue 163-4.

## Exact target применимость и authored refs

Целевой `target-runtime-profiles-approved.json` фиксирует revision `novgorod_spatial_v3_target_contract_approval_001`, 32 G4 → generated-template applicability rows и отдельный canonical south_approach selector. Всего 33 строки, 25 уникальных generated-template id. Сам target artifact approved, но `import_authorized=false`, `activation_authorized=false`; существующий `M2C_TARGET_S1_ENVELOPE_DATA_GAP` говорит `profile:null` и требует exact property/function/environment/semantic refs и применимую target position/topology. См. `source_pins.target` и JSON pointers в source map.

32 generated selectors ссылаются на generation-template version 1. В read-only open-capacity v2 data есть записи тех же G5 ids с version 2, далее profile version 2 и exact-source scene-template кандидаты. Их topology осмотрена и сохранена в source map как диагностическая: несовпадение version 1→2 запрещает такое соединение использовать как exact target S1 binding. Дополнительно v2 candidate остаётся без import/activation, хотя supplemental decision разрешает только data; target P12 index сообщает `blocked_fail_closed`, `materialization_authorized=false`, blockers `P12_APPROVAL_UPSTREAM_MANIFEST_ORDER_MISMATCH` и `P12_APPROVAL_BRANCH_HEAD_UNBOUND`. Ни candidate refs, ни статус пакета не повышены этим отчётом.

Для единственного canonical G5 selector exact `stfv3__g5_route_approach_v1@1` присутствует в target row и в pinned scene-template source. Existing scene template имеет G6 `main` (open, без enclosing structure) и authored `arrival`, `focus`, `departure` positions; movement template содержит локальные passage edges. Отдельный `target-start-candidate.json` ссылается на G6 `main` / position `arrival`, но имеет `pending_independent_data_approval`, `approved=false`, import/activation false. Это существующая стартовая позиция, не interior/shelter S1 envelope.

В pinned source closure нет visibility-link rows. Не найдено interior/enclosing G6 и reciprocal visibility pair для target S1 structural entry. Movement не считается доказательством visibility. Поэтому позиционные/movement refs перечислены как ограниченные existing authored topology evidence, но не допущены в новый структурный envelope. Требование парной topology и полного physical payload сверено с `packages/materialization/src/spatial-v3-s1-first-entry.js:183-247`; профиль не создает persisted party instances. DB и production readback не проверялись.

Approved target applicability несёт G4 ids, classification triple и natural-profile ids; это не поля S1 property/function/environment/semantic payload. Проверенные `m2c-natural/candidate.json` и `m2c-natural-presentation/nature-successor-candidate-v2.json` имеют `candidate_approval_pending`/`approved=false`; их refs отмечены только как unapproved evidence. Не выводились доступ, укрытие, помещение, имущество, количество, историческое наличие или occupancy. Lower Dvina/fishing-camp не использован как target evidence; no foreign scope promoted.

## Артефакты

- `s1-v17-candidate.json` — candidate-only status, `profile:null`, допустимые exact selector/scene/position refs с пределами их свидетельства.
- `s1-source-map.json` — target source pins и hashes, per-selector applicability pointers, canonical authored refs и диагностические version-mismatched generation/topology mappings.
- `s1-typed-gaps.json` — 297 gaps: property, function, environment, semantic context, scene template, position, G6, movement и visibility для каждой из 33 target rows. Указаны typed reason, inspected source keys и требуемое доказательство.
- `validate-s1-candidate.mjs` — детерминированная task-local shape/reference/pin validator; не runtime contract.
- `bench/s1-envelope/` — D41 hypothesis, варианты A/B, 12 frozen cases, механический runner/dry-run. LLM не вызывался; dry-run не измеряет поведение/качество прозы.

## Handoff по WR §21.1

**Evidence:** перечисленные в source map файлы, hashes, JSON pointers/row keys, exact refs и версии; статус каждого источника записан отдельно.

**Inference:** версия 2 topology не подменяет version 1 selector; open `main`/passage не доказывает внутреннюю структуру; отсутствие exact target payload оставляет field gaps. Это вывод из перечисленных refs/контрактов, а не историческое утверждение.

**Approval:** author self-approval не выполнена и не подразумевается. Требуется independent reviewer для любого proposed S1 envelope. Target-start candidate не approved.

**Import/activation:** для этих артефактов не запрашивались и не разрешены. Runtime/consumer owners не менялись.

**Readback:** DB, party instances и production не читались; не проверено.

**D41 (исправление статуса первого прохода):** прежнее описание `synthetic validator fixtures` в runner было ошибочным и superseded. Текущий `bench/s1-envelope/run.mjs` только сверяет frozen inventory: 12 случаев получают `execution_status: not_run`; runner не исполняет validator fixtures и не делает model comparison/blind review. Сам D41 остаётся проектом гипотезы, A/B и набора случаев; production model comparison/blind review — отдельный будущий шаг до любых model-facing additions.

## Проверки

Проектные suites, PostgreSQL/Docker, LLM и runtime не запускались. Фактические task-local проверки:

- `node --check out/validate-s1-candidate.mjs` — PASS.
- `node --check out/bench/s1-envelope/run.mjs` — PASS.
- `node out/validate-s1-candidate.mjs` — PASS: 33 selectors, 297 typed gaps, 32 generated-topology diagnostics, 23 source pins; `profile=null`, approval/import/activation=false.
- Историческая строка первого прохода, superseded: `node out/bench/s1-envelope/run.mjs --dry-run` тогда была описана как проверяющая 12 frozen cases и 6 synthetic validator fixtures. Это описание fixtures неверно для текущей версии runner: актуальный dry-run подтверждает только inventory, 12 случаев `not_run`, без validator fixtures и без вызова модели.
- JSON.parse пяти файлов (`s1-v17-candidate.json`, `s1-source-map.json`, `s1-typed-gaps.json`, `bench/s1-envelope/cases.json`, `bench/s1-envelope/dry-run-result.json`) — PASS.

Это проверки только task-owned candidate/gap package и dry-run harness; schema валидатор production не запускался.

## Исправления по независимому ревью ap-b4-s1 (R1–R4)

Этот раздел обновляет выводы ревью по `DONE-b4-s1-data`; версия 2 сдаётся как `DONE-b4-s1-data-2`. Предыдущий профиль-null результат сохранён; утверждение, import, activation и issue closure по-прежнему не заявляются.

**R1 — locators исправлены и разрешаются.** 352 диагностические source-record locator references теперь используют реальные индексы pinned source arrays; каждый указатель проверяется RFC 6901 resolver’ом, source key/path, уникальностью точного source match и deep equality копии. Ещё 8 canonical G6/position/movement records сверяются так же; scene template @1 разрешён в двух pinned source records, а start placement указывает на `/initial_placement` как object field. Все declared record pointers текущих map/gap artifacts — 370 штук — dereference’ятся и совпадают с embedded records. Validator отклоняет отрицательный/невалидный array index, выход за массив, чужой source path, копию от другого record/version и неоднозначный exact source match.

**R2 — validator проверяет источники и границы полей; mutation suite запускает его CLI.** Реконструируются target selectors из pinned target rows; все 23 pin keys/paths и bytes обязательны. Canonical scene, start placement, G6, positions и movement сравниваются с exact source rows; generated @2 diagnostics разрешаются отдельно и не повышаются до selector @1. Gap selectors сопоставляются полностью с точной target row projection, есть фиксированные field/reason enums, unknown keys/payload не принимаются. В `bench/s1-validator/` 12 прежних R2 мутаций и 4 R1 locator мутации запускают настоящий `validate-s1-candidate.mjs` отдельными Node CLI процессами. Все 16/16 получили ожидаемый отказ; baseline прошёл. Дополнительный unit negative fixture проверяет `SOURCE_RECORD_AMBIGUOUS` на дублированных точных записях. Машинные результаты и CLI logs находятся в `bench/s1-validator/results.json` и соответствующих `fixtures/*/cli.log`.

**R3 — D41 runner больше не записывает ожидание как результат.** `bench/s1-envelope/run.mjs` сверяет только frozen inventory и пишет для 12 случаев `execution_status: not_run`; нет `actual_gate`, per-case `match`, результата порога, gate execution или вывода о поведении модели. Реальные mutation результаты относятся только к validator и отдельно лежат в `bench/s1-validator/`. Модельный D41 не запускался.

**R4 — canonical field gaps описывают подтверждённые частичные refs.** Gap `S1G-33-scene_template_ref` теперь прямо фиксирует существующий approved `stfv3__g5_route_approach_v1@1`; нерешённым оставлено independent approval S1-admitted placement/profile binding. `S1G-33-g6_slot_ref` теперь фиксирует существующий authored open `main` G6; нерешённым оставлено независимое S1 structural binding на отдельный подходящий slot с обязательными position и reciprocal movement/visibility topology. Оба поля остаются typed gaps с точными field-local locators и незаявленным approval. Матрица сохраняет 297 gaps; причины теперь `unapproved=135`, `version_or_scope_mismatch=128`, `missing_topology=34`, `missing=0`.

### Повторные проверки после исправлений

- `node --check out/validate-s1-candidate.mjs` — exit 0.
- `timeout 30s bash out/bench/s1-validator/run-cli-selftests.sh` — exit 0: baseline accepted; 16/16 mutated candidates rejected с mutation-specific error code; duplicate exact source unit rejected.
- `node --check out/bench/s1-envelope/run.mjs` — exit 0.
- `node out/bench/s1-envelope/run.mjs --dry-run` — exit 0: frozen inventory shape only, 12 cases not run, zero gate/model executions.
- `node out/validate-s1-candidate.mjs` — exit 0: 33 selectors, 297 typed gaps, 32 generated diagnostics, 23 required source pins; all locator/source equality checks pass.
- JSON parse всех шести текущих candidate/source-map/gap/bench result artifacts — exit 0.

## Исправления по повторному независимому ревью ap-b4-s1-2

Этот раздел supersedes прежние формулировки проверок R3 и дополняет передачу `DONE-b4-s1-data-2`; прежние результаты 16/16 относятся к предыдущему состоянию validator.

**R5 — candidate provenance metadata привязаны к target-start pin.** Validator сверяет `canonical_start_position.source_path` с обязательным `targetStart` pin path, а `source_status` и `start_candidate_status` — с `status` документа target-start, чьи bytes/path закреплены pin SHA-256. Три отдельные мутации запускали настоящий validator как CLI на fixture-копиях: оба ложных статуса получили `CANONICAL_START_STATUS_MISMATCH`, чужой Lower Dvina locator получил `CANONICAL_START_SOURCE_PATH_MISMATCH`. Ошибки не были вызваны формой входа или CLI.

**R3 — исторические строки явно superseded.** Первое описание synthetic validator fixtures у D41 runner помечено как ошибочное историческое. Актуальный runner проверяет лишь inventory и оставляет 12 случаев `not_run`; validator mutation checks находятся в отдельном `bench/s1-validator/`. Model D41 по-прежнему не запускался.

### Проверки после R5/R3

- `node --check validate-s1-candidate.mjs` и `node --check bench/s1-validator/make-fixtures.mjs` — exit 0.
- `timeout 30s node validate-s1-candidate.mjs` — exit 0: 33 selectors, 297 typed gaps, 32 diagnostics, 23 source pins.
- `timeout 30s bash bench/s1-validator/run-cli-selftests.sh` — exit 0: baseline accepted; 19/19 invalid candidate mutations rejected с mutation-specific codes; accepted_invalid=0; ambiguity unit rejected duplicate exact source.
- Новые R5 CLI случаи: source_status → `CANONICAL_START_STATUS_MISMATCH`; start_candidate_status → `CANONICAL_START_STATUS_MISMATCH`; source_path → `CANONICAL_START_SOURCE_PATH_MISMATCH` (каждый exit 1).
- `node --check bench/s1-envelope/run.mjs` и `timeout 30s node bench/s1-envelope/run.mjs --dry-run` — exit 0: 12 cases `not_run`, model/gate calls=0.
- JSON parse шести current candidate/source-map/gap/bench artifact files — PASS; `bench/s1-validator/results.json` reports 19/19 rejected, 0 accepted-invalid, `passed=true`.

Timestamped `.bak` files — обязательные author backups предыдущих версий при изменении собственных output artifacts; они не являются текущими deliverables. Ни один pinned repository file не изменялся. Не выполнены independent re-review, production schema validator, project suites, DB/party/production readback и D41 model call.
