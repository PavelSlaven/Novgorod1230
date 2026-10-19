# Задание 03 — согласованный план dev-пробы

Статус: **REFERENCE / план исполнения, OK распорядителя на f28caff24 с поправками D219 от 2026-10-19**. Это не production cutover и не P3 GO. Источник поправок — полный `task-03-ok-notes.md`, проверка Sonnet high `task03-plan-check/{transport,conformance,evening}.md` и сообщение OK. При конфликте с прежним M2/M3 действует это решение владельца. Активные контракты, AGENTS/governance и CONTRACT_INDEX не меняются.

## Цель, рамка и порядок

Один живой CDDA curses на новгородском мире, свободный текст игрока и речь NPC через локальный Qwen. Шесть уже зарегистрированных примитивов (`move`, `use_item`, `open`, `wait`, `speak`, `pickup`), локальные цели в радиусе 1: это честная граница dev-пробы, не целевая свобода игры. Вне неё игрок получает понятный отказ о границе пробы. Обычная вещь исполняется родными действиями, без полного item-рефакторинга.

Порядок: **2 → 3 → 4 → 6 → 5a → 5b → 7**. 5b и 7 — если успеваются; незавершённое назначенное движение NPC не показывать. Сдача при готовности 2–4/6 либо блокировке, не позже **2026-10-19 12:00Z** по `date -u`. Каждый завершённый этап — commit и немедленный push в draft PR #770. Перед финальным push механически влить origin/main с #778 без rebase; generated — только генератором. PR/main самому не сливать.

Native-first: карта CDDA → CBM `cdda-upstream-0d8843f` → снимок `0d8843f1c500052c3e026e3da6f8edaf5e00b626`; `src/...` ниже относительно снимка. Новый механизм при подходящем родном аналоге либо смена подхода — STOP распорядителю. Текущий production определяется active owners/bindings, а не этой dev-пробой. До CR к P7 вся проза помечена «черновик, не сохранено»; после аварии возможен откат прочитанного до последнего сохранения (D216).

## M1 — обязательное условие, без изменения

**M1. Шаг 2 (NPC): записать «родное проверено» до кода; goto сериализовать узко.**
Где: `tools/cataclysm-prototype/TASK02-CODE-PLAN.md`, строка таблицы шага 2. Снимок: `npctalk.cpp:5205-5235,8624` (f_npc_goal), `npctalk.cpp:5238-5251` (guard_pos), `npctalk.cpp:1354,1358` (единственный сеттер goto — UI), `savegame_json.cpp` (goto_to_this_pos отсутствует).
Правка: в шаге 2 до кода дать таблицу «проверено и отклонено», каждый пункт с файлом:строкой снимка.
(а) `u_set_goal`/`npc_set_goal` (`npctalk.cpp:5205-5235`) работает на уровне OMT: ставит NPC_MISSION_TRAVELLING, сбрасывает guard_pos и attitude, при пустом omt_path уходит в false_eocs. Для тайла внутри сцены не годится; для дальних переходов остаётся родным EOC.
(б) `npc_set_guard_pos` (`npctalk.cpp:5238-5251`, `npcmove.cpp:3557-3561`) — постоянный пост; события «достиг» нет (`npcmove.cpp:2161-2164`).
(в) Выбран `goto_to_this_pos` (`npc.h:1669`; BT `npcmove.cpp:1790,1866,2416-2422`; арбитраж `npc_arbitration.cpp:280,450-467`). Пробел: нет сериализации и нет EOC-сеттера.
Что делать:
- Чтение и запись `goto_to_this_pos` добавить в существующие `npc::load/store` рядом с `goal` (`savegame_json.cpp:2056-2058` и `2260-2262`).
- Сеттер, если нужен, — один узкий эффект по образцу `f_guard_pos`, рядом с родными эффектами.
- Удалить шесть `novgorod_*` полей, ветку в `npc::move` и JS-исполнитель `npc_move`.
- Assignment ID хранить в `Creature::values`; своих progress/status/payload не заводить.
- Read-only причину прерывания добавлять, только если T09 покажет, что позиции NPC и наличия goto не хватает.
Закрытие проверять по diff кода и тесту «goto переживает save/load», а не по тексту плана.

Для типа `optional<tripoint_abs_ms>` образец и место сериализации — `guard_pos` в `src/savegame_json.cpp:2025,2264`, а не OMT-тип goal. Проверка огня использует native escape `src/npcmove.cpp:1663–1672`.

## M2 заменён D219: сохраняет родной CDDA

