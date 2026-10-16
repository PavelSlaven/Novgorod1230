# F1 v17 — исправленный авторский пакет

Статус: `READY-b4-f1-data-3` для повторного независимого утверждения. Авторский пакет остаётся неутверждённым; `import_authorized:false`, `activation_authorized:false`. Перед текущими правками сохранены пять изменяемых артефактов с SHA-256 в `backups/20261003T063723Z/SHA256SUMS.txt`; `sha256sum -c` — PASS для всех пяти файлов. Предыдущая исходная копия сохранена в `backups/20261003T053734Z/`.

## Исправления по F1-01…F1-04

### F1-01 — валидатор

`validate-f1-candidate.mjs` читает утверждённый applicability set и проверяет равенство полного канонизированного набора всех 33 selectors, уникальность обоих наборов, версии refs, world revision и F1 capability gap. Проверка не зависит от порядка selector-ов. Во всех трёх местах (`candidate.scope_profiles`, `gaps.scope_coverage`, `gaps.gaps`) проверяются selector и связь с одной и той же scope. Проверяется точное множество 33 scope IDs × 7 gap IDs, включая уникальность всех 231 пар, а не только количество строк.

Есть закрытые allow-lists полей профиля, item candidates, actions, gap sections, rows и source records; запрещены незаявленные физические числа, target quantity/mass/depletion, дополнительный stock и вложенные approval/activation flags. Provenance mappings должны содержать обязательные claim pointers, разрешаться по JSON Pointer (поддержан только объявленный array wildcard), и ссылаться на известные источники. Все line ranges синтаксически проверяются, должны существовать в объявленном checkout и содержать непустые строки. Для upstream design files дополнительно проверяются approval SHA pins и точные G4/family joins.

`--self-test` сначала подтверждает чистый baseline, затем ловит 17 отрицательных мутаций, включая замену scope01 selector-ом scope02 при синхронном обновлении upstream refs, coverage и семи gap rows, а также потерю informational роли canonical property pointer. Для ключевых проверок сохраняются исходные статусы и cardinality: fake nonempty G4; дублирование пары scope-gap при 231 строках; добавление количества/массы, approval и механики; перенос массы из Lower Dvina; подмена типа на неподтверждённую зажигалку; удалённый provenance mapping; неверный source range. Каждая мутация требует ожидаемую диагностику.

### F1-02 — upstream source designs и typed gaps

Добавлена scoped связь с upstream finite-source designs по точной паре G4 + generated-template, не по номеру строки. M2c авторский пакет и его SHA совпадают с отдельным решением `m2c-sol-data-approval.json`; это **APPROVE_DATA_ONLY** для четырёх дизайнов и 32 G4-family joins. Одобрение прямо исключает текущие resource nodes, quantities/property decisions, mapped import, runtime use и release activation.

Из точных selectors target v17 с дизайнами соотносятся:

| Scope | Exact G4 / family match | Upstream design refs |
|---|---|---|
| `f1_scope_04` | reed backwater | `m2c_finite_reeds_v1` |
| `f1_scope_10` | wet conifer tract | `m2c_finite_deadwood_v1`, `m2c_finite_standing_wood_v1` |
| `f1_scope_11` | dry pine ridge | `m2c_finite_deadwood_v1`, `m2c_finite_standing_wood_v1` |
| `f1_scope_28` | Vikhtuy resource edge | `m2c_finite_deadwood_v1`, `m2c_finite_standing_wood_v1` |
| `f1_scope_31` | driftwood bar | `m2c_finite_driftwood_v1` |

Здесь upstream дизайны включают редакторские бюджеты и extraction rules: reeds — 20 × 50 г, extraction 1–5; deadwood — 60 × 50 г, extraction 1–20; driftwood — 100 × 50 г, extraction 1–40; standing wood — 200 × 50 г, extraction 1–100. Это **параметры дизайн-профилей**, а не текущие scene/party quantities и не утверждение, что материал пригоден как F1 fuel. В candidate записаны только точные design refs; числа остаются в pinned source-файле.

`f1_scope_33` — canonical arrival с тем же G4, но без generated template; generated finite-source design к нему не применяется. Его property-context ref сохранён только как `informational_g4_pointer_only_not_canonical_binding_or_current_access`; candidate, coverage и все семь gap rows несут одинаковую явную метку. Это G4 policy-context указатель, а не canonical G5 binding или текущее право доступа. Для остальных scopes нет matching finite-source design join в этой approved M2c версии. Тростник не классифицируется как F1 топливо; вода не входит в эти четыре source designs.

