# Native сборка и smoke tests CDDA

Изолированный прототип собирается в WSL2 из точного upstream commit
`0d8843f1c500052c3e026e3da6f8edaf5e00b626`. Он не подключён к production
Novgorod и не открывает пользовательские saves. Fixture P0–P2 описана в
[`docs/implementation/cataclysm-p0-p2-experiment.md`](../../docs/implementation/cataclysm-p0-p2-experiment.md).

Живая dev-проба с постоянным ext4 userdir запускается через
[`run-p3-dev.ps1`](run-p3-dev.ps1); инструкция — [PLAY](PLAY.md),
фактические проверки и ограничения — [результат задания 03](TASK03-LIVE-RESULT.md).
Это отдельный игровой запуск; команды старого smoke ниже остаются стендом.

## Графика и русский язык

`run-p3-dev.sh` по умолчанию открывает графический `runtime/cataclysm-tiles` с
официальным русским переводом и тайлсетом UltimateCataclysm, текстовая игра —
`run-p3-dev.sh --text`. `run-p3-dev.ps1` на Windows по умолчанию запускает
текстовую игру, графику — с ключом `-Tiles`: окно WSLg может не появиться на
рабочем столе Windows. Если выбранного бинаря нет, запускалка останавливается и
не переключает режим сама; без графического бинаря она называет оба выхода:
текстовую версию и команду подготовки runtime.

Перевод и тайлсет берутся из закреплённого официального архива CDDA
`cdda-experimental-2026-10-18-0359` (Linux, with graphics); URL и sha256 —
в [`prepare_p3_runtime.py`](prepare_p3_runtime.py). Из архива используются
только `lang/mo/ru/LC_MESSAGES/cataclysm-dda.mo` и `gfx/UltimateCataclysm/`,
его бинари не запускаются. Архив скачивается один раз в новый пустой каталог
`~/cdda-assets/cdda-experimental-2026-10-18-0359/graphics/`; без него скрипт
подготовки печатает точную команду `curl` и ожидаемый sha256.

Графическую сборку делает [`build-tiles.sh`](build-tiles.sh) (в WSL). Он
повторяет рецепт CDDA `.github/actions/setup-sdl3-stack`: SDL `release-3.4.10`,
SDL_image `release-3.4.4` и SDL_ttf `release-3.2.2` клонируются с закреплёнными
коммитами (при расхождении HEAD сборка останавливается) и ставятся в свой
префикс, по умолчанию `~/.local/share/novgorod/sdl3-3.4.10`. SDL3_mixer не
нужен: звук выключен (`-DSOUND=OFF`). Затем в `$CDDA/build-tiles` (или
`--build-dir`) собирается цель `cataclysm-tiles` с `-DTILES=ON` и
`-DUSE_PREFIX_DATA_DIR=OFF`: при умолчании CMake игра ищет перевод в
`/usr/local/share/locale`, а не в `lang/mo` рядом с runtime, и молча
остаётся на английском. Поэтому и текстовые сборки ниже конфигурируются с
`-DUSE_PREFIX_DATA_DIR=OFF`. Автотесты при этом остаются на английском: они
задают `USE_LANG=en` в своём userdir.
Пакеты сборки — список рецепта без пяти звуковых библиотек SDL3_mixer, плюс
`glslang-tools` для шейдеров:

```sh
sudo apt-get install -y libfreetype-dev libharfbuzz-dev libjpeg-dev libpng-dev \
  libwebp-dev libtiff-dev libasound2-dev libpulse-dev libx11-dev libxext-dev \
  libxcursor-dev libxi-dev libxfixes-dev libxrandr-dev libxrender-dev libxss-dev \
  libxtst-dev libxkbcommon-dev libwayland-dev libwayland-bin wayland-protocols \
  libdecor-0-dev libdrm-dev libgbm-dev libudev-dev libegl-dev libgl-dev \
  libgles-dev libvulkan-dev libpipewire-0.3-dev libdbus-1-dev libibus-1.0-dev \
  glslang-tools
bash tools/cataclysm-prototype/apply-overlays.sh --source "$CDDA"
bash tools/cataclysm-prototype/build-tiles.sh --source "$CDDA"
```

