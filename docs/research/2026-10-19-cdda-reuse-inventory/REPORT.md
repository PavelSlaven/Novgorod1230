# Опись родных механизмов CDDA для среза P0–P4
> Движок: CDDA.
> Даты: 2026-10-19 — 2026-10-19.
> Источник отчёта: codex-direct/reuse-audit/inventory.md

## Вопрос

Какие механизмы, тестовые адаптеры и средства проверки описаны для слоёв P0–P4 среза CDDA, и какие части уже были на основной линии или оставались в ветке?

## Метод

Источник — фактическая опись кода из `origin/main` и ветки `codex/cataclysm-p3-semantic`. В ней перечислены патчи и файлы C++, Python и JavaScript, сборочные и тестовые инструменты, evidence и документы; проверка новых прогонов не проводилась ([inventory.md](inventory.md):2, [inventory.md](inventory.md):369).

## Ход

Опись организована по уровням P0–P4 и по типам компонентов. Сначала она описывает тестовые ввод, наблюдение и сценарии среза, затем веточные P3-связки с native-механизмами и P4-сохранение, восстановление и диагностику. В конце перечислены evidence, документация и проверки границ архитектуры ([inventory.md](inventory.md):1, [inventory.md](inventory.md):6, [inventory.md](inventory.md):79, [inventory.md](inventory.md):177, [inventory.md](inventory.md):236, [inventory.md](inventory.md):350).

## Результаты

Для P0/P1 перечислены очередь тестовых действий вместо клавиатурного ввода, исключение при исчерпании очереди, подготовка map/visibility cache и read-only наблюдатель границы ввода ([inventory.md](inventory.md):6, [inventory.md](inventory.md):12, [inventory.md](inventory.md):16). Для P1–P2 также описаны readback-хелперы и сценарии движения, препятствия, подбора предметов, работы с hacksaw и прерывания безопасного режима ([inventory.md](inventory.md):117, [inventory.md](inventory.md):121).

В P3-ветке есть C++-адаптеры выбора соседней клетки и действий с предметами по UID, перенос идентичности предмета, поля намерения NPC, пошаговое native-перемещение с прерываниями и сохранение/загрузка намерения ([inventory.md](inventory.md):79, [inventory.md](inventory.md):85, [inventory.md](inventory.md):95, [inventory.md](inventory.md):105, [inventory.md](inventory.md):109, [inventory.md](inventory.md):113). Рядом перечислены фикстуры наблюдения и исполнение semantic-запроса с readback; веточные тесты проверяют действия с UID и идентичностью ([inventory.md](inventory.md):177, [inventory.md](inventory.md):183, [inventory.md](inventory.md):187).

JavaScript-граница P3 подключает существующий LLM runner, отображает план хода в native-примитивы вроде pickup, move, use_item, open, wait и speak, проверяет безопасные аргументы, запрос и readback, и предоставляет файловый и процессный адаптеры ([inventory.md](inventory.md):263, [inventory.md](inventory.md):271, [inventory.md](inventory.md):279, [inventory.md](inventory.md):287). Отдельно описаны native-потоки NPC и речи, аудитория разговора из native hearing, сбор evidence и запечатанный пакет заданий ([inventory.md](inventory.md):296, [inventory.md](inventory.md):300, [inventory.md](inventory.md):305, [inventory.md](inventory.md):309). Для live wire smoke заданы режимы захвата и ограниченный диагностический запуск; CLI объединяет проверку конфигурации, preflight, запуск и операции coordinator ([inventory.md](inventory.md):317, [inventory.md](inventory.md):313).

В P4 опись включает сериализацию RNG и sidecar рядом с сохранением, проверку UID предметов, failpoint посреди native save, режимы create/apply/read, фикстуру и probe восстановления ([inventory.md](inventory.md):20, [inventory.md](inventory.md):24, [inventory.md](inventory.md):42, [inventory.md](inventory.md):46, [inventory.md](inventory.md):133, [inventory.md](inventory.md):138). Для preload описаны проверки одного потока и отсутствия открытого save-файла, протокол запросов, fork-ребёнок и цикл сервера ([inventory.md](inventory.md):143, [inventory.md](inventory.md):147, [inventory.md](inventory.md):151, [inventory.md](inventory.md):155). Python coordinator отвечает за блокировку, указатель текущего поколения, fsync, копирование и валидацию поколений, `apply` по `operation_id`, CLI, сбои и метрики ([inventory.md](inventory.md):191, [inventory.md](inventory.md):199, [inventory.md](inventory.md):203, [inventory.md](inventory.md):209, [inventory.md](inventory.md):215, [inventory.md](inventory.md):218).

В описи для Python указаны **10 сценариев** отказа с SIGKILL, ENOSPC и отсутствующими или повреждёнными файлами; метрики собраны по **20 замерам** после warmup с расчётом p95. Для JavaScript-границы приведено **около 36 тестов** по бюджету попыток, envelope/readback, адаптерам, ходу, речи, NPC, конфигурации и evidence ([inventory.md](inventory.md):236, [inventory.md](inventory.md):240, [inventory.md](inventory.md):323). В evidence перечислены наборы fault-suite, metrics и recovery в main, а для P3 — отдельные файлы wire evidence; также указаны экспериментальные документы, журнал и MODULE ([inventory.md](inventory.md):350, [inventory.md](inventory.md):354, [inventory.md](inventory.md):358).

В примечаниях к описи отмечено, что upstream CDDA уже содержал `item_uid`; отдельные тестовые тела, JSON/XML evidence и некоторые документы проверены только по заголовкам или именам. Источник также прямо помечает инвентарь как факты без оценки ([inventory.md](inventory.md):369).

## Выводы

Источник представляет каталог реализованных и прототипных компонентов среза, а не оценку того, достаточно ли каждого штатного механизма CDDA или где требуется расширение ([inventory.md](inventory.md):2). В нём разведены компоненты основной линии и ветки, а оценки `loc` объявлены диапазонами или приблизительными значениями, не точным подсчётом ([inventory.md](inventory.md):369).

## Решения владельца

Правило CDDA reuse first: максимально использовать готовые механизмы CDDA, расширять их при необходимости и создавать новые только при отсутствии подходящих механизмов. Порядок проверки — штатные JSON, настройки и EOC, затем native API и композиция примитивов, затем минимальный примитив в CDDA при доказанном пробеле; один физический факт должен иметь одного writer ([cdda-reuse-first.md](cdda-reuse-first.md):11).

## Ограничения

Авторы не запускали тесты. Тела некоторых `novgorod_semantic_test.cpp` проверялись лишь по именам функций и TEST_CASE; тела тестов координатора и JavaScript-границы, evidence JSON/XML и части документов не изучались полностью. Не проверялась глубоко отдельная save-check; размеры `loc` в перечне приблизительны или обозначают диапазон ([inventory.md](inventory.md):369).

## Материалы

| путь | размер в байтах | SHA-256 | что это |
|---|---|---|---|
| `C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/reuse-audit/inventory.md` | 28809 | 5c853c8d5d55923e7423ca6817cf18baf1fefef48a19a9c4c33c3059dc5fe020 | Основная опись компонентов и проверок P0–P4. |
| `C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/reuse-audit` | 28809 | каталог | файлов: 1; папка с описью. |
| `C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/memory/cdda-reuse-first.md` | 2635 | da818c1c75884190fee1dc259eb28ee92e3fe7883cdedc6a02faca9ee74b2772 | Сохранённое правило владельца о приоритете native CDDA-механизмов. |