Родная цепочка остаётся: `do_turn.cpp:607–612` → `autosave()` (`game_io.cpp:941–948`) → `quicksave()` (`:891–912`) → `game::save()`. `do_turn.cpp` и поведение quicksave не меняются. Игровой профиль: **AUTOSAVE=true, AUTOSAVE_TURNS=3600, AUTOSAVE_MINUTES=5**, все три значения проверяются при старте. Верхнюю границу AUTOSAVE_TURNS в `options.cpp:1727–1731` поднять 1000 → 3600 одной правкой и проверить focused-тестом.

«Сохранить и играть дальше» — родной ACTION_QUICKSAVE (`handle_action.cpp:2953`), «сохранить перед сном» — родное (`:1296–1301`), ACTION_SAVE — сохранить и выйти. Новых путей сохранения и обёртки quicksave с изменённым bool-поведением нет. Родной пропуск no-moves и сброс счётчиков после неудачи остаются; ошибку показывает native UI. Пропущенный при скачке времени рубеж часа ловится на следующем рубеже, это принято D216.

5b: приём полного набора (копия → fsync файлов/каталога → current/previous) в C++, синхронно в конце успешного `game::save()` после `.pt` (`game_io.cpp:768–778`), до возврата в loop. Launcher только выбирает принятое current/previous на старте, сохраняя оба; не принимает поколения через IPC. Метаданные: `calendar::turn` и реальное время; восстановленный момент показывается на стартовом экране «мир восстановлен на <момент>». До готовности 5b не обещать crash-atomic поколение или этот экран.

Тестовые счётчики: **все вызовы save = успешные true + неуспешные (false/dirty/ошибка .pt); попытки приёма = успешные**. Неуспешные дают 0 изменений current/previous. Quicksave, вышедший до save из-за no-moves, не считается вызовом save. Счётчики только в тесте, без runtime ledger. Focused C++ проверяет успех/отказ/.pt и новый completion; расширенной recovery-матрицы сегодня нет. Проверка autosave: рубеж игрового часа сохраняет, сон 8 ч — не чаще одного раза в 5 реальных минут. Бюджеты владельца: save ≤5 с вместе с copy/fsync, warm start/recovery ≤20 с, поколение ≤512 МиБ.

Родные `mapsharing.cpp:110–171` и `filesystem.cpp:177–186` атомарны для одного файла, whole-set/fsync directories не покрывают; этот пробел принят ролью «4». Старые 1634 строки Python coordinator не переносятся в C++; per-operation generations/receipts/RNG sidecar остаются отладкой и не входят в live path.

## M3 — готовый родной кэш, без оптимизации сегодня

Cold ext4 diagnostic 20,028 с, три warm 15,305 / 14,756 / 15,404 с — [evidence](evidence/task03-ext4/REPORT.md). Cold остаётся честно указанным. По решению распорядителя восстановление после падения использует уже существующий `datadir/cache`: `json_loader.cpp:14–42`, `flexbuffer_cache.cpp:246–300`, ключ mtime переживает перезапуск. В шаге 2 отдельно один раз измерить warm start **того curses-бинарника, которым играет владелец**; diagnostic cata_test не подменяет его.

`active_mod_order` не урезать, `--noverify` не включать, finalize/consistency не исследовать. Своих кэшей и развития warm host нет. Runtime data/gfx, binary, cache, постоянный userdir и socket — ext4 WSL, без ссылок data/gfx на /mnt/c.

## Этапы, файлы и проверки

