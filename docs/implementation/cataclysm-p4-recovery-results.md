# CDDA P4: повторная проверка UID, RNG и preload

**Статус:** REFERENCE / DOMAIN GUIDE. **Дата:** 2026-10-19.
**CR:** [#758](https://github.com/PavelSlaven/Novgorod1230/issues/758).
**Критерии:** [протокол P4](cataclysm-p4-experiment.md).

**Новая инструментализация задания 02:** [таблица фаз и условия](../../tools/cataclysm-prototype/TASK02.md#p4-честное-описание-и-таймеры), [сырые измерения](../../tools/cataclysm-prototype/evidence/task02-startup/measurements.json).
Три новых process-cold read: **68,791 / 68,828 / 64,891 с**, из них
`g->setup()` — **60,610 / 60,830 / 56,626 с**, `load_world_modfiles()` —
**60,473 / 60,718 / 56,480 с**. Полная разбивка находится по ссылке, вложенные
фазы не суммируются повторно. Данные теперь в Windows worktree под WSL;
исторический результат 11,819 с на Linux filesystem не воспроизведён в тех же
условиях. Новый замер превышает ≤20 с и не подтверждает новые ворота P4a.

**Исправленный статус (задание 02, 2026-10-19): P4 — FAIL как закрытие прежних ворот; механизм принят.**
Итоговая приёмка Opus high установила: warm p95 исключал `g->setup()` вместе
с world-specific mod loading, вопреки условию #760. Старые измерения ниже
сохраняются; они не доказывают прежний gate и новые ворота живой игры.
Исторический [аудит](../../tools/cataclysm-prototype/evidence/p4-recovery-contract-audit.md)
не заметил этого; его PASS не является текущей итоговой приёмкой.
Проверявшийся код/evidence — `8fc063366db1579aa5e20420f0ec25d3aa04ce81` (PR #768).
По D215/D216 host заморожен, бюджет на операцию отменён. Новые P4a/P4b из
[исправленного плана](../plans/Novgorod1230_Cataclysm_Vertical_Slice_Implementation_Plan_2026-10-19.md)
требуют отдельных проверок: save из живой игры ≤5 с, startup/recovery ≤20 с,
поколение ≤512 МиБ. Речевые T11/T12 и приёмка новой схемы остаются открыты.
Предыдущий [отрицательный эксперимент](cataclysm-p4-results.md) сохраняет
свой verdict и измерения.

## Изменение проверяемого механизма

Native deserialization переносит item instances с их UID; обычная копия
по-прежнему получает новую identity. Native save/load сохраняет текущий RNG
engine state. Python coordinator не становится владельцем RNG или предметов.

Parent выполняет полный `g->setup()`, включая `load_world_modfiles()`:
`native-preload.patch:136`, patched `game.cpp:687–715` в снимке приёмки.
Он подготавливает world-specific профиль и моды, но не вызывает `load(save_t)`,
действия или `save()`. Каждый
physical load/apply/read выполняет свежий fork-child на mutable scratch-copy.
Принятые поколения остаются неизменяемыми; публикацией, execution IDs и retry
владеет тот же coordinator стенда. В старый warm бюджет вошли child world load,
save, copy, fsync, publication и validation. Вынесены **весь parent setup и world
mods**, не только static/core bootstrap. Именно это нарушило условие #760.
Развитие preload/fork остановлено; instrumentation не меняет его назначения.

Pinned upstream: `0d8843f1c500052c3e026e3da6f8edaf5e00b626`;
Clang 19.1.1 Release, WSL2 Ubuntu 24.04, Linux filesystem, native seed 17.
Свежая сборка и исходная воспроизводимость описаны в
[recovery baseline](../../tools/cataclysm-prototype/evidence/recovery-baseline.md).
Команды повторения — в [README](../../tools/cataclysm-prototype/README.md).

## Полученные результаты

| Проверка | Фактический результат |
|---|---|
| Fault/recovery suite | 15 сценариев; `status: passed` |
| Pickup rock и stick | Оба `roundtrip_validated`; retry не вызывает native apply |
| Принятый неизвестный результат | `uncertain_stop`, без молчаливого отката |
| Preload host death | Старое целое поколение; fresh-process recovery |
| Измерения | 20 pickup_rock samples после одного исключённого warmup |
| Исторический warm budget, nearest-rank p95 (rank 19) | **2814.19 ms**; исключает parent setup/world mods, не PASS ворот |
| Максимальное полное поколение | **1 205 151 bytes ≤ 536 870 912 bytes** |
| Cold whole-host recovery | 13 138.10 ms, включая startup 11 819.48 ms |
| Первый cold-host physical read child | 1138.56 ms; входит в cold recovery |
| Focused coordinator unit tests | 13/13, Python 3 в WSL |
| Native focused regression | 12 test cases, 589 assertions, 0 failures/errors |
| Native RNG fault modes | Save failure, malformed load и legacy missing sidecar: 0 failures/errors |
| Воспроизводимость overlays | Все 22 затронутых пути совпали после применения пяти patches по порядку; учтён CRLF/LF checkout |
| Несовпадение preload profile | Изменённый порядок mods отвергнут до child; native protocol также вернул `profile_mismatch`, host остался жив |

Полная операция и reset-copy timing каждого sample сохранены отдельно.
Подготовка независимого baseline для следующего sample не заменяет copy/fsync
внутри измеряемой операции. Cold whole-host recovery не объявляется ≤5 секунд.

Доказательства:

- [Fault matrix](../../tools/cataclysm-prototype/evidence/p4-recovery-fault-suite.json)
  и [команды](../../tools/cataclysm-prototype/evidence/p4-recovery-fault-commands.json).
- [Все измерения](../../tools/cataclysm-prototype/evidence/p4-recovery-metrics.json)
  и [параметры запуска](../../tools/cataclysm-prototype/evidence/p4-recovery-metrics-commands.json).
- [Композиция native source](../../tools/cataclysm-prototype/evidence/p4-recovery-native-composition.json)
  и [focused JUnit](../../tools/cataclysm-prototype/evidence/p4-recovery-native-focused.xml).
- RNG: [save failure](../../tools/cataclysm-prototype/evidence/p4-recovery-rng-save-failure.xml),
  [malformed load](../../tools/cataclysm-prototype/evidence/p4-recovery-rng-malformed.xml),
  [legacy missing file](../../tools/cataclysm-prototype/evidence/p4-recovery-rng-legacy.xml).
- [Дополнительный runtime profile check](../../tools/cataclysm-prototype/evidence/p4-recovery-profile-check.md)
  выполнен после аудита на frozen P4 executable и закрывает его coverage note:
  normal read успешен, оба mismatch отклонены, accepted generation не изменилось.

Это копии JSON завершённых запусков. Старые описательные строки `purpose`
и `command_template` ещё содержат исходные названия: фактические pickup outcomes
даны в `scenarios`, а операция измерений — в поле `operation: pickup_rock`.

## Неуспешный запуск и границы вывода

Первый preload metrics запуск остановился до первого sample: strict load
вернул child exit 122. Scratch-copy сохранила read-only permissions поколения,
а native zzip loader открывает файл через writable mmap. На отдельной копии
те же байты успешно загрузились после восстановления write permission.
Coordinator теперь делает mutable именно cold-read scratch; время подготовки
учтено. После исправления cold read, pickup и повторный read совпали, затем
полностью выполнен новый пакет 20+1. Провалившийся каталог сохранён:
`/home/slaven/cataclysm-recovery-evidence/uid-rng/preload-metrics-20261019`.

Успешные исходные evidence directories: `preload-suite` и
`preload-metrics-fixed-20261019` под тем же `uid-rng` root. Process-kill/fault injection не доказывают
устойчивость к физическому отключению питания. Реальные речь, аудитория и
социальная запись P3 ещё не проверены в общем durable checkpoint.