`apply-overlays.sh` накладывает на свежий checkout закреплённого SHA overlays
из [`native-overlays.txt`](native-overlays.txt) — единственного списка порядка —
и копирует `novgorod_semantic.cpp/.h` в `src/`; на первом патче, который не
ложится, он останавливается. Тест — `python3 -m unittest test_apply_overlays`
в этом каталоге.

## Windows-сборка в GitHub Actions

[`windows-build.yml`](../../.github/workflows/windows-build.yml) собирает
`cataclysm-tiles.exe` строкой «Windows Tiles x64 MSVC» родного `release.yml`
того же SHA: vcpkg, кэш портов, `msbuild`, `windist.ps1`. Перед сборкой тот же
`apply-overlays.sh` накладывает overlays, мод `dev-world` кладётся в
`data/mods/novgorod_dev_world`. Тайлсет `gfx/UltimateCataclysm`, `lang/mo` и
готовые шейдеры `data/shaders` берутся из официального Windows-архива
`cdda-experimental-2026-10-18-0359` (его `VERSION.txt` должен называть тот же
SHA). Исполняемые файлы архива не копируются и не запускаются. Родные задания
тайлсетов и переводов собирают `master` и требуют секрет Transifex.

Запуск — `gh workflow run windows-build.yml` или push в ветку `windows-build`.
Артефакт `novgorod-cdda-windows-tiles-x64` хранится 30 дней: это каталог
`bindist/` с exe, DLL, `data/`, `gfx/`, `lang/mo/` и `VERSION.txt` (SHA CDDA,
коммит Novgorod, ссылка на прогон). Скачать последний успешный:

```sh
gh run download "$(gh run list -R PavelSlaven/Novgorod1230 -w windows-build.yml -s success -L 1 --json databaseId -q '.[0].databaseId')" \
  -R PavelSlaven/Novgorod1230 -n novgorod-cdda-windows-tiles-x64 -D <пустой каталог>
```

Игра запускается из этого каталога с `--basepath <каталог>\` (завершающий
слеш обязателен): в MSVC-сборке `data`, `gfx` и `lang/mo` ищутся от базы. Ключ
`USE_PREFIX_DATA_DIR=OFF` относится только к CMake-сборке Linux.

Шаг `--check-mods` некритичный: на раннере он возвращает 1 и для чистого
`dda`, поэтому зелёный прогон загрузку мода не доказывает.

Шейдеры родная цель `compile_shaders` компилирует в `data/shaders` исходника,
поэтому runtime готовится после графической сборки.

Runtime root готовит скрипт (в WSL, из корня этого репозитория):

```sh
python3 -I tools/cataclysm-prototype/prepare_p3_runtime.py \
  --runtime-root "$HOME/cataclysm-<задача>/runtime-root" \
  --source "$CDDA" \
  --text-build "$CDDA/build-clang-release" \
  --tiles-build "$CDDA/build-tiles" \
  --fixture <каталог с save/ и config/options.json>
