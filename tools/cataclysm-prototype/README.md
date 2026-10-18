# Native сборка и smoke tests CDDA

Изолированный прототип собирается в WSL2 из точного upstream commit
`0d8843f1c500052c3e026e3da6f8edaf5e00b626`. Он не подключён к production
Novgorod и не открывает пользовательские saves. Fixture P0–P2 описана в
[`docs/implementation/cataclysm-p0-p2-experiment.md`](../../docs/implementation/cataclysm-p0-p2-experiment.md).

## Среда

Проверенная платформа: Windows 11 Pro 10.0.26200, WSL2 Ubuntu 24.04.4,
ядро Linux 6.6.114.1, Intel i9-12900K, 24 логических CPU для WSL, 31 GiB RAM
и 8 GiB swap. Исходник находится в Linux filesystem WSL:
`/home/slaven/cataclysm-vertical-slice`.
Инструменты: CMake 3.28.3, Ninja 1.11.1, Git 2.43.0, GCC 13.3.0 и Clang
19.1.1. Текущая сборка использует Clang; версии и параметры записываются в
`CMakeCache.txt` рядом с build directory.

Установить build prerequisites в Ubuntu:

```sh
sudo apt-get update
sudo apt-get install -y build-essential clang-19 cmake ninja-build \
  libncurses-dev libsqlite3-dev zlib1g-dev libzstd-dev gettext pkg-config
```

GCC 13.3.0 Release-сборка остановилась в
`src/vehicle_use.cpp`: GCC 13.3 при `-O3` сообщил `-Werror=maybe-uninitialized`
для `vpart_position::vehicle_`. Warning policy не отключалась. Повторная
штатная Release-сборка Clang 19.1.1 завершилась успешно; binary и upstream
smoke подтверждены ниже. Независимая повторная сборка в отдельном shallow clone завершилась успешно (785/785 Ninja actions); повторный smoke также прошёл.

## Checkout и сборка

```sh
git clone --depth=1 --no-checkout \
  https://github.com/CleverRaven/Cataclysm-DDA.git \
  /home/slaven/cataclysm-vertical-slice
git -C /home/slaven/cataclysm-vertical-slice fetch --depth=1 origin \
  0d8843f1c500052c3e026e3da6f8edaf5e00b626
git -C /home/slaven/cataclysm-vertical-slice checkout --detach \
  0d8843f1c500052c3e026e3da6f8edaf5e00b626
git -C /home/slaven/cataclysm-vertical-slice rev-parse HEAD
```

Последняя команда должна вывести закреплённый SHA выше. Сконфигурировать
headless curses build с native tests и собрать максимум на восьми jobs:

```sh
cmake -S /home/slaven/cataclysm-vertical-slice \
  -B /home/slaven/cataclysm-vertical-slice/build-clang-release -G Ninja \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_C_COMPILER=clang-19 -DCMAKE_CXX_COMPILER=clang++-19 \
  -DTILES=OFF -DCURSES=ON -DTESTS=ON -DBUILD_TESTING=ON \
  -DCATA_CCACHE=OFF
cmake --build /home/slaven/cataclysm-vertical-slice/build-clang-release \
  --parallel 8
```

После успешной сборки upstream smoke tests запускаются отдельными процессами
и пользовательскими каталогами из корня исходников:

```sh
cd /home/slaven/cataclysm-vertical-slice
./build-clang-release/tests/cata_test --rng-seed 17 \
  --user-dir=/tmp/cdda-novgorod-upstream-smoke-activity '[activity]'
./build-clang-release/tests/cata_test --rng-seed 17 \
  --user-dir=/tmp/cdda-novgorod-upstream-smoke-npc '[npc]'
```

Перед повторным прогоном удалять временные каталоги не требуется: выберите
новый уникальный путь `--user-dir`. Команды для подключения native-input seam и
fixture tests:

