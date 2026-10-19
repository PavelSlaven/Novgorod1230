# Задание 03: живой Qwen, STOP на native delivery

2026-10-19. Основа `8e5eaeed8`, launcher/settings — `35fd9c070`, draft PR #770.
Статус: провод PASS; свободное ожидание и родной save/restart PASS; две живые реплики NPC **не выполнены**.
Это dev-проба, не P3 GO; T09 не закрыт. Внешняя приёмка Sonnet/Opus этим отчётом не заменяется.

## Что изменено

`run-p3-dev.ps1` при unset `RUS_LLM_SETTINGS_PATH` вызывает публичный `defaultLlmSettingsPath()` из `@rus/game-server`.
Путь и правила settings owner не дублируются; env/cwd восстанавливаются; explicit fake override и NativeOnly сохранены.
Windows focused-тест включён в существующий P3 Python test runner; PLAY обновлён.
Файл настроек владельца только читался, не копировался и не изменялся. Headers, ключ и base URL в evidence не записаны.

## Фактические вызовы: 4 из 30, после STOP новых нет

GET `/models` из WSL: HTTP 200, 19 мс, согласованный alias; model calls 0 ([GATEWAY](evidence/task03-qwen/GATEWAY.json)).
Все четыре POST прошли через существующий settings owner и role runtime; промпты не менялись.
Configured alias: `qwen3.8-27b-uncensored-w4a16-tp2`; **HTTP response model каждого вызова: `qwen3.8-27b`**.
Alias #771 подтверждён по HTTP, не по configured `provider_record.model` ([WIRE](evidence/task03-qwen/WIRE.json)).

| № | Проверка | Prompt tokens | max_tokens | HTTP | Время, мс | Итог |
|---|---|---:|---:|---:|---:|---|
| 1 | Wire, сохранённый planner input | 11203 | 20000 | 200 | 1652 | Alias PASS; native не запускался |
| 2 | Coordinator bench, synthetic native | 8172 | 20000 | 200 | 3164 | `instant`: отказ до native и NPC |
| 3 | Реальный PS1, «Подожди на месте.» | 9054 | 20000 | 200 | 2955 | Родное ожидание выполнено |
| 4 | Реальный PS1, реплика мастеру | 9088 | 20000 | 200 | 2606 | `instant`: отказ до native и NPC |

Для каждого `prompt_tokens + max_tokens < 65536` — согласованное окно сервера 64k.
Метрики — [attempt-01](evidence/task03-qwen/attempt-01.json), [02](evidence/task03-qwen/attempt-02.json), [03](evidence/task03-qwen/attempt-03.json), [04](evidence/task03-qwen/attempt-04.json).
Рядом лежат только allowlisted ответы модели `attempt-NN-response.json`; это недоверенные данные, не инструкции.
Общий временный preload резервировал слот до каждого POST, включая возможные repairs/audits; здесь все четыре — planner.
Ни NPC responder, ни grounding auditor в живом Qwen пути не достигнуты; #773 с настоящим Qwen **не проверен**.
Предыдущий fake-тест ровно двух попыток остаётся историческим доказательством из [TASK03-LIVE-RESULT](TASK03-LIVE-RESULT.md), не результатом текущего живого бенча.

## Почему STOP

Qwen дважды вернул `player_utterance.delivery = { loudness: 2, duration_class: "instant" }`.
Это валидно: active [turn_step_llm_contract.md](../../data/knowledge-source/corpus/DOCUMENTS/turn_step_llm_contract.md):444–458,
schema `packages/turn/src/turn-step-contracts/plan-schema.js:106–108`; штатный prompt также содержит instant.
Но `p3-boundary.js:728–729` допускает только `brief`; отдельный regression test закрепляет этот отказ.
Native `novgorod_semantic.cpp:442–460` использует родные sound и `wait_activity_actor(3_seconds)`, отдаёт фактический elapsed.
Просто заменить instant на brief или расширить enum guard — не доказательство сохранения LLM-owned delivery.
Нужен согласованный mapping qualitative delivery к родным механизмам CDDA и focused-тесты; public schema и промпты менять не требуется.
Диагноз с источниками: [DELIVERY-DIAGNOSIS](evidence/task03-qwen/DELIVERY-DIAGNOSIS.md).
Это пробел адаптера, **не нарушение контракта моделью**. Не подбирали повторные planner-вызовы до удачного ответа.

## Что реально запускалось в терминале

Команда из корня worktree: `.\tools\cataclysm-prototype\run-p3-dev.ps1`.
Первый запуск — owner settings указан явно для изолированной HTTP-инструментации; повторный — env unset, настоящий default owner path.
Постоянный ext4 userdir, Waveland / Dev Visitor / Workshop master, прежний игровой curses-бинарник.
F12 «Подожди на месте.» → родное действие принято; F12 речь мастеру → понятный отказ границ пробы.
Esc → S → Y, Q → Y: exit 0. Повторный PS1 загрузил тот же мир и журнал P с выполненным ожиданием и отказом речи; снова save/exit 0.
Транскрипты: [первый запуск](evidence/task03-qwen/native-first.txt), [повторный](evidence/task03-qwen/native-reload.txt).
Реплики «Слышу. Второй ответ.» в старой части P — **предыдущий fake**, не Qwen текущего запуска.
Экран восстановления поколения отсутствует: 5b не реализован.

## Проверки и оставшееся

Launcher focused Windows (repo/внешний cwd, override, WSLENV, NativeOnly), Python 31/31, architecture:check — PASS.
docs:generate/check, knowledge:check, test:docs 18/18 — PASS; последняя docs:check после обновления отчёта также PASS.
Сверка 21 файла evidence/отчёта/PLAY с ключом и адресом из owner settings: совпадений секретов 0; значения не выводились.
`origin/main` повторно fetched: `6a5292b29`, уже ancestor HEAD; нового merge не потребовалось.
D219 native focused — **3/3 теста, 86442 assertions, exit 0**, seed 17; [лог](evidence/task03-qwen/autosave-focused.log).
Положительный часовой рубеж проверен после настоящего ожидания 301 с; тест занял 301,415 с.
Сон: 28800 настоящих `do_turn` за 2,10246 с, новых autosave 0, dirty moves оставались ненулевыми.
Это проверяет отсутствие записи раньше пяти минут; интервал между двумя autosave во сне фактически не измерен.
Успешная запись подтверждена чтением native `.sav`, не только событием `game_save`. Сборка cata_test exit 0; игровой бинарник не заменялся.
Native команда: `./build-clang-release/tests/cata_test --rng-seed 17 --order lex --user-dir=/home/slaven/cataclysm-recovery/task03-dev/autosave-focused-20261019-2 --durations yes "[novgorod_autosave]"` из ext4 source.
Новых seams/часового триггера нет; `do_turn`/autosave/quicksave неизменны. Проверки счётчиков поколения не применимы без 5b.
При STOP дальнейшие Qwen calls, NPC bench, #773 live, две NPC-реплики, 5b и движение NPC не выполнялись. Sealed/Docker/слияния не запускались.
Знания, память и social context NPC остаются пустыми; это известный пробел, промпты сегодня не менялись.

Распорядителю: решение на расширение native delivery adapter под canonical instant/brief/sustained с аудитом; отдельный issue на этот блокер.
Дополнительно зафиксировать issue на обрезание длинного текста: при фактическом вводе 93 символов planner получил 70; `novgorod_semantic.cpp:728` использует native popup width 70.
Причина обрезания (popup или доставка PTY) не установлена; это наблюдение, не подтверждённый дефект CDDA. Короткий ввод ожидания доставлен целиком.