```

`--source` — исходник CDDA с overlays прототипа; `--text-build` и
`--tiles-build` — каталоги сборок CMake (нужен хотя бы один) с
`CMAKE_BUILD_TYPE=Release` и `USE_PREFIX_DATA_DIR=OFF`, иначе скрипт
отказывает. Скрипт сверяет sha256 архива до любых записей, берёт
`run/session.lock` (запущенная игра — отказ, runtime не меняется) и собирает
новый runtime рядом, во временном каталоге: родной `cmake --install` каждой
сборки, затем перевод, мод `dev-world`, тайлсет и копия `gfx/` в `data/gfx`
(с `--datadir` игра ищет тайлсеты там, `src/path_info.cpp:538-544`). Готовый
каталог подменяет `runtime` переименованием; при ошибке прежний runtime
остаётся. В `data/CMakeLists.txt` CDDA перечислен каталог `help`, которого в
исходнике нет; без него `cmake --install` падает, поэтому скрипт создаёт пустой
`data/help` и печатает об этом строку. `build-tiles.sh` конфигурирует сборку с
`-DCMAKE_INSTALL_RPATH_USE_LINK_PATH=ON`: иначе установка срезает путь к
SDL3 из префикса. В
`fixture/config/options.json` выставляет `USE_LANG=ru`, `USE_TILES=true`,
`TILES=UltimateCataclysm` и `SDL_KEYBOARD_MODE=keycode`. В родном режиме
`keychar` при русской раскладке буквенные горячие клавиши приходят кириллицей
и не срабатывают (`g` → «неизвестная клавиша»); в `keycode` они работают при
любой раскладке, а окно F12 само включает текстовый ввод и принимает кириллицу.
`--fixture` нужен только для нового runtime root:
существующий fixture не заменяется. Уже созданный `userdir` скрипт не трогает,
поэтому в начатом мире язык и графика меняются в настройках игры или через
`--reset` (прежний userdir сохраняется рядом).

## Среда

Проверенная платформа: Windows 11 Pro 10.0.26200, WSL2 Ubuntu 24.04.4,
ядро Linux 6.6.114.1, Intel i9-12900K, 24 логических CPU для WSL, 31 GiB RAM
и 8 GiB swap. Общий закреплённый checkout — `/home/slaven/cataclysm-recovery`
в Linux filesystem WSL; он только для чтения. Команды ниже собирают свою копию в
новом каталоге ext4: `CDDA` в них — этот каталог, например `CDDA=$HOME/cataclysm-<задача>`.
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
  $CDDA
git -C $CDDA fetch --depth=1 origin \
  0d8843f1c500052c3e026e3da6f8edaf5e00b626
git -C $CDDA checkout --detach \
  0d8843f1c500052c3e026e3da6f8edaf5e00b626
git -C $CDDA rev-parse HEAD
```

Последняя команда должна вывести закреплённый SHA выше. Сконфигурировать
headless curses build с native tests и собрать максимум на восьми jobs:

```sh
cmake -S $CDDA \
  -B $CDDA/build-clang-release -G Ninja \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_C_COMPILER=clang-19 -DCMAKE_CXX_COMPILER=clang++-19 \
  -DTILES=OFF -DCURSES=ON -DTESTS=ON -DBUILD_TESTING=ON \
  -DCATA_CCACHE=OFF -DUSE_PREFIX_DATA_DIR=OFF
cmake --build $CDDA/build-clang-release \
  --parallel 8
```

После успешной сборки upstream smoke tests запускаются отдельными процессами
и пользовательскими каталогами из корня исходников:

```sh
cd $CDDA
./build-clang-release/tests/cata_test --rng-seed 17 \
  --user-dir=/tmp/cdda-novgorod-upstream-smoke-activity '[activity]'
./build-clang-release/tests/cata_test --rng-seed 17 \
  --user-dir=/tmp/cdda-novgorod-upstream-smoke-npc '[npc]'
```

Перед повторным прогоном удалять временные каталоги не требуется: выберите
новый уникальный путь `--user-dir`. Команды для подключения native-input seam и
fixture tests:

```sh
NOVGOROD=/mnt/c/Users/Slaven/Documents/Novgorod
git -C $CDDA apply --check \
  "$NOVGOROD/tools/cataclysm-prototype/native-input.patch"
git -C $CDDA apply \
  "$NOVGOROD/tools/cataclysm-prototype/native-input.patch"
cp "$NOVGOROD/tools/cataclysm-prototype/novgorod_slice_test.cpp" \
  $CDDA/tests/novgorod_slice_test.cpp
cmake -S $CDDA \
  -B $CDDA/build-clang-release -G Ninja \
  -DCMAKE_BUILD_TYPE=Release -DCMAKE_C_COMPILER=clang-19 \
  -DCMAKE_CXX_COMPILER=clang++-19 -DTILES=OFF -DCURSES=ON \
  -DTESTS=ON -DBUILD_TESTING=ON -DCATA_CCACHE=OFF \
  -DUSE_PREFIX_DATA_DIR=OFF
cmake --build $CDDA/build-clang-release \
  --parallel 8
cd $CDDA
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
  $CDDA-repeat
git -C $CDDA-repeat fetch --depth=1 origin \
  0d8843f1c500052c3e026e3da6f8edaf5e00b626
git -C $CDDA-repeat checkout --detach \
  0d8843f1c500052c3e026e3da6f8edaf5e00b626
cmake -S $CDDA-repeat \
  -B $CDDA-repeat/build-clang-release-repeat \
  -G Ninja -DCMAKE_BUILD_TYPE=Release -DCMAKE_C_COMPILER=clang-19 \
  -DCMAKE_CXX_COMPILER=clang++-19 -DTILES=OFF -DCURSES=ON \
  -DTESTS=ON -DBUILD_TESTING=ON -DCATA_CCACHE=OFF \
  -DUSE_PREFIX_DATA_DIR=OFF
cmake --build $CDDA-repeat/build-clang-release-repeat \
  --parallel 8
cd $CDDA-repeat
./build-clang-release-repeat/tests/cata_test --rng-seed 17 \
  --user-dir=/tmp/cdda-novgorod-upstream-repeat '[activity],[npc]'
```
Результат первичной сборки: exit 0, 26 009 assertions, 244 test cases passed за
44.9518 s. Независимый повтор: exit 0, 26 009 assertions, 244 test cases passed за
52.6634 s (тот же pinned version `0d8843f`).