```sh
NOVGOROD=/mnt/c/Users/Slaven/.codex/worktrees/cataclysm-vertical-slice/Novgorod
git -C /home/slaven/cataclysm-vertical-slice apply --check \
  "$NOVGOROD/tools/cataclysm-prototype/native-input.patch"
git -C /home/slaven/cataclysm-vertical-slice apply \
  "$NOVGOROD/tools/cataclysm-prototype/native-input.patch"
cp "$NOVGOROD/tools/cataclysm-prototype/novgorod_slice_test.cpp" \
  /home/slaven/cataclysm-vertical-slice/tests/novgorod_slice_test.cpp
cmake -S /home/slaven/cataclysm-vertical-slice \
  -B /home/slaven/cataclysm-vertical-slice/build-clang-release -G Ninja \
  -DCMAKE_BUILD_TYPE=Release -DCMAKE_C_COMPILER=clang-19 \
  -DCMAKE_CXX_COMPILER=clang++-19 -DTILES=OFF -DCURSES=ON \
  -DTESTS=ON -DBUILD_TESTING=ON -DCATA_CCACHE=OFF
cmake --build /home/slaven/cataclysm-vertical-slice/build-clang-release \
  --parallel 8
cd /home/slaven/cataclysm-vertical-slice
./build-clang-release/tests/cata_test --rng-seed 17 \
  --user-dir=/home/slaven/cataclysm-evidence/new-slice-run '[novgorod_slice]'
```

Сценарный smoke проверяет T01–T05 и исчерпание очереди в настоящих
`game::do_turn()` / `handle_action()`. Patch затрагивает `game.h`,
`handle_action.cpp`, `do_turn.cpp`: только test-mode input, read-only observer
и native cache lifecycle перед штатным обнаружением угрозы. Все эффекты
исполняются CDDA. Каталог для каждого запуска выбирается новый; raw logs
лучше хранить вне `/tmp`, который WSL может очистить при перезапуске.

В T05 используется native run mode: walking AUTOPEEK запрашивает отдельный
интерактивный ввод, который этим seam пока не покрыт. Остановка safe mode
фиксируется до явного подтверждения угрозы; подтверждение завершает тик,
но не повторяет отклонённое движение. Это ограниченный исследовательский
harness, а не общий headless runtime или готовность P3–P6.

Фактические результаты и JSON readback см. в
[отчёте P0–P2](../../docs/implementation/cataclysm-p0-p2-results.md).

Подтверждённый pristine upstream smoke запускался с объединёнными фильтрами
`[activity],[npc]` и отдельным каталогом:

```sh
./build-clang-release/tests/cata_test --rng-seed 17 \
  --user-dir=/tmp/cdda-novgorod-upstream-smoke-activity-npc \
  '[activity],[npc]'
```


Независимая повторная сборка проводилась в отдельном shallow clone (использовать
новый путь, если каталог уже существует):

```sh
git clone --depth=1 --no-checkout https://github.com/CleverRaven/Cataclysm-DDA.git \
  /home/slaven/cataclysm-vertical-slice-repeat
git -C /home/slaven/cataclysm-vertical-slice-repeat fetch --depth=1 origin \
  0d8843f1c500052c3e026e3da6f8edaf5e00b626
git -C /home/slaven/cataclysm-vertical-slice-repeat checkout --detach \
  0d8843f1c500052c3e026e3da6f8edaf5e00b626
cmake -S /home/slaven/cataclysm-vertical-slice-repeat \
  -B /home/slaven/cataclysm-vertical-slice-repeat/build-clang-release-repeat \
  -G Ninja -DCMAKE_BUILD_TYPE=Release -DCMAKE_C_COMPILER=clang-19 \
  -DCMAKE_CXX_COMPILER=clang++-19 -DTILES=OFF -DCURSES=ON \
  -DTESTS=ON -DBUILD_TESTING=ON -DCATA_CCACHE=OFF
cmake --build /home/slaven/cataclysm-vertical-slice-repeat/build-clang-release-repeat \
  --parallel 8
cd /home/slaven/cataclysm-vertical-slice-repeat
./build-clang-release-repeat/tests/cata_test --rng-seed 17 \
  --user-dir=/tmp/cdda-novgorod-upstream-repeat '[activity],[npc]'
```
Результат первичной сборки: exit 0, 26 009 assertions, 244 test cases passed за
44.9518 s. Независимый повтор: exit 0, 26 009 assertions, 244 test cases passed за
52.6634 s (тот же pinned version `0d8843f`).