| Этап | Изменение | Проверка |
| --- | --- | --- |
| 2 | Отдельные `run-p3-dev.ps1` и WSL launcher рядом с прототипом; существующий smoke остаётся стендом. Один постоянный userdir, новая fixture только при первом запуске; reset только явно. Node закреплённой версии на уровне пользователя из официального nodejs.org архива с SHA256, без sudo/системных пакетов. | Настоящий интерактивный curses без smoke-wrapper; ожидание/движение/обычная вещь, native save/выход/reload. Warm start тем же бинарником. Проверка нового запуска и сохранности повторного. |
| 3 | Узкий `native-live-input.patch`, общие `novgorod_semantic.cpp/.h` в src; socket adapter/`p3-live-coordinator.mjs` переиспользует `runP3TurnStep`, `createP3RoleRuntime`, `loadP3QwenSettingsOwner` из p3-boundary.js. | Fake responder: успех/отказ/пустой ввод/timeout/coordinator crash/stale id; нет процесса на действие, JS не пишет userdir, PID CDDA сохраняется, native readback без копии всей физики. |
| 4 | `npc_make_sound`/`sounds::sound(..., sound_t::speech, ...)`, точная строка, родная громкость/слух и wait activity. Удалить мешающие живому пути JS hearing/fixed elapsed; pending-реплики и новый scheduler не создавать. | Native точный текст с литеральными тегами; каждый слышащий/глухой; реальный elapsed ACT_WAIT. Не выдавать немедленную доставку за частичную речь или закрытие T10. |
| 6 | `p3-dev-config.json` задаёт `npcMaxRepairAttempts: 1`; этот параметр узко добавляется существующему `packages/turn/src/npc-semantic-decision.js`, где сейчас structural и semantic repair считаются раздельно. Второго retry loop нет; #771 разрешает только согласованную пару Qwen alias/backend. Fake-тест сначала, затем малый локальный bench по уже данному OK. | Два плохих ответа → ровно 2 вызова, честный отказ/native fallback; хороший первый → 1, хороший второй → 2. Реальных вызовов ≤30 суммарно, включая repairs всех ролей; budget из задания, не sealed. |
| 5a | Native autosave profile true/3600/5, только верхняя граница options 3600. | Focused range/profile; native часовой рубеж и ограничение 5 реальных минут при 8 ч сна. |
| 5b, если успевается | Минимальный native save completion и startup recovery timestamp; `generations.py` только startup selection. | Focused C++ счётчики/ошибки и реальный native save/reload; бюджеты D219, без расширения в sealed T11/T12. |
| 7, если успевается | Native goto + узкая сериализация возле guard_pos, удалить шесть novgorod полей/перехват npc::move/JS npc_move; Creature::values для assignment ID. | Goto save/load, достижение/недоступность, при огне native escape. Если не готово — assigned NPC movement не показывать. |

Объём: минимальный работающий срез через существующие owners; полного старого TASK02-CODE-PLAN сегодня нет. Проверки исполнения помощниками не заменяют приёмку назначенными Sonnet high/Opus high. Перед владельцем набор с нуля проверяет «3 Игровой стенд CDDA».

## Один native observation/apply путь

Из `novgorod_semantic_test.cpp` в src выносятся `p3_target_ref`, `position_of`, actor-safe часть `write_p3_observation`, `move_action`, `request_direction`, `visible_npc_by_id` и admission/dispatch тела TEST_CASE apply. `write_npc_physical_projections` переносится только в части фактического actor-safe наблюдения, без legacy assignment/progress полей. Единая граница — `write_observation(JsonOut&)` и `apply_operation(const JsonObject&) → operation_result`; общий результат содержит только локальный фактический исход/clock/activity/речь. `write_p3_readback` не переносится целиком: его diagnostic snapshot/world_signature остаются test-only. Общие функции получают stream/объект и живой game, не файловые пути fixture. Test wrapper вызывает эти же функции; `reset_p3_fixture`, request/readback file paths, file IO, `take_snapshot`/`write_current_snapshot` и assertions остаются отладкой. **native_snapshot в live observation не передаётся.**

Швы `set_test_action_queue`, `set_test_pickup_uid`, `set_test_item_use`, `set_novgorod_test_adjacent_selection` не копируются во второй live resolver: минимально расширяется единая очередь/выбор для native семантического запроса, тестовые входы делегируют ей. Use вызывает `avatar_action::use_item` с настоящим item_location, pickup — родной pick_up/activity, move/open — native action queue, wait/speech — wait_activity_actor. Вложенные `do_turn()` loops и save из test apply в src не переносятся: activity продолжает внешний native loop. Для `actualHeardListenerIds` нужен узкий read-only hook в существующей `sounds.cpp:571–665` доставке после проверок, перед `npc::handle_sound`; список `can_hear` не выдаётся за подтверждённую доставку. Snapshot не становится shadow state; хранение семантики только у native owner в его существующих stores.

## Живой ввод, ожидание и транспорт

Native action registry/dispatch (`handle_action.cpp:242,272,3164–3381`, `action.cpp:479–509`) открывает `string_input_popup` (`:383–391,469–508`). Это расширение родного ввода; CHAT/emote не перехватывается. Проверенный EOC string_input (`npctalk.cpp:6040–6099,8730`) не предоставляет внешней связи. Проверяющий подтвердил отсутствие native socket/pipe/IPC; `popen` в crash-handler (`debug.cpp:1660–1678`) для этого не годится. Поэтому **resident Node + AF_UNIX принят** как минимальный transport, не второй semantic owner.

