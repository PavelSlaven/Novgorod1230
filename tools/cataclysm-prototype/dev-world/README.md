# Двор плотника — dev fixture

Крыша избы задаётся отдельным родным OMT на z=1 над всем контуром здания. Для изменения крыши нужен новый мир: уже сгенерированная карта сохранения не перестраивается из mapgen. Стартовый EOC сценария однократно задаёт герою 90% начального запаса калорий через родной math API; при загрузке сохранения он повторно не применяется.

Случайные полные имена героя и NPC берутся из `personal-names.generated.json`. Файл строится из обычных мужских и женских строк пула `novgorod_1230_1250_personal_names_v1` в `data/world-catalogs/novgorod/game-base-v1/names-peoples/personal_names/name_pool_entries.csv`. Отбор содержит 204 мужских и 62 женских имени со статусом `draft`; проекция не утверждает исходные данные. Полное имя равно `name_form`, без добавления фамилии или отчества. Родные snippet-категории заменяются через `override: true`; сохранённые имена прежних персонажей не меняются.

Из корня репозитория:

```sh
node tools/cataclysm-prototype/generate-personal-names.mjs
node tools/cataclysm-prototype/generate-personal-names.mjs --check
node --test tools/cataclysm-prototype/personal-names.test.js
```

Параметр `--output <путь>` записывает проекцию в другой файл. Тест включён в `test:cataclysm-p3` и проверяет байты файла мода, количество имён и соответствие исходному отбору.

Небольшая сцена для проверки живого CDDA: деревянная дверь, стол, один NPC и родные предметы `flint_steel`, `tinder`, `firewood`, `stick`. Это вымышленный двор возле Новгорода, не реконструкция города XIII века и не production world catalog. Вне стартового тайла остаются поля, леса, болота, реки и озёра; города и дороги отключены настройками родного региона (`src/regional_settings.cpp:619–636`), а `feature_flag_settings.whitelist` оставляет двор и разрешённые природные дополнения, исключая остальные места CDDA (`src/overmap.cpp:258–289`). Дополнения получают флаг двора через штатные map-extra flags (`src/map_extras.cpp:1300–1321, 1347–1367; src/map_extras.h:82–86`), а `MONSTER_WHITELIST` с режимом `EXCLUSIVE` разрешает 140 существующих видов фауны (`src/mongroup.cpp:372–442`). Ограничения применяются при создании нового мира: сохранённая карта из mapgen не перестраивается.

Мод подключается родным `MOD_INFO` (`data/mods/dda/modinfo.json`, `src/mod_manager.cpp:190–223`). `overmap_special`, `overmap_terrain`, `mapgen`, `start_location` и `scenario` задают место старта (`src/start_location.cpp:289–310,476`); `mapgen.place_npcs` создаёт NPC (`data/mods/aftershock_exoplanet/maps/mapgen/prepnet_orchard.json:71`). `flint_steel` использует штатный `firestarter` и требует трут (`data/json/items/tool/fire.json:70`). Новых C++-механизмов сцена не вводит.

Для первого мира: поместить каталог мода в `data/mods` изолированной native runtime, открыть CDDA с отдельным `--userdir`, русским `USE_LANG=ru` в `config/options.json` и ядровым `cataclysm-dda.mo` в `share/locale/ru/LC_MESSAGES/`. В `config/user-default-mods.json` задать зависимости только ["dda", "novgorod_dev_world"], затем через родное меню создать мир `novgorod-dev-04` со сценарием «Двор плотника» и сохранить игру штатным действием CDDA (`src/main_menu.cpp:1173`, `src/handle_action.cpp:2940,2953`, `src/game_io.cpp:734`). В `fixture/save/` копировать без правок каталог мира, полученный родным `game::save()`; в `fixture/config/` положить проверенные `options.json` и `user-default-mods.json`. Повторные запуски продолжают тот же save.
Прежний fixture содержал obsolete-мод `test_data`, который попадал в новый мир из `config/user-default-mods.json` (`src/mod_manager.cpp:195-201,310-326`, `src/worldfactory.cpp:84`) и печатал `test recurrence`. Новый fixture на servak находится в `/srv/novgorod-work/scratch/fix04e-devworld/fixture-800-ru`: его `mods.json` содержит только `dda` и `novgorod_dev_world`, а копия прежнего `options.json` уже имела `USE_LANG=ru`. Аватар стартует снаружи у закрытой двери комнаты (`ALLOW_OUTSIDE`), мастер и вещи внутри.

Структурная проверка JSON не доказывает, что CDDA выбрал нужный тайл, выдал подходящее снаряжение и сохранил NPC. Для проверки загрузки и согласованности данных используйте собранный на закреплённом CDDA `tests/cata_test`: проверенная копия бинаря взята из `/srv/novgorod-work/scratch/fix04e-s847/native-trace/tests/cata_test` (SHA-256 `df62f3d613e5dbbb88494e623fd6e98f3165ae9092a8a363f80b2ebc7ebabfd7`). Из отдельного каталога с `data/`, `gfx/` и `tests/cata_test` выполните:

```sh
devworld_userdir=$(mktemp -d ./user-mod-check.XXXXXX)
timeout 1200s ./tests/cata_test --rng-seed 17 --mods=novgorod_dev_world --user-dir="$devworld_userdir" poisson_distribution
```

Ожидаемый код выхода — 0 без debug error при инициализации; на servak это подтверждено логом `/srv/novgorod-work/scratch/fix04e-devworld/mod-validation/positive.log`. Отрицательный контроль с несуществующим `material` в отдельной копии мода дал код 1 и `invalid material` (`negative.log`). `cataclysm --check-mods novgorod_dev_world` на curses-бинаре в PTY 120×40 не завершился за 30 минут (код 124, `/srv/novgorod-work/scratch/fix04e-devworld/checkmods.log`), поэтому здесь используется `cata_test`. Перед использованием fixture дополнительно нужны интерактивные проверки карты, NPC, предмета, двери и родного save/reload; историческая достоверность отдельно не заявлена.

Видимые игроку строки мода — по-русски прямо в JSON. Мастер — шаблон-персона `novgorod_dev_master` («Жирко», `gender`, `personality`, фракция `novgorod_dev_master_household`); `place_npcs` ставит его один раз через `unique_id`, `faction_owner` отдаёт фракции мастера все вещи тайла. `items.json` переопределяет русские названия родных вещей сцены через `copy-from` того же id; механика вещей не меняется. Так же переопределён `stick_common`: сцена его не ставит, но родной мир кладёт его рядом, и NPC видит вещь в кадре.

Для воспроизводимого маршрута старт фиксирует родная зона `ZONE_START_POINT` в `courtyard.json:42` (`src/start_location.cpp:501–511`, `src/mapgen.cpp:3404–3442, 4779`), а поле `"rotate": false` у специального места `novgorod_dev_courtyard_special` сохраняет северную ориентацию (`src/overmap_special.cpp:351`, `src/overmap.cpp:2938–2940`). Эти настройки нужно задать до создания нового мира: уже существующая карта автоматически не перестраивается. Запись состоит из 50 вводов эталонного маршрута задания 25 без исходного ввода №16. После штатного сохранения скопируйте каталог мира без изменений в `world-after-route` до повторной загрузки; проверяющий читает эту копию. Для снимка карты загрузите сохранение с выключенной записью кадров, снимите карту и выйдите без сохранения.

Готовый бинарь `fix04e-fauna` позволяет воспроизвести прежнее падение `corpse_paths > 0` в режиме `EXCLUSIVE`, где родной CDDA очищает `zombify_into` у запрещённой цели. Согласованная правка двух тестов проверяет, что трупы всех 140 разрешённых видов не оживают и их `zombify_into` пуст, а native-тест без загруженной политики подтверждает наличие исходных путей превращения среди разрешённых видов. Новый тест проверит CI ведущего после PR; локальная новая сборка не выполняется.

Проверяющий читает родные JSON из установленного runtime и копию `mtype_taxon_crosswalk.csv` из установленного мода. Для CLI и теста задаются внешние данные:

| Переменная | Значение |
|---|---|
| `NOVGOROD_WILD_REFERENCE_CAPTURE` | каталог `capture25` с эталонной записью и `inputs.log` |
| `NOVGOROD_WILD_REFERENCE_WORLD` | конечное сохранение задания 25 |
| `NOVGOROD_WILD_MOD` | каталог установленного мода `novgorod_dev_world` |
| `NOVGOROD_WILD_ALLOWLIST` | необязательный путь; по умолчанию `tools/cataclysm-prototype/wild-surroundings-allowlist.tsv` |
| `NOVGOROD_WILD_RUN30` | запись из 50 вводов задания 30 после её создания |
| `NOVGOROD_WILD_WORLD30` | копия `world-after-route` после реального маршрута |

После реальной записи задайте `NOVGOROD_WILD_RUN30` и `NOVGOROD_WILD_WORLD30`, затем запустите проверяющий CLI из корня репозитория:

```sh
python3 tools/cataclysm-prototype/check_wild_surroundings.py \
  --run "$NOVGOROD_WILD_RUN30" \
  --reference-inputs "$NOVGOROD_WILD_REFERENCE_CAPTURE/inputs.log" \
  --world "$NOVGOROD_WILD_WORLD30" \
  --mod "$NOVGOROD_WILD_MOD" \
  --allowlist "${NOVGOROD_WILD_ALLOWLIST:-tools/cataclysm-prototype/wild-surroundings-allowlist.tsv}"
```

Unit-тест использует внешние capture/save/mod, поэтому не подключён к CI #31 как автономный тест без этих данных. Для полного запуска задайте `NOVGOROD_WILD_REFERENCE_CAPTURE`, `NOVGOROD_WILD_REFERENCE_WORLD`, `NOVGOROD_WILD_MOD`, `NOVGOROD_WILD_RUN30`, `NOVGOROD_WILD_WORLD30` и при необходимости `NOVGOROD_WILD_ALLOWLIST`, затем выполните:

```sh
python3 -m unittest tools/cataclysm-prototype/test_check_wild_surroundings.py
```
