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

projectP3NpcWire формирует private model-facing view полного NPC request для P3.
Он удаляет только code-owned service keys и вложенную копию
npc.available_resources; остальные domain fields, refs и их порядок сохраняются,
включая контрактные null, пустые массивы и объекты. undefined по-прежнему не
сериализуется, а проекция не зависит от system wording. Полную canonical форму
NPC subject, проверку request и равенство двух upstream copies ресурсов
по-прежнему задаёт общий owner @rus/npc-runtime; private view не меняет
public request schema.

## Запись кадра и физический распорядок NPC

Исходники наблюдателя — [`native-capture/novgorod_capture.cpp`](native-capture/novgorod_capture.cpp)
и [`novgorod_capture.h`](native-capture/novgorod_capture.h). `apply-overlays.sh` копирует их
в upstream `src/`, а [`native-perception-capture.patch`](native-perception-capture.patch)
подключает запись к ходу, вводу, видимым существам, движению NPC, сообщениям и звукам.
Временное перемещение при проверке видимости отмечается отдельно и не считается шагом NPC.
Переменная `NOVGOROD_CAPTURE_DIR` включает запись в указанный каталог. Наблюдатель
снимает родное состояние; выбор действий и физическое исполнение остаются у CDDA.

Каждая строка `perception.jsonl` — JSON с `sequence`, `native_turn`, `reason`,
`input_number`, `kind` и `frame` при `kind: full` либо `changes` при `kind: delta`.
Полный кадр задаёт состояние целиком; delta содержит изменившиеся поля верхнего уровня
целиком. Полный кадр пишется при старте, на границе ввода и каждые 60 ходов.
В кадре есть место, позиция героя, часы, свет, погода, видимая местность, объекты,
инвентарь, сообщения и звуки. `creatures` содержит видимых герою существ без аватара.
У NPC записаны `position`, `distance`, `direction`, `name`, `kind`, `id`, `type`,
`status`, `attitude`, `worn`, `wielded`, `activity`, `posture`, `attention`.
`activity` — `null` или `{id, verb, tool, material}`; орудие и материал берутся
из `chop_planks_activity_actor` и могут быть `null`. Поза имеет значения
`standing`, `sitting`, `crouching`, `prone`; отклик — `notices`, `unaware`, `attends`.
Условия вычисления позы и отклика описаны в [`dev-world/README.md`](dev-world/README.md).

В `player_state` родные `name`, `male`, `bmi_fat` задают имя, логический пол и жировой
индекс массы тела героя. Подписи состояния — `pain_label`, `hunger_label`,
`thirst_label`, `sleepiness_label`, `weariness_label`, `warmth_label`, `activity_label`,
`weight_label`; числовые поля — `pain`, `carried_weight_grams` (или `null` при отсутствии
кеша), `carry_capacity_grams`, `stamina`. `wetness_label` записывается как `null`,
а `body_parts` содержит `id`, `wetness`, `wetness_percent`, `temperature_c` каждой части
тела. Также записываются предмет в руках `wielded` (или `null`) и `activity_id`.

В живом пути CDDA модель NPC не получает операций движения: её `operation_contract`
пуст, а возвращённый `request_movement` отклоняется с `P3_NPC_OPERATION_UNAVAILABLE`.
Физическое перемещение и распорядок принадлежат CDDA по
[ADR-009](../../docs/adr/ADR-009-physical-npc-schedule-live-cdda.md).
Это ограничение NPC не отменяет запрос движения героя и отдельный разговорный путь.

[`native-npc-post-work.patch`](native-npc-post-work.patch) расширяет родные механизмы:

- класс получает `job_priorities`, которые `npc::randomize` применяет при создании;
  родной загрузчик класса не задаёт приоритеты работ, а сохранённые приоритеты
  после загрузки восстанавливает родной `job_data`;
- `hold_position` ищет родную работу в смену на посту внутри включённой зоны своей
  фракции: исходная ветка после потребностей только ставила NPC на паузу;