Поэтому причины `F1_FUEL_BINDING` и `F1_QUANTITY_MASS_DEPLETION` теперь различают scopes с upstream design и без него. Для первых указано, что design и editorial decrement известны, но нет committed/current node, F1 fuel classification, current quantity readback и F1 burn/consumption/retirement policy. Для вторых указано отсутствие applicable design. Все F1 gaps остаются открыты: upstream approval не закрывает target gap.

В property-context candidate есть exact G4 policy/profile joins. Их candidate SHA pin включён в source map; completeness assertion на `property-context-candidate.json:105-115` действует только для новых generated G5 и явно исключает canonical G5. Диапазон включён в source map и проверяется валидатором. Data-only approval исключает текущие property decisions, а правила сохраняют приоритет exact parcel rights. Gap говорит о недостающем текущем source-node owner/access readback.

### F1-03 — provenance, действия и gap boundary

В source map для target applicability добавлен диапазон `ref-pr98/.../target-runtime-profiles-approved.json:60-1262`; исходные строки `1902-1910` сохранены отдельно для F1 gap. Для generated-only completeness и исключения canonical G5 property-context source map включает `m2c-items/property-context-candidate.json:105-115`; валидатор проверяет этот диапазон и его assertions. Для `fuelwood.limits` и его свойства добавлена непосредственная ссылка `SRC_WK_COMBUSTION_58` на `final-static-r7-gap-repair-v1.json:58,114-115`.

`fire_is_basic_action` прямо отнесено к решению владельца в TASK. `start/add_fuel/extinguish` помечены как редакторская декомпозиция: существующий F1 owner даёт vocabulary `start/add_fuel/affect`; extinguish — только концептуальный outcome under `affect`, не whitelist команды и не обещание результата. Игрок может свободно попытаться; фактический исход остаётся у причинного/физического owner. Политика запрещает подставлять выдуманную authority для пропущенного source/access/quantity; typed gap не трактуется как отказ игроку или физическое отсутствие вещи. Основания: `turn_step_llm_contract.md:16-28`, `code_driven_world_materialization_architecture.md:147-151,283`, `WORKFLOW_RULES.md:243`.

### F1-04 — checkout и строка воды

Каждая запись источника в `f1-source-map.json` теперь называет checkout и абсолютный разрешённый путь. Пины: `ref-pr98` — `b3143fad851f67d24d1b9441e03ee0afef4bb658`; `ref-gamebase` — `3ab1c890c1caee2c1247ee144bf66bd35de705ec`. Source map разрешает путь внутри соответствующего pinned checkout, проверяет диапазон строк и не смешивает одноимённые CSV между копиями. В `ref-gamebase` `natural_materials.csv:23` — вода; в `ref-pr98` это лапник, а вода находится на :30. Отчёт ссылается на `ref-gamebase` при упоминании строки :23.

## Остаточные gaps и комплект

Target gap `M2C_TARGET_F1_SOURCE_BINDING_DATA_GAP` сохраняется для всех 33 scopes. У upstream source designs нет F1 committed/current stock, доступа/ownership readback, target water portion, initial fire/embers или топологии hearth/fire site. Кандидат не выдаёт source design за F1 топливо или живое состояние мира.

Обновлены `f1-v17-candidate.json`, `f1-source-map.json`, `f1-typed-gaps.json`, `validate-f1-candidate.mjs` и этот отчёт. `bench/` не менялся. В нём остаются подготовленные 12 случаев; запуск модели и слепая оценка не выполнялись.

## Проверки этого прохода

- `node --check validate-f1-candidate.mjs` — PASS.
- `node validate-f1-candidate.mjs --check` — PASS: exact unique target selector set, 33×7 coverage, upstream design joins/SHA pins, source checkout/ranges, provenance pointers и неутверждённый статус.
- `node validate-f1-candidate.mjs --self-test` — PASS: baseline и 17 targeted negative mutations.
- JSON syntax для candidate/source-map/gaps/bench cases и rubric — PASS (`python3 -m json.tool …`).
- Модельный A/B, фактический party stock/property readback, gameplay, runtime import/activation и PostgreSQL/Docker — не проверены.

Отдельное утверждение остаётся обязательным. Возможность автора выполнить детерминированные проверки не является утверждением данных по WR §21.1.
