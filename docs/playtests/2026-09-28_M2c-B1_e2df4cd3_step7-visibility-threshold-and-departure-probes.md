# M2c B1 (CR #160): step 7 / 7б — visibility threshold fix and departure probes

Вынесено из [`2026-09-28_M2c-B1_2d2b3010_passages.md`](./2026-09-28_M2c-B1_2d2b3010_passages.md) (раньше — разделы «Шаг 7» и «Шаг 7б»). Текст ниже перенесён без переписывания; failed evidence не менялось. Базовый прогон и его Identity — в том файле.

## Identity

- Ветка `m2c/b1-passages`. Живой зонд ДО фикса (захват плана планировщика, `step7-report.json`): HEAD `2d2b3010e30184a874da2b4e684c3aeba28840b5`, 2026-09-28 16:38 (+03:00). Зонды ПОСЛЕ фикса `e2df4cd3bf19f4adde69c6fc337f6ea3af25ac33` (коммит 2026-09-28 17:16): целевые прогоны 7б (`step7b-report.json`, 17:31) и 5 попыток (`step7b-5attempts-report.json`, 17:59).
- Модель: `qwen3.8-27b-uncensored-w4a16-tp2` (записана в `step7-report.json`; в остальных сырых отчётах не сохранена, тот же шлюз и `llm-settings.json`).
- Стенд: реальный Docker PostgreSQL через `pg-slot`, реальный `createSpatialV3ProductionCompositionRoot`, реальный HTTP-сервер на loopback, Qwen — клиентом. Driver — одноразовый untracked-скрипт, удалён.
- Сырые отчёты — в bridge `out/` (не в репозитории): `step7-report.json`, `step7b-5attempts-report.json`, `step7b-report.json`. Санитизировано: приватный endpoint LLM-шлюза, ключи и заголовки авторизации не публикуются (значения читались из локального `llm-settings.json`, в отчёты и репозиторий не попадали).

## Preconditions

Сценарии `novgorod_riverbank_approach_v1` (речной выход) и `novgorod_pine_ridge_approach_v1` (сухопутный). Предыдущий шаг 6 не засчитан ревьюером по пункту 3 (свободная фраза с видимым описанием выхода).

## Gameplay transcript

### Шаг 7 — причина блока движения, фикс (а), живой зонд (б)

Ревьюер не засчитал step 6 по пункту 3. Разведка (`PLAN-B1-step7`) и фикс —
`PLAN-OK-B1-step7`.

#### Причина (а) — найдена и исправлена

`spatial-v3-current-visibility-inputs.js:readCurrentTargetConditions` для
`directional_exit`/`local_edge` всегда возвращает `dynamic_occlusion:'clear',
concealment:'clear'`, но `stable_cover` — ландшафтная константа G4 (не зависит от
позиции внутри сцены). Резолвер (`spatial-v3-projection.js`) берёт худшее из
`[base, lighting, stable_cover, dynamic_occlusion, concealment, weather]`. Для
`riverbank_approach` G4 `g4v3__gn_nov_g3_xp017_yp026_r2_south_entry_reach` →
`landscape_template_id: lt_low_alluvial_riverbank` → `stable_cover: "partial"`
(`natural-source-stable-cover-candidate.json`). Проверил все 7 строк каталога: **24 из
32 G4** имеют `stable_cover:'partial'` (только `lt_freshwater_marsh` и
`lt_alluvial_floodplain` — `'clear'`). Значит видимость `'clear'` для directional exit
недостижима движением почти нигде на карте — конфликт правила шага 3
(`visibility==='clear'` как порог показа `pass_target_description`), не баг данных.

**Исправление (по решению ревьюера, `PLAN-OK-B1-step7`):** порог ослаблен с `'clear'`
до «любая видимость кроме `'none'`» — симметрично тому, как local_edge уже включается
в список при `'partial'`. Падающий тест написан первым (регресс на
`spatial-v3-current-visibility-provider.test.js`, ранее assертил обратное — «partial
падает обратно на ordinal» — теперь assертит показ описания), затем правка в
`spatial-v3-current-visibility-provider.js` и `spatial-v3-proposed-visible-sources.js`.
`test:apps` 2029/2032/0 fail/3 skip. Коммит `e2df4cd3`.

#### Причина (б) — живой зонд, 5 попыток

Один прогон через `pg-slot` (untracked-скрипт, как в шаге 6): 5 независимых партий той
же сцены (`riverbank_approach`), каждая — «Осматриваюсь вокруг.», затем свободная
фраза с уже показанным (post-fix) ярлыком выхода.

| # | ярлык ребра | ярлык выхода | различаются | позиция сменилась | классификация | рассказчик |
|---|---|---|---|---|---|---|
| 1 | Проход 1 | к руслу | да | нет | no_operation_no_move | «Ты направляешься к руслу, но не удаётся достичь цели «к руслу»» |
| 2 | Проход 1 | к руслу | да | нет | no_operation_no_move | «Вы не достигли цели «к руслу»» |
| 3 | Проход 1 | к руслу | да | нет | no_operation_no_move | «Ты направляешься к руслу, но не удаётся достичь цели «к руслу»» |
| 4 | Проход 1 | к руслу | да | нет | no_operation_no_move | «Вы не достигли цели «к руслу»» |
| 5 | Проход 1 | к руслу | да | нет | no_operation_no_move | «Ты направляешься к руслу, но не удаётся достичь цели «к руслу»» |

