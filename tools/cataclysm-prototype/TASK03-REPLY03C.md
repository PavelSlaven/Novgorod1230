# Reply-03c — проверка передачи адресата

2026-10-19; исходный HEAD `dd98d4674`, draft PR #770. Условия нового OK
записаны в плане коммитом `2ab20e9b3`. **СТОП по условию 2: существующего поля
во входном протоколе недостаточно.** Нового поля, обходного канала и выбора
NPC в коде этого продолжения нет.

## Где разрывается путь

1. `novgorod_semantic.cpp:625–636,695–709`: native ввод содержит строку intent;
   отправляется `{type,id,intent,observation}`. В observation есть факты обо
   всех видимых actors, но нет выбранного собеседника.
2. `p3-live-coordinator.mjs:47–58` передаёт текст/observation в `runP3TurnStep`.
   Canonical `request-schema.js:27–57` не определяет поле native выбора.
   Свободные JSON objects технически принимают дополнительные ключи, но такой
   ключ был бы именно новым входным полем, запрещённым условием 2.
3. `emit_interaction.target_actor_refs` существует в **выходной операции**
   (`plan-schema.js:64`). Direct speech adapter создаёт его из всех видимых
   NPC (`p3-boundary.js:714–734`). Он не может получить native выбор из текущего входа.
4. Выбор только при native apply тоже не передаётся обратно: существующий
   readback даёт `speakerId`, `utterance`, `actualHeardListenerIds`
   (`novgorod_semantic.cpp:514–544`). Последнее — фактический слух, включая
   свидетелей; подменять его смысл адресованностью нельзя.

Проверены оба направления transport, direct utterance schema, native operation
mapping и readback. Детали: [разбор схемы](evidence/task03-live/REPLY03C-SCHEMA.md).
Обрезание observation до одного NPC, кодирование ID в тексте, перестановка
actors и переопределение heard listeners не применялись.

## Конкретное решение для согласования

Разрешить **одно поле `target_actor_ref` в native intent frame**:
native общий фильтр CHAT и `creature_select_menu` выбирают NPC;
координатор хранит ref на время запроса и передаёт его в уже существующее
`emit_interaction.target_actor_refs`. Canonical выходную операцию менять не требуется.
Поле отсутствует/null при отмене или отсутствии NPC: родная речь, ноль NPC
response calls. Видимость, identity и фактический слух проверяются перед ответом.
Это предложение, а не реализованная или утверждённая поправка.

Родной источник кандидатов подтверждён: `src/npctalk.cpp:1063–1077`
(`game::chat`), меню `:751–782,1228–1235`, живой итератор
`src/game.cpp:10701–10710`. Фильтр включает NPC либо говорящих monsters,
тот же z, native видимость и расстояние; отдельной проверки сознания нет.
Одна общая функция сохранит этот фильтр без копии. Не-NPC выбор не даёт
NPC response ref; при отмене semantic речь сохраняется, CHAT ведёт себя по-старому.
Extraction и новые focused тесты не начаты из-за СТОП.

## Сборка и проверки

Продолженная incremental сборка обнаружила ошибку кодировки строки названия
`NOVGOROD_SEMANTIC` в `game.cpp:2628`: CP1251 вместо UTF-8 (`-Werror`).
В tracked overlay строка уже содержала 22 replacement characters после
предыдущей нормализации. Восстановлена правильная UTF-8 строка; новых replacement
characters нет. `git apply --check` и `git diff --check` прошли.
Исправленная строка синхронизирована в ext4 source; `game.cpp.o` собран
успешно, exit 0, `[1/1]`. Лог: `.tmp.driveupload/task03/game-object-encoding.log`.
Первый сбой: `.tmp.driveupload/task03/build-incremental-resume.log`.
Полная live сборка и C++ тесты после СТОП не запускались и не объявляются успешными.

`docs:check` после изменения плана — PASS. Источники/схемы проверены CBM
search/trace/coverage с прямым чтением изменённых/неполных участков.
Реальных Qwen-вызовов — 0, оставшийся общий бюджет — 30. Новая сцена, fake E2E,
save/reload, замер curses warm start и optional 5b/7 не выполнялись после СТОП.
Launcher остаётся подготовленным, но готовая игра одной командой не подтверждена.
