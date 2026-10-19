# Задание 03 — checkpoint живой dev-пробы

Продолжение после OK на адресата: [reply-03c](TASK03-REPLY03C.md).
Ниже сохранены факты предыдущего checkpoint; новая СТОП-точка относится к
условию передачи выбора без нового входного поля.

2026-10-19. Draft PR [#770](https://github.com/PavelSlaven/Novgorod1230/pull/770).
**STOP по адресату речи; играбельная dev-проба и P3 GO не подтверждены.**
Это промежуточный результат после OK плана, а не внешняя приёмка Sonnet/Opus.

## Выполнено

- Первым коммитом `16892a689` внесён D219: родной autosave, профиль true/3600/5, без нового часового триггера; M3 принят по родному тёплому кэшу. `do_turn` autosave и `quicksave` не заменялись.
- `d285e4bb2`: Windows/WSL launcher с постоянным userdir, отдельным ext4 runtime, блокировкой второго запуска и завершением своего coordinator. Исправление после ревью убирает собственный 20-секундный readiness budget; ожидание проверяет живой дочерний процесс.
- Node 22.23.3 установлен на уровне пользователя WSL из официального архива. SHA256 `df450af89261115ef9f9e3830c3eeb2cc9213b63c720b1af623cb5dcbe2e02de` проверен перед распаковкой. Закреплена major 22; exact patch pin в репозитории отсутствует. Реальные импорты coordinator в WSL работают.
- Resident AF_UNIX coordinator использует прежние `runP3TurnStep`, `createP3RoleRuntime`, `loadP3QwenSettingsOwner`. Новый socket adapter не пишет userdir, не запускает CDDA на действие и отвергает `native_snapshot`. Проверяются request ID и поздние ответы.
- Общий live repair limit NPC равен одному, включая смешанные structural/semantic ошибки; старое значение по умолчанию сохранено. Fake bad+bad даёт две попытки. Конфигурация dev запуска ограничивает общий счётчик 30, включая repairs и audit.
- Wire smoke допускает только согласованную пару Qwen alias/backend. Реальных модельных вызовов после этого OK: **0**.
- Подготовлены общий native observation/apply/readback, action свободного ввода, ожидание без вложенного игрового цикла и речь через родной звук с наблюдением фактического слуха. Статус сборки и focused C++ проверок указан ниже; исходники сами по себе не доказывают работоспособность.
- Подготовлен native JSON dev-мод: условный двор мастера, NPC, деревянная дверь, кремень, трут, дрова. Это не реконструкция Новгорода; окружающий мир остаётся CDDA. Initial save должен быть получен родным UI, а не правкой сериализованного мира.
- Верхняя граница `AUTOSAVE_TURNS` 1000→3600 вынесена в отдельный однофайловый overlay; добавлен focused тест границы. Launcher проверяет профиль и сохраняет пользовательские bindings.

## Фактические проверки

| Проверка | Результат |
|---|---|
| P3 JS, Windows | 42/42 PASS |
| P3 Python, Windows | 29/29 PASS |
| NPC semantic owner | 29/29 PASS |
| P3 JS, WSL Node 22.23.3 | 42/42 PASS |
| Launcher lifecycle, WSL | 12/12 PASS; Bash syntax PASS |
| Dev-мод JSON | Парсинг четырёх файлов, 12 уникальных ID, карта 24×24, один заданный NPC — PASS |
| После merge main #778 | `docs:generate`, `docs:check`, `knowledge:check`, `architecture:check` PASS; `test:docs` 18/18 PASS |
| Старый baseline curses + прежняя fixture | FAIL: `item_location UID not found in container contents`; ошибка не обходилась |
| Новая baseline curses сборка (семь прежних overlay) | PASS, SHA256 `9a5a51de8f6b63e8779d3470dd483db793b76b9d316db2647d78e206f73790cd` |
| Live/autosave incremental / focused C++ | Остановлен по STOP на 61/460; ошибок до остановки 0, полного результата нет; тесты не запускались |
| Новые live/autosave overlay `git apply --check` | PASS |
| `--check-mods` | Начат на старом binary, остановлен без результата; PASS не заявлен |
| Новый native UI seed, live save/reload, curses warm start | Не выполнены до STOP |
| Реальный Qwen / sealed T06–T12 / Docker | Не запускались |

JS тесты здесь проверяют транспорт и отдельные границы, а не корректность выбора адресата.
Независимое техническое ревью выявило BLOCK, несмотря на зелёные тесты.
Предыдущие ext4 цифры 20,028 с cold и 14,756–15,404 с warm относятся к диагностическому бинарнику: новый curses ими не подменяется.

Сборка сохранена в `/home/slaven/cataclysm-recovery/task03-dev/source/build-clang-release`.
Логи рядом: `task03-dev/build-baseline.log`, `task03-dev/build-incremental.log`.
После решения распорядителя: `cmake --build /home/slaven/cataclysm-recovery/task03-dev/source/build-clang-release --parallel 8`.
Runtime всё ещё содержит старый бинарник `971de2d2…`; новый baseline туда не подменялся.

Checkpoint исходников и отчёта: `32117b355`; merge main `6a5292b29` (#778): `717c1f166`.
Конфликт был только в generated manifest и устранён штатным генератором.
CHANGELOG/package scripts сохранили обе ветви. Первая генерация обнаружила
временные undeclared build artifacts; они перенесены внутри worktree в
`.tmp.driveupload/task03/artifacts-checkpoint`, без удаления исходников/сборки.
При checkpoint commit Git сообщил Permission denied своей автоматической очистки
служебных worktree; commit/push успешны, ручной очистки не было. Последующие
Git-команды выполнялись с отключённым auto-maintenance.

## Блокировка и решение, требуемое от распорядителя

`runP3NativeNpcReply` выбирает первого видимого NPC из фактически услышавших.
Вход свободной речи не содержит адресата; `emit_interaction.target_actor_refs` сейчас заполняется всеми видимыми кандидатами. Active `npc_conversation_mode_contract.md:1083–1089,1142–1152,1171–1184` запрещает вызов response LLM обычному свидетелю лишь за факт слуха. Сортировка уже допущенных ответчиков в `@rus/npc-runtime` не решает admission.

В CDDA есть родной выбор собеседника: `src/npctalk.cpp:1063–1088,1229–1234`, `src/game.cpp:5347` в снимке 0d8843f. Но утверждённый [TASK03-PLAN](TASK03-PLAN.md) оставляет CHAT без перехвата. Добавление выбора NPC и поля адресата меняет согласованный ввод. По СТОП-правилу задания это не реализовано самовольно.

Предложение к согласованию: в semantic action переиспользовать native выбор NPC перед свободной репликой; передавать его ID в actor-safe input, не перехватывая CHAT. Response boundary разрешать только этому NPC после native факта слуха и повторной проверки видимости/identity. Без выбранного адресата — родная речь, ноль NPC model calls. Никаких regex по имени или дополнительной LLM-классификации.

Проверки после OK: два обычных свидетеля → 0 NPC calls; выбранный услышавший → один ответчик; не слышит/исчез/невалидный ID → 0; перестановка actors не меняет адресата. Затем focused native/fake E2E и только после них малый Qwen bench в оставшемся общем бюджете 30.

## Ограничения и продолжение

Команда launcher: `.\tools\cataclysm-prototype\run-p3-dev.ps1`; сейчас это **не подтверждённая команда готовой игры**. Совместимый runtime/initial save и native E2E ещё нужны. [PLAY](PLAY.md) сохраняет предупреждение.
Не выполнены приём поколения/экран восстановления (5b), назначенное движение NPC (7), часовой рубеж и сон 8 часов под родным autosave, игровая проверка агентом «3». T09 не закрыт. Проза остаётся «черновик, не сохранено».
Новые owner/normative правила не вводились. Обнаруженный BLOCK передаётся распорядителю как исполнителем под ведущим; самостоятельной внешней приёмки и слияния нет.