Ярлыки теперь **различаются** во всех 5 попытках (фикс (а) подтверждён живьём). Но
**выход выбран/пройден 0 из 5** — ниже порога 4/5 из `PLAN-OK-B1-step7`. Во всех 5
попытках — `HTTP 200`, `screen.failure: null`, связный внутриигровой отказ (не крах,
не 5xx), позиция не изменилась.

Разбор кода (`lower-dvina-trace-expansion-commands.js`): переход через exit — ОДНА
атомарная команда (`prepareExpansion` + `prepareTraversal` в одном `consequence()`), а
не две раздельные операции планировщика. При падении `prepareTraversal` код ловит
исключение и превращает его в чистый структурный отказ
(`LIVE_WORLD_TOPOLOGY_COMMITTED_MOVEMENT_DENIED`, «персонаж остался на месте, время не
изменилось») — то есть отказ narrated, не крах, архитектурно верно. Точную причину
падения `prepareTraversal` (нехватка предпосылки вроде лодки/vessel для речного
"channel"-выхода, авторский пробел в этом G4/связи, или иной структурный gap) я не
установил — это отдельный разбор `spatial-v3-site-traversal-runtime.js`, за пределами
того, что можно доказать без ещё одного целевого прогона. Отдельно, ДО фикса (а) (когда
метки ещё совпадали текстово), захваченный план планировщика показал модель, явно
путающую выход с локальным ребром (`operations[0]: {op:'request_movement',
movement_kind:'local', target_ref:'...edge:edge_1'}`, `reason: "Player requests to
continue the path via exit 1, which matches the available local movement operation"`) —
после фикса (а) эта конкретная путаница по меткам должна быть исключена (метки
различаются), но 0/5 показывает, что остаётся ДРУГОЙ, ещё не установленный блокер на
уровне `prepareTraversal`.

Прямой путь без LLM подтверждён отсутствующим: `suggested_actions` пуст и до, и после
попытки во всех прогонах.

Сырые отчёты (рабочий мост исполнителя, вне репозитория):
`step7-report.json`, `step7b-5attempts-report.json`.

### Шаг 7б — целевой прогон по `A-B1-03`

По указанию ревьюера: 3 попытки на тот же (речной) выход, 2 на выход другого типа
(сухопутный старт `novgorod_pine_ridge_approach_v1`), чтобы разделить «этому выходу
нужна лодка» и «сломаны все выходы».

#### Результат (3 речных + 2 сухопутных попытки)

Все 5 попыток — **одна и та же классификация**: `local_edge_move_within_same_scene`
(планировщик выбрал локальное ребро, не переход через exit). Ни в одной попытке не
появилось ни одной строки в `party_runtime.g5_site_connections` для этой партии —
то есть `prepareExpansion`/`prepareTraversal` **не вызывались вовсе**: планировщик не
дошёл даже до выбора этой операции. 2 из 5 попали в уже описанный (LW-077)
narration-audit-отказ (не относится к движению).

Решающая находка — собственное объяснение модели (`plan_reason`, дословно):
- Речной выход: *«The player requests movement toward the river course; the supplied
  local movement operation is the only code-owned movement choice.»*
- Сухопутный выход: *«Player requests movement to the forest; selecting the available
  local movement operation.»*

Модель explicitly утверждает, что операция перехода **не была ей предложена** —
это не путаница модели, а корректное отражение фактического списка
`available_domain_operations` в этот момент. Симптом одинаков для реки И леса —
это исключает «этому выходу конкретно нужна лодка».

#### Причина, найденная по коду (не по догадке)

`spatial-v3-expansion-runtime.js`, `eligibleExpansions()`: команда перехода через exit
собирается только когда `scene.endpoint_slots` содержит слот с
`endpoint_role IN ('departure','both')`, чей `required_position_slot_key`/
`required_position_instance_ordinal` совпадает с ТЕКУЩЕЙ позицией актёра. Комментарий
в коде: *«Arrival/focus navigation is a separate ordinary local movement command.»* —
то есть переход в принципе не предлагается, пока актёр не встал именно на позицию с
ролью `departure`. Во всех 5 попытках актёр оставался на `arrival:0` (стартовая позиция
сцены).

#### Подтверждающий прогон: один локальный шаг недостаточен

Один party, ход «Осматриваюсь», затем один локальный шаг (`Проход 1`, arrival:0 →
focus:0), затем попытка выхода. Экран по-прежнему показывает выход («к руслу») как
видимый, но **`plan_operations` снова пуст**, и модель прямо говорит:

> «The player requests movement to the riverbed, but the supplied available domain
> operations only cover local movement to Проход 1 and Проход 2. The destination 'к
> руслу' is visible in the scene but lacks a corresponding code-owned movement
> operation choice, and the actor's movement is blocked by the absence of a valid
> movement path in the current state.»