## P4: полные поколения и аварийные проверки

P4 — отдельный исследовательский gate CR [#758](https://github.com/PavelSlaven/Novgorod1230/issues/758).
См. [спецификацию](../../docs/implementation/cataclysm-p4-experiment.md),
[исходный отрицательный результат](../../docs/implementation/cataclysm-p4-results.md)
и [повторную проверку](../../docs/implementation/cataclysm-p4-recovery-results.md).
Прежняя техническая приёмка не заметила исключения world setup из замера.
Итоговая приёмка: FAIL прежних ворот, механизм принят. Новые P4a/P4b открыты;
речевые T11/T12 проверяются после P3 до P6.

Отрицательный исход исходного прогона сохранён в отчёте. Продолжение CR #758
использовало checkout `/home/slaven/cataclysm-recovery` (теперь только чтение); воспроизведение
исходного UID failure и происхождение сборки записаны в
[recovery baseline](evidence/recovery-baseline.md). Новые overlays сохраняют UID
при десериализации, native RNG state и добавляют opt-in preload host.
Их наличие само по себе не закрывает P4.

Overlays на свежий checkout закреплённого SHA накладывает `apply-overlays.sh`
в порядке `native-overlays.txt`. `NOVGOROD` указывает на текущий checkout
этого репозитория в WSL. Все test sources копируются из той же ревизии:

```sh
NATIVE="$NOVGOROD/artifacts/2026-10-19/nativebuild/cataclysm-source"
bash "$NOVGOROD/tools/cataclysm-prototype/apply-overlays.sh" --source "$NATIVE" || exit 1
for source in novgorod_slice_test novgorod_persistence_test novgorod_item_uid_test novgorod_rng_state_test novgorod_preload_probe novgorod_semantic_test; do
  cp "$NOVGOROD/tools/cataclysm-prototype/$source.cpp" "$NATIVE/tests/$source.cpp" || exit 1
  cmp "$NOVGOROD/tools/cataclysm-prototype/$source.cpp" "$NATIVE/tests/$source.cpp" || exit 1
done
cmake -S "$NATIVE" \
  -B "$NATIVE/build-clang-release" -G Ninja \
  -DCMAKE_BUILD_TYPE=Release -DCMAKE_C_COMPILER=clang-19 \
  -DCMAKE_CXX_COMPILER=clang++-19 -DTILES=OFF -DCURSES=ON \
  -DTESTS=ON -DBUILD_TESTING=ON -DCATA_CCACHE=OFF \
  -DUSE_PREFIX_DATA_DIR=OFF
cmake --build "$NATIVE/build-clang-release" --parallel 8
```

`native-control-tests.patch` применяется только после `native-semantic-input`:
он согласует upstream item-colony control с сохранением каждого native UID,
проверяет пустые stackable items и отдельно сохраняет legacy RLE-read coverage.
Runtime serializer этот test-only overlay не меняет. Обоснование изменения
ожиданий по #774 — [test-change-rationale](evidence/task02-native774/test-change-rationale.md).

Coordinator использует Python 3 stdlib и Linux `flock/fsync`; запускать в WSL.
Все каталоги ниже должны быть новыми и принадлежать только эксперименту.
`suite` выполняет реальные SIGKILL на process barriers, native reload и retry;
ENOSPC внедряется записью в `/dev/full`. Это process-crash тест, не power-loss.

```sh
P4="$NOVGOROD/tools/cataclysm-prototype/generations.py"
NATIVE="$NOVGOROD/artifacts/2026-10-19/nativebuild/cataclysm-source"
BINARY="$NATIVE/build-clang-release/tests/cata_test"
python3 "$NOVGOROD/tools/cataclysm-prototype/test_generations.py"
python3 "$P4" --experiment-root /home/slaven/cataclysm-evidence/new-p4-dispatch \
  --native-root "$NATIVE" --binary "$BINARY" suite \
  --evidence-root /home/slaven/cataclysm-evidence/new-p4-faults
python3 "$P4" --experiment-root /home/slaven/cataclysm-evidence/new-p4-dispatch \
  --native-root "$NATIVE" --binary "$BINARY" metrics \
  --evidence-root /home/slaven/cataclysm-evidence/new-p4-metrics \
  --samples 20 --operation pickup_rock --preload
```

Exit 2 означает непройденный gate; отчёт сохраняется и не объявляется PASS.
`move_east` остаётся диагностическим сценарием, а приёмочные метрики используют
`pickup_rock` со строгим сравнением UID и полного native RNG state. `--preload`
вынес из старого warm замера весь parent `g->setup()` с `load_world_modfiles()`;
child загружает сохранение из своего поколения. Поэтому описание parent как
«definitions-only» неверно, а старый результат не закрывает условие #760.
По D215/D216 preload host заморожен как ускоритель отладки; бюджет ≤5 с на
операцию отменён. 20 warm samples остаются историческими измерениями.
Штатный целевой путь — live CDDA, native save по запросу и каждый игровой час;
save ≤5 с, полный start/recovery ≤20 с, поколение ≤512 МиБ ещё надо подтвердить.
Полная фикстура и accepted generations не предназначены для production.

## Лицензия исходника

Upstream Cataclysm-DDA распространяет основную игру по CC BY-SA 3.0 с отдельными
исключениями для компонентов. Любые добавленные в этот прототип test/patch-файлы
следуют тому же режиму атрибуции и share-alike; сторонние файлы переносятся только
после отдельной проверки их лицензии.


## Windows / WSL smoke для native прототипа

Все локальные сборки, пользовательские каталоги и evidence хранятся под
`artifacts/YYYY-MM-DD/`. Исходник `/home/slaven/cataclysm-recovery` — только
локальный cache закреплённого upstream commit; команды этого раздела не меняют
его и не обращаются к сети. Перед запуском в PowerShell из корня репозитория:

```powershell
powershell -ExecutionPolicy Bypass -File tools/cataclysm-prototype/run-p1-curses.ps1 -Smoke
powershell -ExecutionPolicy Bypass -File tools/cataclysm-prototype/native-smoke.ps1
```

Первая команда подготавливает runtime `data/gfx`, копирует P1 save fixture в
свежий userdir и автоматизирует выбор языка, загрузку мира, игровые действия,
save-and-quit и выход из приложения. PTY log, process exit code и до/после
SHA-256 save/RNG readback сохраняются рядом с userdir. Default build root
зафиксирован как `artifacts/2026-10-19/nativebuild`; переопредели его через
`-NativeBuildRoot`. Новые userdirs и evidence используют текущую дату.

Вторая команда запускает native `create`/`apply` speech listener readback и
focused `cata_test` (11 cases / 98 assertions); известные item/JSON/pickup
controls запускаются отдельно и только по явному `-Controls`. Результаты task01
зафиксированы в `evidence/task01-native/` и в dated artifacts.

Последовательность overlays важна; она задана только в `native-overlays.txt`. Семантический
patch содержит P3 native seams и nested item-location fix; preload patch
единолично добавляет `preload` в P4 mode, сохраняя `create`, `apply` и `read`.
P3 доступен только для bare native test agent. Свободная речь и авторская
materialization не готовы; T06–T12 не запускаются этим инструментом.

`PLAY.md` — краткая граница для агента, запускающего native UI или smoke.
`run-p1-curses.ps1` и `native-smoke.ps1` используют только зафиксированный
локальный native build; если его нет, сначала выполните сборку по командам выше.
