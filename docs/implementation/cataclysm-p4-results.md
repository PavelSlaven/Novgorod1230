# CDDA P4: результаты checkpoint / crash / retry

**Статус:** REFERENCE / DOMAIN GUIDE. **Дата:** 2026-10-18.
**CR:** [#758](https://github.com/PavelSlaven/Novgorod1230/issues/758).
**Критерии до измерений:** [спецификация P4](cataclysm-p4-experiment.md).
**Воспроизведение:** [README](../../tools/cataclysm-prototype/README.md).

Независимый Contract/data/code audit: **PASS_WITH_NOTES для отрицательного
эксперимента**, Codex (`p4_final_audit`), 2026-10-18, commit
`4e2dace0ccaef7d40330b0bd7a25a79b029c5a08`. WR §21.1: утверждены technical
fixtures, заранее заданные пороги и evidence в `cataclysm-p4-experiment.md`,
этом отчёте, `tools/cataclysm-prototype/novgorod_persistence_test.cpp` и пяти
`tools/cataclysm-prototype/evidence/p4-*.json` на указанном commit.
Проверяющий прочитал governing/CONTRACT_INDEX, код и committed evidence;
сборки и тесты при независимом аудите не перезапускал. Это одобрение
воспроизводимого отчёта, не пройденный P4 gate.

**Решение: STOP / REVISE_APPROACH. P4 не принят.** У выбранного fresh-process
механизма превышен бюджет восстановления, а native reload меняет UID предмета.
Это предусмотренное условие остановки P4 в плане #754. Пороги и поля сравнения
сохранены. P3, речевые T11/T12, P5 и P6 не выполнялись; GO_FOR_P7 не заявляется.

## Реализованный эксперимент

Один Python stdlib coordinator копирует полный native userdir в изолированные
поколения. Technical semantic fact, payload и executed operation IDs лежат
в том же поколении. Физический мир считает и сохраняет CDDA. В semantic JSON
нет второго physical snapshot: ожидаемый readback сравнивается в памяти теста.

Native процессы работают только на mutable staging или scratch-копиях.
Accepted current/previous публикуются одной атомарной записью; файлы и каталоги
синхронизируются через fsync. Неизвестное принятое состояние останавливает retry
как uncertain. Это исследовательская граница с одним последовательным writer,
а не production persistence/API. Process SIGKILL и fault injection не доказывают
поведение при физическом отключении питания.

Стенд тот же, что в [P0–P2](cataclysm-p0-p2-results.md): pinned CDDA
`0d8843f1c500052c3e026e3da6f8edaf5e00b626`, Clang 19.1.1 Release,
WSL2 Ubuntu 24.04.4/Linux filesystem, i9-12900K, 31 GiB RAM. Seed 17.
Native binary после добавления P4 seam и исправления assertions был заморожен
на время измерений; production runtime, БД, LLM и пользовательские saves
в эксперименте не участвовали.

Наблюдавшийся userdir UID-прогона содержит **54 native файла, 1 202 136 bytes**:
player save, master/NPC, maps и dictionaries, dimension data, world options/mods,
map memory, журнал, UI/options/zones, achievements, template, config и cache.
[Полный список с размерами](../../tools/cataclysm-prototype/evidence/p4-native-files.json)
исключает только stdout/stderr probe и производный JSON-отчёт. Это инвентаризация
данной сцены; coordinator копирует весь userdir, а не этот перечень расширений.
Размер accepted generation дополнительно включает semantic metadata.

## Потеря identity при native reload

[Полные create/apply/read записи и сравнение](../../tools/cataclysm-prototype/evidence/p4-native-uid.json)
получены тремя native процессами, каждый exit 0. После pickup rock UID равен
`3589059`; в сохранённом player JSON он также `3589059`; новый процесс читает
`3590329`. Единственная разница записанных физических snapshots — UID rock.
Позиция, время, moves, другие item-поля, NPC IDs/позиции, activity и ограда совпали.

Диск проверен отдельно от substring helper в native probe: system libzstd
распаковал актуальную sav entry, `json.loads` прочитал дерево. Rock находится в
`$.player.worn.worn[0].contents.contents[0].contents[0]`. Это nested worn pocket,
а не `temporary_load_items`. Независимый source review проследил загрузку через
`item::deserialize` → legacy `contents.combine` → pocket insertion с копированием;
`item_uid` намеренно выдаёт новый UID при обычной копии. Исправление этого пути
в native owner не реализовано. Строгая проверка coordinator отвергает candidate,
а не удаляет UID из сравнения. Продолжение: [#759](https://github.com/PavelSlaven/Novgorod1230/issues/759).

## Бюджет

Отдельный UID sample: apply world load `13171.9 ms`, core data `3.34 ms`,
bootstrap `14.55 ms`, save `233.36 ms`; read world load `13542.3 ms`, core
data `3.62 ms`, bootstrap `14.95 ms`. Даже один world load превышает 5 секунд.
Полный `game::setup` исключать нельзя: он загружает world-specific mods.

Бюджет coordinator консервативно включает исходную staging copy и world load
для apply, native save, полную candidate copy/fsync, свежую validation/readback
и publication. Из apply load вычитается только отдельно измеренный core-data
timer: bootstrap завершён до начала этого timer и повторно не вычитается.
Из wall time validation исключены отдельно измеренные bootstrap/core data.
Полная operation latency сохраняется без этих вычитаний.

Диагностические измерения используют `move_east`, который проходит strict
native readback. Это не успешная ordinary-item acceptance: pickup остаётся
блокированным UID failure. Блокер производительности: [#760](https://github.com/PavelSlaven/Novgorod1230/issues/760).

Один прогрев исключён, затем **20 измерений**. P95 — nearest rank 19/20.
[Все samples](../../tools/cataclysm-prototype/evidence/p4-metrics.json) и
[команды](../../tools/cataclysm-prototype/evidence/p4-commands.json) сохранены.

| Измерение | P50 | P95 |
| --- | ---: | ---: |
| Полный checkpoint budget | 24.59 s | **25.38 s** |
| Полная operation latency | 25.01 s | 25.81 s |
| Native reload world timer | 11.90 s | 12.31 s |
| Fresh native read process wall time | 12.17 s | 12.57 s |
| Native save | 223.72 ms | 236.92 ms |
| Candidate copy/fsync | 212.26 ms | 232.82 ms |

Максимум полного поколения: **1 206 728 bytes** при лимите 536 870 912.
Размер проходит, latency не проходит. Даже более узкий reload timer выше 5 s;
вывод не зависит от консервативного включения исходного apply load в бюджет.

## Fault matrix

[Фактический отчёт](../../tools/cataclysm-prototype/evidence/p4-fault-suite.json)
содержит **14 сценариев**; общий статус **BLOCKED**. Основные crash boundaries
проверены на `move_east`, partial activity — на `partial_hacksaw`.

| Граница §7 плана | Наблюдавшийся accepted state |
| --- | --- |
| До effect | Старое поколение; retry исполнил действие один раз |
| После effect до native save | Старое поколение; retry исполнил действие один раз |
| Середина native save | Старое поколение; retry исполнил действие один раз |
| Native save до semantic binding | Старое поколение; retry исполнил действие один раз |
| Atomic acceptance до receipt | Новое поколение; retry не вызвал native apply |
| Receipt / technical narrator failure | Новое поколение; retry не вызвал native apply |
| Partial activity | Сохранён прогресс hacksaw и целая ограда; retry не повторил activity |
| ENOSPC / missing / malformed native file | Candidate отвергнут; старое поколение сохранено |
| Temporary files / cleanup failure | Current и previous сохранены; повтор cleanup успешен |

Дополнительно проверены crash после rename поколения до публикации, строгая
проверка initial candidate и uncertain stop при неизвестном accepted generation.
Оба ordinary pickup (`rock`, `stick`) **BLOCKED** из-за UID mismatch: candidate
не опубликован, принятый мир не изменён. Поэтому успешные crash boundaries
на движении не являются общей приёмкой предметов или всех T11/T12.

Независимый аудит нашёл и исполнитель исправил проверку initial candidate
после копирования, фактическую operation в команде воспроизведения и уборку
непринятых поколений после rename. Финальная fault suite повторена после этих
исправлений; измеряемый apply timing path не менялся, 20 samples сохранены.

## Проверки

Native create/apply/read и P2 `[novgorod_slice]` regression завершились exit 0.
Python: шесть unit checks, `py_compile` и `git diff --check` прошли.
Последовательное применение P2/P4 patch на чистом pinned clone прошло;
получившиеся `game.cpp`, `game.h`, `game_io.cpp`, `test_main.cpp` и отдельный
P4 test source совпали с исходниками измеренного binary. Повторная сборка
для этой проверки не требовалась. Raw temporary worlds метрик/fault suite
удалены после извлечения JSON evidence.

Repository checks: `docs:check` (8 generated files; production activation
findings 0), `test:docs` (12/12), `architecture:check`, staged `git diff --check`
прошли. Полный `npm test` выполняется отдельно в CI exact HEAD PR.

CBM `detect_changes` подтвердил 15 путей реализации/данных. Coverage для
`tools/`, `docs/`, `generated/` исключён; все выводы опираются на прямое чтение
source/evidence и детерминированные проверки. Нулевое число graph symbols
не использовалось как доказательство отсутствия изменений.

## Открытые границы

- Реальные P3 utterance/audience/social consequence и повтор T11/T12 не
  проверены. Technical delivery failure не заменяет проверку LLM narration.
- P3–P6 остаются открытой работой [#762](https://github.com/PavelSlaven/Novgorod1230/issues/762).
- Walking AUTOPEEK за пределами P2 run-mode seam:
  [#761](https://github.com/PavelSlaven/Novgorod1230/issues/761).
- GCC 13 Release warning failure, при рабочем Clang 19 стенде:
  [#763](https://github.com/PavelSlaven/Novgorod1230/issues/763).

Production owners, active profiles/bindings, schemas, governing-корпус и
реальные сохранения не изменены. Успешные repository checks разрешают хранить
воспроизводимый отрицательный результат; они не превращают P4 в PASS.
