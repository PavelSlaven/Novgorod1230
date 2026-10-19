# Задание 03 — живая dev-проба, reply03d

2026-10-19. Draft PR [#770](https://github.com/PavelSlaven/Novgorod1230/pull/770).
**Две последовательные реплики выбранному NPC через настоящий PS1, сохранение,
выход и повторный запуск — PASS с локальным fake. Не P3 GO; T09 не закрыт.**
Настоящий Qwen не запускался: существующий `RUS_LLM_SETTINGS_PATH` отсутствует
в Windows Process/User/Machine и WSL login shell; путь запрошен распорядителю.
Это техническая сдача, не внешняя приёмка Sonnet/Opus.
Сохранены [внутренний source audit](evidence/task03-live/REPLY03D-CONTRACT-AUDIT.md)
и [проверка финального delta](evidence/task03-live/REPLY03D-FINAL-DELTA-REVIEW.md).
Первый документ содержит исторические результаты до последних исправлений;
актуальные счёты приведены ниже.

## Что работает и как запустить

Команда: `.\tools\cataclysm-prototype\run-p3-dev.ps1`; настройка локального Qwen,
клавиши, границы и reset — в [PLAY](PLAY.md). Native-only доступен отдельным флагом.
Постоянный userdir: `/home/slaven/cataclysm-recovery/task03-dev/userdir`.
Binary/data/gfx/save находятся на ext4, socket — также на ext4.
Финальный curses SHA256: `a07f6576974ad06ba6838179eeda4d6598bf560e5b7b3eff02c3ff761075e64c`.

Ведущий лично запустил Windows PS1 в PTY, загрузил двор мастера, ввёл через F12
«Скажи дословно: „Привет, слышишь меня?“» и «Скажи дословно: „Что ты делаешь?“».
Единственный родной CHAT-кандидат Workshop master выбран автоматически.
Родной журнал P показал разные ответы «Слышу. Первый ответ.» и «Слышу. Второй ответ.»
и принятие обоих действий. После native Save and quit, выхода и повторного PS1
запуска оба ответа остались в журнале. Оба процесса завершились с exit 0.
HTTP fake обслужил ровно 6 запросов: planner/responder/auditor ×2, без repair.
Fake был локальным временным процессом с synthetic settings, после проверки
остановлен; настоящих модельных вызовов 0/30. Это не оценка качества Qwen.
Снимок fake для воспроизведения: [исходник](evidence/task03-live/reply03d-fake-openai.mjs.txt).
Его рабочее расположение — `.tmp.driveupload/task03/reply03d-fake-openai.mjs`;
запуск согласованным WSL Node выдаёт путь к временному synthetic settings.
Этот путь передаётся обычному PS1 через RUS_LLM_SETTINGS_PATH только на время fake
проверки; настоящий файл настроек Qwen не меняется.

Доказательства: [E2E metadata](evidence/task03-live/REPLY03D-E2E.json),
[первый запуск](evidence/task03-live/reply03d-root-first.txt),
[повторный запуск](evidence/task03-live/reply03d-root-reload.txt),
[HTTP роли](evidence/task03-live/reply03d-root-fake-http.txt).

## Реализация и родные механизмы

- Общий `chat_available_creatures` извлечён из точного predicate game::chat
  (upstream `src/npctalk.cpp:1063–1077`); CHAT и свободный ввод используют его.
  Выбор — родной `creature_select_menu` (`:751–782`), CHAT не перехвачен.
- Разрешённое private поле `target_actor_ref` заполняет существующее
  `emit_interaction.target_actor_refs`. Canonical/public schemas не менялись.
  Свидетель не становится ответчиком: нужен выбранный ID, native факт слуха,
  затем повторная видимость/identity. Нет выбора/слуха/валидного ID — 0 NPC calls.
- Resident coordinator использует прежние turn/role/settings owners. На каждый
  intent — отдельное соединение AF_UNIX; native закрывает fd после result.
  Нет CDDA процесса на действие, второго писателя userdir или live native_snapshot.
- Отказ за границей шести примитивов/радиуса 1 объясняет границы пробы.
  Timeout берётся из существующего role resolver, literal launcher 120000 удалён.
  Native stale-id/timeout проверки исполняют реальный C++ socket client.
- Repair NPC — один общий повтор, включая structural+semantic ошибки;
  bad+bad даёт ровно две NPC попытки. Все настоящие роли считаются в общем лимите30.
- D219: родной autosave/Quicksave сохранён, профиль true/3600/5 проверяется при старте;
  повышен только максимум AUTOSAVE_TURNS. Поколения на каждое действие live не вызывает.
  После обычных live save/reload `novgorod_rng_state` отсутствует в userdir.

## Последние фактические проверки

| Проверка | Итог |
|---|---|
| JS Windows и WSL Node22.23.3, включая mixed repair | 46/46 PASS на каждой ОС |
| Python coordinator19 + launcher12, через штатный wrapper/WSL | 31/31 PASS |
| Curses и cata_test build | exit0 |
| Native live/autosave/UID/RNG, seed12345 | 19 cases / 299 assertions PASS |
| Actual PS1 → fake → native NPC, два intent + save/restart | PASS, exit0/0 |
| Final binary native warm/save/restart probe | PASS; 12,634 и 16,321 с |
| docs:generate/check, knowledge:check, architecture:check | PASS |
| test:docs | 18/18 PASS |
| git diff --check | PASS |

Логи: [JS Windows](evidence/task03-live/reply03d-js-win.log),
[JS WSL](evidence/task03-live/reply03d-js-wsl.log),
[Python](evidence/task03-live/reply03d-python.log),
[build](evidence/task03-live/reply03d-build-runtimefix.log),
[native](evidence/task03-live/reply03d-focused-runtimefix.log),
[warm/save](evidence/task03-live/REPLY03D-WARM.json).
Warm probe использует тот же финальный binary, ext4 и существующий datadir/cache,
копию постоянного userdir; это native время загрузки, не полный Windows launcher.
Cold на этом binary заново не измерялся; прежние 20,028 с cold — исторический замер
задания03/M3, не новая цифра. Никакого warm host, урезания модов или --noverify.

## Встреченные проблемы и решения

1. Каждый второй intent терял связь: fd переиспользовался после socket.end.
   Исправлено; подтверждено настоящим C++ клиентом и двумя репликами в игре.
2. Ревью нашло слабый stale-id oracle и гонку timeout fixture. Peer теперь требует
   EOF без лишнего readback и ждёт закрытия клиента; runtime бюджет не менялся.
3. Первый native suite дал 14/18: NPC_debug отменял смерть EOC и загрязнял fixture,
   recenter менял локальные координаты, partial JSON давал unread-field ERROR.
   Исправлены fixture/абсолютный assertion/partial чтение; CHAT predicate сохранён.
4. Старый save падал на item UID. Создана новая сцена родным UI/character template,
   старый save сохранён отдельно; serialized world руками не правился.
   Terrain special исправлен на родную north-вариацию rotating terrain.
5. Первый живой fake обнаружил unread expected_native_observation.references.
   Разрешены неиспользуемые metadata поля этого JsonObject; native actor/time/refs
   проверки сохранены. Реальный frame, stale actor и stale turn покрыты regression.
6. Loopback fake отвергался действующим private-LAN guard. Guard не менялся:
   временный synthetic server использовал собственный RFC1918-интерфейс WSL.
7. Native --check-mods зависает без UI. Факт: повтор завершён timeout exit124,
   stdout пуст. Предполагаемая причина: `main.cpp:766,935` и
   `game.cpp:551–555` → `ncurses_def.cpp:585–611`; stack не снимался.
   Это не PASS валидации модов и не исправленная находка. Ведущему: отдельный issue,
   воспроизведение `cataclysm --datadir <runtime/data/> --check-mods novgorod_dev_world`;
   закрытие — конечный native exit и успешная проверка dev-мода без зависания.

## Ограничения и дальнейшая работа

- Реальный Qwen bench не выполнен: нужен путь к существующему settings file.
  Лимит30 не расходовался. Подготовленный runner не запускался с настоящей моделью.
- NPC получает пустые knowledge/memory/social context. Native журнал сохраняется,
  но это не память модели и не полноценная production conversation integration.
- Optional5b (приём поколения/экран момента восстановления), optional7 (назначенное
  движение NPC), реальные hour/sleep autosave проверки не выполнены.
- Multi-candidate cancel/talking-monster UI не прогонялись; common native filter,
  zero/one candidate и отсутствующий адресат проверены focused тестами.
- SIGTERM не отменяет уже начатый HTTP LLM call: внешнего AbortSignal у текущего
  runtime API нет; расширять его ради minor сегодня не стали. Busy имеет честный текст.
- Двор — условная dev-сцена; вне неё обычный CDDA. test_data даёт test recurrence
  сообщения. Моды по решению владельца не урезались. Новое изготовление предметов
  и gameplay за шестью примитивами этим E2E не подтверждены.
- Sealed T06–T12, Docker, внешние/платные модели и self-merge не запускались.
  Проза остаётся черновиком до согласования нормы P7; final acceptance — Sonnet/Opus.

История прежних STOP сохранена в [reply03c](TASK03-REPLY03C.md) и git:
`dd98d4674`, `ef58f5d67`, `b696d16b0`. Они сняты новым разрешением private frame.
Завершённые шаги этой итерации: `e84cb0877` (JS admission), `3bb13b4ce` (native
selection/socket), `f0c4c0688` (runtime metadata regression). Origin main `6a5292b29`
повторно fetched и уже является предком; повторный merge не требовался.