## P4: полные поколения и аварийные проверки

P4 — отдельный исследовательский gate CR [#758](https://github.com/PavelSlaven/Novgorod1230/issues/758).
См. [спецификацию](../../docs/implementation/cataclysm-p4-experiment.md) и
[фактические результаты](../../docs/implementation/cataclysm-p4-results.md).
Обнаруженные UID и latency failures означают **STOP / REVISE_APPROACH**;
наличие harness не означает приёмку persistence или допуск к P5/P6.

После установки P2 patch из команд выше добавить P4 patch и самостоятельный
test source, затем повторить ту же CMake configure/build команду:

```sh
git -C /home/slaven/cataclysm-vertical-slice apply --check \
  "$NOVGOROD/tools/cataclysm-prototype/native-persistence.patch"
git -C /home/slaven/cataclysm-vertical-slice apply \
  "$NOVGOROD/tools/cataclysm-prototype/native-persistence.patch"
cp "$NOVGOROD/tools/cataclysm-prototype/novgorod_persistence_test.cpp" \
  /home/slaven/cataclysm-vertical-slice/tests/novgorod_persistence_test.cpp
cmake -S /home/slaven/cataclysm-vertical-slice \
  -B /home/slaven/cataclysm-vertical-slice/build-clang-release -G Ninja \
  -DCMAKE_BUILD_TYPE=Release -DCMAKE_C_COMPILER=clang-19 \
  -DCMAKE_CXX_COMPILER=clang++-19 -DTILES=OFF -DCURSES=ON \
  -DTESTS=ON -DBUILD_TESTING=ON -DCATA_CCACHE=OFF
cmake --build /home/slaven/cataclysm-vertical-slice/build-clang-release --parallel 8
```

Coordinator использует Python 3 stdlib и Linux `flock/fsync`; запускать в WSL.
Все каталоги ниже должны быть новыми и принадлежать только эксперименту.
`suite` выполняет реальные SIGKILL на process barriers, native reload и retry;
ENOSPC внедряется записью в `/dev/full`. Это process-crash тест, не power-loss.

```sh
P4="$NOVGOROD/tools/cataclysm-prototype/generations.py"
NATIVE=/home/slaven/cataclysm-vertical-slice
BINARY="$NATIVE/build-clang-release/tests/cata_test"
python3 "$NOVGOROD/tools/cataclysm-prototype/test_generations.py"
python3 "$P4" --experiment-root /home/slaven/cataclysm-evidence/new-p4-dispatch \
  --native-root "$NATIVE" --binary "$BINARY" suite \
  --evidence-root /home/slaven/cataclysm-evidence/new-p4-faults
python3 "$P4" --experiment-root /home/slaven/cataclysm-evidence/new-p4-dispatch \
  --native-root "$NATIVE" --binary "$BINARY" metrics \
  --evidence-root /home/slaven/cataclysm-evidence/new-p4-metrics \
  --samples 20 --operation move_east
```

Exit 2 означает непройденный gate; отчёт сохраняется и не объявляется PASS.
`move_east` — диагностический сценарий, потому что pickup не проходит строгую
сверку UID после reload. Это не замена ordinary-item acceptance. Обычный
`metrics` по умолчанию использует `pickup_rock` и сохраняет строгую проверку.
Полная фикстура и accepted generations не предназначены для production.

## Лицензия исходника

Upstream Cataclysm-DDA распространяет основную игру по CC BY-SA 3.0 с отдельными
исключениями для компонентов. Любые добавленные в этот прототип test/patch-файлы
следуют тому же режиму атрибуции и share-alike; сторонние файлы переносятся только
после отдельной проверки их лицензии.