Socket adapter сохраняет интерфейс native adapter (`writeOperationRequest`, `readOperationReadback`, `execute`, `refreshObservation`). Промпты/LLM вызовы остаются в packages/* и apps/game-server; process adapter с execFile и файлы операций в userdir в live path не используются. CDDA один исполняет мир и пишет userdir; Node получает только actor-safe observation, возвращает структурированное предложение. Один coordinator на игровую сессию; запросы и ответы сопоставляются по id, поздний ответ отбрасывается.

Пока Qwen думает — родной `wait_popup` (`do_turn.cpp:505–528`), сообщение «…думает», ui redraw/refresh без продвижения мира. Timeout берётся из существующего `resolveP3EffectiveConfig().timeout_ms`: **120000 мс** (`p3-boundary.js:88,98`), это лимит одного model call, не всего intent с repair. Coordinator сообщает начало текущей роли и её существующий timeout; новый общий лимит intent не вводится. Фактическое значение фиксируется в журнале. Timeout/падение coordinator до apply возвращают ход с сообщением без изменения мира. Esc — только если штатный `input_context::set_timeout` (`input.h:352`) позволяет сделать это узко. Отказ после уже выполненного native действия описывает фактический исход, не обещает rollback.

Launcher проверяет собственный stale socket на ext4, поднимает coordinator в WSL, ждёт readiness, запускает интерактивный CDDA и завершает принадлежащий сессии coordinator при выходе. Нативный модуль из Windows node_modules либо другая несовместимость WSL зависимостей — **STOP с вопросом, без обхода**. Установка Node явно разрешена только из официального архива с проверкой SHA256 и согласно закреплённой major-версии 22 (`.github/workflows/test.yml:49`, `package.json` engines >=22). Exact patch pin в репозитории отсутствует: фактический официальный 22.x архив и SHA256 фиксируются в журнале установки. Само наличие Windows postgres.exe ещё не доказывает зависимость coordinator; проверяется его реальный import closure, без обхода при обнаруженной несовместимости.

## Qwen, PLAY и сдача

Checkpoint исполнения после OK: [TASK03-LIVE-RESULT](TASK03-LIVE-RESULT.md).
Ревью обнаружило отсутствие адресата речи в текущем input. В reply-03c после
`dd98d4674` распорядитель разрешил native выбор собеседника с условиями:
общий фильтр `available` из `game::chat` без копии, родной `creature_select_menu`,
CHAT без перехвата. Выбранный NPC должен передаваться существующим
`emit_interaction.target_actor_refs`, вместо всех видимых кандидатов; нового
поля во входе не добавлять. Если существующая схема этого не допускает — СТОП.
Ответ допускается только выбранному NPC после фактического native слуха и
повторной проверки видимости/identity. Отмена, отсутствие кандидатов, слуха,
валидного ID или прежнего NPC дают родную речь без NPC response model call.
Проверки: два свидетеля → ноль ответчиков; выбранный слышащий → один;
не слышит/исчез/невалиден → ноль; перестановка actors сохраняет выбор.
Затем focused native/fake E2E и Qwen в оставшемся общем бюджете 30.

Только `RUS_LLM_SETTINGS_PATH`, локальный gateway servak :11437. Alias `qwen3.8-27b-uncensored-w4a16-tp2` → backend `qwen3.8-27b` принят по разбору #771; остальные имена отвергаются. Окно 64k задано профилем, `/props` gateway его не подтвердил; не выдавать конфигурацию за измерение. Prompt + max_tokens должны помещаться в окно. Снимать model, prompt tokens, max_tokens, время, HTTP-код без секретов. Общий счётчик ≤30 включает repairs; budget sealed не менять.

PLAY.md по-русски на один экран: одна команда, постоянный мир, RUS_LLM_SETTINGS_PATH, «dev-проба, не P3 GO, T09 не закрыт», проза «черновик, не сохранено», 6 примитивов/радиус1, понятный отказ вне границы, сохранить/выйти/reset. Никакого прежнего запрета подключать provider/model. Незавершённые 5b/7 указать прямо.

Помощники выбираются явно по сложности, не выше gpt-6.1-sol; выбор — в JOURNAL.md. Первые три исполнителя: gpt-6.1-sol high (native live seam, coordinator, launcher). Каждому пишущему код передаётся дословно: «Категорически запрещено писать комментарий по принципу «полезен, если верен и относится к делу». По умолчанию комментария нет; он должен доказать право на существование: только неочевидное «почему» — инвариант, причина обхода, ссылка на внешнее ограничение. Пересказ кода, планы и история — нет. Внутренние номера находок, планов и решений (`F7`, `A-11b`, `D88`) в комментарий не писать: суть словами.»

Не делать: sealed T06–T12, нормы/CR до P7, broad item refactor, новые pending-state/scheduler/cache/host, minor cleanup. Внешний/платный model API, изменение подхода, запрещённые dependency обходы или защищённые нормы — STOP. До 12:00Z сдаётся фактически работающий результат либо блокировка.
