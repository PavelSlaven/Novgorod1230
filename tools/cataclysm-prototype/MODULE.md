# cataclysm-prototype

## Назначение

Изолированные native проверки пригодности Cataclysm-DDA для Novgorod и
живая dev-проба. Стенд использует отдельную копию upstream;
dev launcher — отдельный постоянный userdir. Фактические проверки и границы:
[результат задания 03](TASK03-LIVE-RESULT.md).

## Владеет

- Воспроизводимым подключением теста к закреплённой native сборке.
- Подстановкой управляемого ввода в native test mode, без подмены результатов.
- Подготовкой native visibility caches в существующем input loop без renderer.
- Проверками штатного игрового цикла и программного readback для исследователя.
- Экспериментальным принятием полного поколения native userdir + semantic facts
  и executed operation IDs, включая crash/retry проверки.

## Граница

CDDA владеет физическими переходами, часами, предметами, NPC и native RNG.
Тестовая fixture задаёт начальное состояние; assertions читают фактический
результат. Очередь тестового ввода не является semantic planner или игровым API.
Исчерпание очереди явно завершает тест ошибкой, не вводит бесконечный пустой ход.
Read-only observer фиксирует состояние на границе ввода; обнаружение угрозы и
safe mode исполняет штатный `mon_info_update`, не observer.

P4 coordinator — единственный владелец принятия общего поколения в отладочном эксперименте.
CDDA по-прежнему владеет физическим save/load; staging mutable, принятые каталоги
неизменны, current/previous публикуются одной атомарной записью. Текущие P3-ветки
сохраняют `snapshot` и `native_readback` в semantic JSON; это выявленный дубль
физической проекции, подлежащий удалению из штатного пути. Неизвестное принятое состояние
останавливает retry как uncertain. Это отдельный изолированный probe, не новый
production transaction path.

Native deserialization переносит сохранённые item instances с прежними UID;
обычная copy semantics создаёт новые identity. Native save/load также владеет
файлом состояния RNG engine в существующем стенде. Координатор требует его,
но не вычисляет RNG самостоятельно. Live overlay ограничивает RNG sidecar
режимом test_mode с явным P4 opt-in. После обычного live save/reload sidecar
в userdir отсутствует; focused native RNG проверки проходят.
Журнал operation IDs, квитанции и сохранение каждой операции принадлежат
отдельному отладочному coordinator, который live socket adapter не вызывает.
Побитовый replay игры не требуется.

Opt-in preload host выполняет `g->setup()` и `load_world_modfiles()` одного
профиля до запуска измеряемого child. Это world-specific setup, включая моды,
не только static/core definitions; его стоимость исключалась из старого warm p95.
Каждый fork-child перенастраивает userdir/cache пути и полностью загружает
сохранение из staging или validation scratch. Parent не вызывает
`load(save_t)`, действия или `save()`; это не означает отсутствия world setup.
Host заморожен как ускоритель стенда. Для игры используется один живой CDDA
с родным сохранением по запросу и autosave true/3600 turns/5 real minutes.
Часовой рубеж также подчиняется родному ограничению реального времени.
Прежний бюджет ≤5 с на операцию отменён; новые ворота описаны в плане среза.

Инструмент не подключён к production runtime Novgorod и не меняет active bindings.
Dev launcher читает только собственный постоянный userdir. Он не предоставляет renderer, HTTP server,
новую физику или LLM fallback. Native test readback
предназначен исследователю, не является разрешённой player-safe проекцией.

## Проверка

Исполняемый путь — upstream `cata_test`; task01 smoke использует P3
`create`/`apply` speech probe, nested item/UID regressions и item/JSON/pickup
controls.
Порядок подключения: `native-input`, `native-persistence`, `native-item-identity`,
`native-rng-state`, `native-preload`, затем `native-semantic-input`; после них
test-only `native-control-tests` проверяет сохранение каждого UID и чтение legacy RLE. Preload
единолично включает P4 preload, semantic patch его не откатывает. Исходная ревизия и команды — в
[README](README.md).
После этих семи overlay подключается `native-live-input`, затем
`native-autosave-options`. `novgorod_semantic.cpp/.h` копируются в src,
`novgorod_semantic_test.cpp` и `novgorod_autosave_test.cpp` — в tests.
Общие observation/apply/readback принадлежат src; test wrapper сохраняет
диагностические snapshots вне живого observation.
Зелёный native тест не является приёмкой semantic/NPC/narration интеграции или
production cutover. Live AF_UNIX adapter переиспользует прежний JS role runtime;
owner промптов/LLM остаётся в packages и apps/game-server. Общий родной CHAT
фильтр и creature_select_menu выбирают адресата; private target_actor_ref
заполняет существующий emit_interaction.target_actor_refs. Ответ допускается
только выбранному услышавшему NPC после повторной проверки identity/visibility.
Canonical player delivery переносится только в private native args: loudness 1
использует родной minimum_voice_volume, 2 — общий Character::indoor_voice,
3/4 — get_shout_volume. Правило indoor_voice вынесено из npc без копии;
родной источник — upstream npc.cpp:2116–2155. Instant оплачивает родную цену
chat (npctalk.cpp:1541) без дополнительной wait activity; brief сохраняет
прежнюю activity. Sustained отклоняется до native execute с явным сообщением.
Canonical emit_interaction и prompt owner не меняются. Native popup использует
собственный предел 1024 display columns вместо прежнего width 70.
Шёпот игрока (loudness 1) не слышит никто, даже сосед: родной `process_sound_markers`
вычитает расстояние из громкости (`sounds.cpp:626`) и отбрасывает звук с
`heard_volume <= 0` (`sounds.cpp:628`), а `minimum_voice_volume` равен 1
(`character.h:3376`). Поэтому `actualHeardListenerIds` при loudness 1 пуст,
при loudness 2 (`indoor_voice`) список содержит близкого NPC.
Тест `[novgorod_live]` «whispered avatar speech» фиксирует это измеренное
поведение; мост его не обходит и порог не меняет.
Исторический PS1 E2E с fake описан в [TASK03-LIVE-RESULT](TASK03-LIVE-RESULT.md),
первый провод Qwen — в [TASK03-QWEN-RESULT](TASK03-QWEN-RESULT.md).
Эти проверки не означают P3 GO или production cutover. UI/smoke
команды и незавершённые области перечислены в [PLAY.md](PLAY.md). Task01
curses smoke загрузил P1 мир и подтвердил save-and-quit; runtime data directory
должен содержать `gfx`, а `--datadir` требует завершающий `/` в этой сборке.
Ограничения и PTY evidence записаны в
`artifacts/2026-10-19/task01/native-handoff.md`.

P4 — opt-in `[novgorod_persistence]`, `generations.py` и отдельная fault matrix;
обычный upstream test lifecycle сохраняется без P4 environment. Python unit
checks проверяют coordinator invariants и сами по себе не доказывают native
persistence. [Спецификация P4](../../docs/implementation/cataclysm-p4-experiment.md)
хранит исторический протокол стенда; штатные ворота и граница отладки — в
[плане среза](../../docs/plans/Novgorod1230_Cataclysm_Vertical_Slice_Implementation_Plan_2026-10-19.md).
