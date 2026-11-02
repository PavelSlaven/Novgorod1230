# Реальные фикстуры двора

Кадры взяты из `/srv/novgorod-work/scratch/task25-yard/capture/perception.jsonl`; ходы взяты из `/srv/novgorod-work/scratch/task25-yard/capture/turns.jsonl`.

| Файл | Исходный sequence | Исходный native_turn |
|---|---:|---:|
| `courtyard.json` | 1 | 5212800 |
| `door-before.json` | 56 | 5227219 |
| `door-after.json` | 57 | 5227219 |
| `roof-entry.json` | 59 | 5227220 |
| `inside.json` | 61 | 5227221 |
| `inside-before-step.json` | 62 | 5227222 |
| `inside-after-step.json` | 63 | 5227222 |

`courtyard.json` сохраняет значение `native_turn=5212800` из записи `sequence=1` без изменений. Начальный снимок сделан раньше выбранного для настоящего прогона интервала M1, который начинается с `5227200`.

`actions.jsonl` содержит исходные записи `turns.jsonl` для `native_turn=5227218`, `5227219`, `5227220` и `5227221` (исходные строки 19–22), без изменения их содержимого.

В первых пяти перечисленных выше JSON-кадрах удалены только поля `frame.journal` и `frame.sky_diagnostic`. Файлы `inside-before-step.json` и `inside-after-step.json` содержат исходные кадры целиком, без удаления или изменения полей.

## Окно и транспорт

`newsmallwindowvehicle.json` составлен из записи `/srv/novgorod-work/scratch/task25-yard/capture/perception.jsonl`, исходная запись `sequence=16`, `native_turn=5227200`. Поле `window` — реальное закрытое окно «окно с задёрнутыми занавесками» с позицией `[339, 2716, 0]` и направлением «северо-восток». Поле `vehicle_parts` содержит все 21 исходных объекта `vehicle_part` с `vehicle_name=V6 спортивный седан` из этого же кадра. Позиции, имена, направления и остальные значения объектов оставлены без изменений; объекты не переносились на другие клетки.

Тесты окна и транспорта находятся в `tools/prose-probe/test/packet-regressions.test.js`; остальные тесты пакетов — в `tools/prose-probe/test/packets.test.js`.
