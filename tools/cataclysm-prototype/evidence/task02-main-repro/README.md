# Проверка #774 и #776 на `origin/main`

Дата 2026-10-19. `origin/main` после fetch: `25e705074e6741944cc36d38ce05ac2cbc8f3fff`. Исходный upstream CDDA: `0d8843f1c500052c3e026e3da6f8edaf5e00b626`. HEAD рабочего checkout при начале: `287babfeb7c9d608279ed7f4245fb700529997de`.

## #776: generated freshness

`git archive` exact main извлечён в `artifacts/2026-10-19/task02/main-repro-main`. Из корня checkout с `TEMP` и `TMP` внутри `artifacts/2026-10-19/task02` выполнено:

```powershell
node --test artifacts/2026-10-19/task02/main-repro-main/data/world-catalogs/novgorod/game-base-v1/scripts/generated-freshness.test.mjs
```

Exit 1: один тест, один fail, 83.476 с. Builders прошли; свежесть нарушена на 11 committed JSON. Полный список и assertion — [worldcatalog-freshness.log](worldcatalog-freshness.log). Изолированный main archive после теста побайтно проверен по 770 relevant files, отличий нет.

## #774: `item_colony_ser_deser`

Из pinned upstream archive собраны C++ sources. Применены только пять main overlays в порядке `native-input`, `native-persistence`, `native-item-identity`, `native-rng-state`, `native-preload`; их SHA256, сравненные test sources и результаты побайтной проверки 10 433 upstream files — [source-identity.json](source-identity.json). Сборка Release, Clang 19, curses ON, tiles OFF, tests ON. Узкий target включает upstream `test_main.cpp`, `json_test.cpp`, `fake_messages.cpp` и main `novgorod_preload_probe.cpp`. Последний файл требуется main preload overlay; `fake_messages.cpp` требуется для линковки test target. В `tests/CMakeLists.txt` менялся только перечень test translation units.

Из корня checkout выполнено:

```powershell
wsl.exe --exec cmake --build /mnt/c/Users/Slaven/.codex/worktrees/cataclysm-recovery/Novgorod/artifacts/2026-10-19/task02/main-repro-native-build --target cata_test --parallel 8
$src=(Resolve-Path 'artifacts/2026-10-19/task02/main-repro-native-source').Path
$nativeWsl=(& wsl.exe --exec wslpath -a $src).Trim()
$binaryWsl=$nativeWsl.Replace('main-repro-native-source','main-repro-native-build') + '/tests/cata_test'
$userWsl=$nativeWsl.Replace('main-repro-native-source','main-repro-native-userdir')
wsl.exe --cd $nativeWsl --exec $binaryWsl --rng-seed 17 "--user-dir=$userWsl" item_colony_ser_deser
```

Сборка exit 0: [native-build-final.log](native-build-final.log). Бинарник SHA256 `0842959C58F3002AFA406E636F9E3DEE9224F37360739DEF675539967093FAF4`. Control exit 0: 15 assertions, 1 test case, 85.5495 с: [native-control.log](native-control.log). Следовательно, #774 на чистом main этим control не воспроизведён.

Первый узкий target ошибочно не включал `fake_messages.cpp` и не слинковался из-за `Messages::*`. После добавления этого неизменённого upstream test source сборка завершилась. Старые Task01 binaries не использовались.

Проверялись только два указанных случая. Полные `npm test`, native suite, Docker, LLM и платные API не запускались. Это baseline-проверка, не подтверждение готовности игры.