- работа поста приостанавливается через родной backlog и возобновляется при доступном
  рабочем посте: обычная отмена `ACT_CHOP_PLANKS` не допускает возобновления,
  а `revert_after_activity` очищает очередь;
- actor рубки хранит и сериализует типы орудия и материала для записи кадра:
  исходный actor сохранял только `moves`;
- обычный блок еды и питья вынесен без изменения его содержимого в отдельный метод;
  на посту он вызывается для жителя лагеря без опасности при жажде выше родного
  порога, поскольку исходная ветка поста закрывает этот блок повышенной опасностью;
- `map::place_npc` назначает размещённого внутри лагеря члена фракции-владельца его
  жителем через `add_assignee` после вставки NPC: родной `assign_camp` открывает
  интерфейс назначения работ и очищает пост;
- предикаты `camp_work` учитывают родные часы класса: исходные предикаты проверяли
  лагерь и наличие работы, но не окно смены.

## Проверка

Исполняемый путь — upstream `cata_test`; task01 smoke использует P3
`create`/`apply` speech probe, nested item/UID regressions и item/JSON/pickup
controls.
Порядок подключения overlays — единственный список [`native-overlays.txt`](native-overlays.txt);
его накладывает [`apply-overlays.sh`](apply-overlays.sh) и копирует `novgorod_semantic.cpp/.h`
и `native-capture/novgorod_capture.cpp/.h` в `src/`; этим скриптом пользуются Linux-сборка
и Windows-сборка в Actions.
Test-only `native-control-tests` проверяет сохранение каждого UID и чтение legacy RLE. Preload
единолично включает P4 preload, semantic patch его не откатывает. Исходная ревизия и команды — в
[README](README.md). Полный список копируемых в `tests/` исходников задаёт
[`run-native-tests-ci.sh`](run-native-tests-ci.sh), включая semantic, autosave, capture и post-work.
Общие observation/apply/readback принадлежат src; test wrapper сохраняет
диагностические snapshots вне живого observation.
Зелёный native тест не является приёмкой semantic/NPC/narration интеграции или
production cutover. Live AF_UNIX adapter переиспользует прежний JS role runtime;
owner промптов/LLM остаётся в packages и apps/game-server. Свободное действие
передаёт дословный intent без предварительного адресата; явный CHAT сохраняет
родной chat_available_creatures/creature_select_menu. Граница предлагает
emit_interaction каждому видимому NPC; active_interlocutor берётся только из
подтверждённого разговора. Планировщик выбирает речь и адресата, а native
исполняет выбранный ref. Ответ допускается только выбранному услышавшему NPC
после повторной проверки identity/visibility.
Общий game-server speech helper единолично разбирает громкость из текущего
request.remaining_intent для direct assembler и P3 projection public
emit_interaction с interaction_kind: speech при resolution: domain_request:
по умолчанию 2; отдельные «шепчу», «шепотом»,
«шёпотом» дают 1, «кричу», «криком» — 4. Регистр не влияет; поддержанные
цитаты исключаются, непосредственное «не» отрицает cue, первое
неотрицательное указание действует. P3 не содержит второй реализации parser
и не использует loudness модели. Этот P3 потребитель использует тот же helper
и те же cue rules, что direct assembler, для текущего request.remaining_intent и передаёт результат в private native args;
assembled domain_request DTO не обязан содержать semantic.utterance.
Direct full-plan player_utterance получает loudness от общего assembler до
strict validation, а его duration_class остаётся обязательным выбором модели.
Только существующий P3 domain speech profile без delivery сохраняет прежний brief default.
Полученная player delivery переносится только в private native args: loudness 1
использует родной minimum_voice_volume, 2 — общий Character::indoor_voice,
3/4 — get_shout_volume. Правило indoor_voice вынесено из npc без копии;
родной источник — upstream npc.cpp:2116–2155. Instant оплачивает родную цену
chat (npctalk.cpp:1541) без дополнительной wait activity; brief сохраняет
прежнюю activity. Sustained отклоняется до native execute; код причины остаётся в журнале отладки координатора, новой строки игроку нет.
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
