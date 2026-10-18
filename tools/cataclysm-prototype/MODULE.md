# cataclysm-prototype

## Назначение

Изолированные native проверки пригодности Cataclysm-DDA для Novgorod. Инструмент
запускается вручную на отдельной копии upstream и временном тестовом мире.

## Владеет

- Воспроизводимым подключением теста к закреплённой native сборке.
- Подстановкой управляемого ввода в native test mode, без подмены результатов.
- Подготовкой native visibility caches в существующем input loop без renderer.
- Проверками штатного игрового цикла и программного readback для исследователя.

## Граница

CDDA владеет физическими переходами, часами, предметами, NPC и native RNG.
Тестовая fixture задаёт начальное состояние; assertions читают фактический
результат. Очередь тестового ввода не является semantic planner или игровым API.
Исчерпание очереди явно завершает тест ошибкой, не вводит бесконечный пустой ход.
Read-only observer фиксирует состояние на границе ввода; обнаружение угрозы и
safe mode исполняет штатный `mon_info_update`, не observer.

Инструмент не подключён к production runtime Novgorod, не читает пользовательские
сохранения и не меняет active bindings. Он не предоставляет renderer, HTTP server,
новую физику, LLM fallback или собственный persistence owner. Native test readback
предназначен исследователю, не является разрешённой player-safe проекцией.

## Проверка

Исполняемый путь — upstream `cata_test` с проверками `[novgorod_slice]`.
Порядок подключения, исходная ревизия и команды принадлежат [README](README.md).
Зелёный native тест не является приёмкой semantic/NPC/narration интеграции или
production cutover.