Значит `focus:0` — тоже не позиция `departure`. По указанию `A-B1-04` (после того, как
ревьюер починил `pg-slot`, стоявший в очереди только на слот 1) сделал ещё два целевых
прогона через `pg-slot`, оба в переднем плане.

#### Прогон 1 — навигация по локальным рёбрам до `departure`, 3+2 попытки

Для каждой из 5 попыток (3 речных + 2 сухопутных) искал через
`party_runtime.scene_movement_edges` ребро, ведущее к позиции `:position:departure:`, и
проходил его тем же ярлыком, который в этот момент показывал экран (до 3 прыжков).
Результат — **ни одна из 5 попыток не оказалась на позиции `departure` к моменту
попытки выхода** (`position_before` во всех пяти — `focus:0`). Журнал прыжков
показывает причину: свободный текст «Проход 1» не привязан к одному и тому же
`edge_id` между ходами (это уже было установлено в шаге 6 — то, что показывается как
«Проход 1», меняется от хода к ходу), поэтому повторная отправка одного и того же
ярлыка не гарантирует движение в одном направлении — в одной из попыток третий прыжок
внезапно стартовал снова с `arrival:0`, хотя второй прыжок должен был закончиться на
`departure:0`. Во всех 5 — тот же итог, что и раньше: `plan_operations: []`,
`g5_site_connections: []`, рассказчик даёт связный отказ («не удаётся достичь цели»),
собственное объяснение модели снова прямо говорит об отсутствии подходящей операции
(например: *«The requested destination is visible, but no supplied code-owned
movement operation targets it.»*).

#### Прогон 2 — прямая подсадка позиции на `departure` (без обхода через LLM-навигацию)

Чтобы исключить ненадёжность LLM-навигации как причину, попробовал более прямой
способ: одна партия, `«Осматриваюсь»`, затем **прямое обновление**
`party_runtime.party_journey_locations.scene_position_id` на найденную по
`scene_position_nodes` позицию `...:position:departure:0` этой же сцены (тестовая
подсадка, как раньше для «занято»), затем повторный `«Осматриваюсь»` и попытка выхода.

Подсадка позиции в БД прошла успешно (`position_before_attempt` подтверждает
`departure:0`), но следующий же ход вернул **`HTTP 409 TRACE_PHASE_2_SESSION_READ_INVALID`
(«Persisted Phase 2 state failed exact cross-table validation.»,
`lower-dvina-trace-phase-2-read.js`)** — прямая правка одного поля `scene_position_id`
рассинхронизировала его с другим местом, где позиция дублируется/кэшируется (например,
`current_visible_context`), и рамка целостности хода correctно это поймала. Экран и
попытка выхода из `departure` в итоге не выполнились технически (`exit_label: null`) —
это методологический тупик испытания, а не опровержение гипотезы.

#### Итог по причине (б)

Оба способа проверить гипотезу «с позиции `departure` переход предлагается» упёрлись в
независимые технические ограничения инструмента прогона (ненадёжная LLM-навигация по
локальным рёбрам; хрупкость прямой подсадки одного поля позиции). **Гипотеза не
подтверждена и не опровергнута живым прогоном** — но код-уровневое основание для неё
остаётся точным и не домысленным: `spatial-v3-expansion-runtime.js`'s
`eligibleExpansions()` буквально фильтрует по
`endpoint_role IN ('departure','both')` и явно комментирует, что
«Arrival/focus navigation is a separate ordinary local movement command» — то есть
операция перехода структурно не собирается вне позиции `departure`, независимо от
LLM. Видимость выхода игроку (`display_label`/`pass_target_description`), при этом,
не привязана к тому, находится ли актёр на этой позиции — выход показывается как
видимый уже с `arrival:0`.

Похоже на **(б) «ошибка кода/дизайна»**, а не пробел авторских данных (симптом
одинаков для реки и леса, для трёх независимо сгенерированных G5) и не законный отказ
(ни разу не удалось наблюдать содержательную причину вроде «нужна лодка» — модель
сообщает именно «операция не предложена», не «операция отклонена по условию»).

## Persistence/readback

В этих прогонах перезапуск сервера не выполнялся. Проверялась запись БД: `party_runtime.g5_site_connections` пуста во всех попытках 7б (переход не вызывался), прямая подсадка позиции дала `TRACE_PHASE_2_SESSION_READ_INVALID` (см. «Прогон 2»).

## Findings

Причина (а): порог `'clear'` для описания цели прохода недостижим при ландшафтной `stable_cover: partial` (24 из 32 G4) — исправлено (`e2df4cd3`). Причина (б): переход предлагается только с позиции `departure`; актёр оставался на `arrival`/`focus`.

## Result

Порог исправлен и подтверждён живьём (ярлыки различаются 5/5); выход не пройден 0/5 — блокер найден по коду (переход только с `departure`) и закрыт следующими шагами (см. [`2026-09-28_M2c-B1_375a489f_step7c-approach-stand-probes.md`](./2026-09-28_M2c-B1_375a489f_step7c-approach-stand-probes.md)).
