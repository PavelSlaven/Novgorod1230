# CDDA P4: полные поколения и crash/retry

**Статус:** REFERENCE / DOMAIN GUIDE; эксперимент, не production contract.
**Дата:** 2026-10-18. **CR:** [#758](https://github.com/PavelSlaven/Novgorod1230/issues/758).
**Исторический протокол стенда.** Задание 02 / D215/D216 отменило бюджет
save+reload ≤5 с на операцию и заморозило preload/fork. Он был назначен
исполнителем и не следует из исходного плана среза. Ниже сохранена история
эксперимента, не разрешение развивать этот подход. Штатные save/start/recovery
ворота и разделение отладки заданы в исправленном плане среза.
**План:** [P4 и fault matrix](../plans/Novgorod1230_Cataclysm_Vertical_Slice_Implementation_Plan_2026-10-19.md).
**Вход:** P0–P2 приняты на `8a54ac012543134ac0887b954fb59681d77b6275`;
CDDA pinned `0d8843f1c500052c3e026e3da6f8edaf5e00b626` и test-mode input patch.

## Граница

CDDA владеет physical state и его native save/load. Один Python stdlib
координатор принимает полное поколение в отдельном экспериментальном каталоге
Linux filesystem WSL. PostgreSQL, production bindings и пользовательские saves
не участвуют. Нет отдельного semantic commit или второго физического writer.

Native процесс пишет mutable staging. Координатор получает полную копию userdir,
добавляет technical semantic fact и executed operation IDs, проверяет candidate
новым native процессом на scratch-копии, синхронизирует файлы/каталоги и публикует.
Принятый каталог никогда не открывается mutable native процессом.

`current` и `previous` находятся в одной атомарно заменяемой записи. До её замены
fsync выполняется для полного поколения, после — для каталога указателя.
Очистка сохраняет оба принятых поколения. Неполный/неразбираемый candidate
не принимается. Неизвестное состояние уже принятого поколения означает
`uncertain` и остановку; нельзя молча откатить подтверждённый эффект.

Повтор того же operation ID с тем же payload читает сохранённый outcome;
native apply повторно не вызывается. Другой payload с тем же ID отклоняется.
Граница рассчитана на один последовательный coordinator эксперимента.

## Native probe

Opt-in create/apply/read режимы `cata_test` используют штатный world setup,
`game::save` и строгий `game::load(save_t)` с проверкой результата.
В probe отключён обычный test_main cleanup, иначе он удалял бы world на успехе
или дописывал save после ошибки. Обычный upstream test lifecycle не меняется.

Fixture — техническая P0–P2 сцена. Изменения позиции, pickup rock/stick и
частичная hacksaw activity исполняются через общий `do_turn`/native activity.
Для P4 ограда `(60,61,0)` и wielded native hacksaw входят уже в исходный
checkpoint; apply не создаёт их вручную после загрузки принятого мира.
Readback включает native absolute position, время, item UID/type/count/location,
NPC ID/позицию и activity progress. Resume не восстанавливает fixture вручную.
Если native identity не переживает load, это finding, не повод убрать поле.

Test-only save barriers после effect и в середине native save выдают marker,
flush и ждут внешнего kill. Остальные process-fault границы проверяются
остановкой процесса координатора. После каждого сбоя новый native процесс
загружает только принятое поколение и сверяет значимые физические поля.

## Обязательные случаи

Все девять строк §7 плана остаются обязательны: до effect; после effect до
durable save; середина native save; native save до semantic binding; atomic
acceptance до receipt; receipt/narrator failure; частичная activity; write
failure/ENOSPC/missing/invalid candidate; незавершённые temporary files и
cleanup failure. Второй ordinary предмет проходит тот же retry механизм.

ENOSPC разрешено детерминированно внедрить через реальную ошибку записи
`/dev/full`; это fault injection, не утверждение, что заполнен весь диск.
Narrator failure на раннем P4 — технический delivery failure без LLM.
Process-kill не доказывает устойчивость к физическому отключению питания.

Ранний technical semantic fact доказывает только совместный checkpoint.
До P5 T11/T12 обязательно повторить с реальной P3 репликой, слушателями,
социальным последствием и identity исполнения. Речевая часть остаётся OPEN.

## Таймеры и допуск

До измерений зафиксировано: один прогрев и 20 samples; nearest-rank p95
≤5 s для суммы native save, полного copy/fsync/publication, native
reload/readback и validation. Исключается только cold static/core data loading
до world load; сам native world load не относится к исключённому bootstrap.
Полная fresh-process recovery latency и полная operation latency показываются
отдельно. Полное поколение ≤512 MiB.

Этот scope и граница таймеров прошли независимое read-only рассмотрение
`native_scope_audit` и `p4_feasibility`; код и результаты P4 ещё требуют
самостоятельного аудита. Лид одобрил исполнение CR #758. Наличие спецификации
и реализация harness не означают PASS. P5/P6 не допускаются при незакрытом P4.

## Пересмотр seam после отрицательного результата

Продолжение CR #758 сохраняет исходные критерии. На 2026-10-18 ведущий
`/root` одобрил исправление native item identity (#759), инструментализацию
загрузки и ограниченный preload/fork prototype (#760). Независимый
`recovery_contract` проверил будущую границу измерений до реализации.
Это разрешение на эксперимент, не приёмка P4 и не пересчёт старых результатов.

Native deserialization должен переносить уже существующие item instances с
сохранением UID; обычное копирование продолжает создавать новую identity.
Проверки охватывают nested containers, fallback/restack/merge, обычную copy
semantics и оба pickup из fault suite. UID остаётся в строгом readback.

Инструментализация сохраняет прежний полный load timer и добавляет вложенные
фазы static definitions, metadata и физического world load. Фактический parent
выполняет `g->setup()` с `load_world_modfiles()` на scratch-копии metadata;
это полный world-specific setup, а не только immutable static definitions.
Он не вызывает `load(save_t)`, `start_game`, действия или save.
Каждый запрос выполняется свежим fork-child: все userdir/save/config/cache
пути указывают на его mutable staging либо candidate scratch, затем штатный
native `load(save_t)` читает физический мир из файлов поколения. Parent ждёт
ребёнка без загрузки save, но после world setup. До применения fork проверяется
отсутствие фоновых потоков и унаследованных изменяемых ресурсов мира.

Один host обслуживает только один неизменяемый профиль: binary/data revision,
ordered mod list, custom mods/interactions и влияющие на definitions options.
Несовпадение требует отказа или cold restart; многопрофильный cache не нужен.
Все затраты физического world load, readback/validation, save, copy, fsync и
publication вошли в прежний child-бюджет. Parent `g->setup()` вместе с world mods
из него исключены, что нарушило условие #760; прежнее описание этого как
разрешённого исключения static/core было ошибочным.
Полная cold whole-host recovery и warm child recovery публикуются раздельно.

В историческом отладочном протоколе требовалось также native сохранение и восстановление
текущего RNG engine state: сохранение одного world seed не доказывает
продолжение последовательности. RNG остаётся у native owner, входит в полное
поколение и проверяется continuation/reload и повторным readback. Coordinator
не хранит отдельное authoritative RNG state. Неизменные fault matrix,
20 samples после одного warmup, p95 ≤5 s и generation ≤512 MiB обязательны.
Прежнее объявление технического gate принятым исправлено по
[результатам приёмки](cataclysm-p4-recovery-results.md): FAIL ворот, механизм принят.
RNG sidecar, operation generations и receipts — только отладка по D215/D216.
Речевые T11/T12 остаются OPEN; этот протокол не разрешает P3/P5/P6.
