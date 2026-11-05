# CI783: разведка на servak

Каталог сервера: `/srv/novgorod-work/scratch/fix04e-ci783/`. Подключение: `ssh -F C:/Users/Slaven/.codex-servak/config -o BatchMode=yes servak …`. Репозиторий склонирован из `/srv/novgorod-work/scratch/fix04e-lead/repo`; HEAD `da8f91947f2eedb6a614062e49326d62f8acb5aa`, ветка `codex/ci783`. Готовое дерево `/tmp/codex04d-native/src` скопировано в `native`. Оно уже содержало правки FIX-04d, поэтому из его git-объектов создан чистый worktree `native-head` на upstream `0d8843f1c500052c3e026e3da6f8edaf5e00b626`. В него наложены `apply-overlays.sh --source`, скопированы шесть `novgorod_*test.cpp` и `novgorod_preload_probe.cpp`, затем `rsync -rc --exclude=.git` перенёс `dev-world` в `data/mods/novgorod_dev_world`.

Сборка из `native-head`: `timeout 1700s nice -n 10 make -j24 CXX=g++-13 RELEASE=1 TILES=0 SOUND=0 LOCALIZE=0 BACKTRACE=0 LINTJSON=0 ASTYLE=0 WARNINGS="-Wall -Wextra -Wno-logical-op" tests`. Код 0, 272,34 с, максимальная RSS 1 932 444 КБ. Компилятор `g++-13 (Debian 13.3.0-16) 13.3.0`; `command -v ccache` не вывел пути. `du -sh native-head` после сборки: 676 МБ. Логи: `servak-build-j24.log`, `servak-build-j24.time`.

Все тесты запускались из `native-head` с `--rng-seed 17 --mods=novgorod_dev_world --user-dir=<отдельный новый пустой каталог>`; каждому запуску дан `timeout 1700s`. Время ниже — `/usr/bin/time` (`elapsed_sec`); полные логи и время в `servak-tag-*.log` и `.time` этой папки.

Точная форма вызова: `timeout 1700s ./tests/cata_test --rng-seed 17 --mods=novgorod_dev_world --user-dir=/srv/novgorod-work/scratch/fix04e-ci783/user-<имя>-01 '<фильтр>'`. Для первых семи строк таблицы `<имя>` совпадает с именем тега без скобок; для трёх следующих — `novgorod_delivery`, `novgorod_autosave_option`, `novgorod_autosave_slow`. JUnit использовал `user-live-junit-01`, отдельный CHAT-case — `user-chat-section-01`. Все каталоги созданы пустыми перед запуском; повторных запусков в них не было.

| Фильтр Catch2 | Код | Время, с | Результат |
|---|---:|---:|---|
| `[novgorod_slice]` | 0 | 32,41 | прошёл |
| `[novgorod_item_uid]` | 0 | 27,65 | прошёл |
| `[novgorod_semantic]` | 1 | 29,46 | Probe требует подготовленный запрос: `novgorod_semantic_test.cpp:334 REQUIRE( request_stream.good() )`. |
| `[novgorod_live]` | 19 | 58,82 | 27 случаев: 19 прошли, 8 упали; 1977/1996 утверждений. |
| `[novgorod_autosave]` | 0 | 335,96 | прошёл, включая два `[slow]` случая. |
| `[novgorod_persistence]` | 1 | 28,20 | Скрытый probe без `NOVGOROD_P4_MODE`: `novgorod_persistence_test.cpp:349`. |
| `[novgorod_rng_state]` | 0 | 28,59 | прошёл. |
| `[novgorod_delivery]` | 0 | 34,34 | прошёл. |
| `[novgorod_autosave][option]` | 0 | 27,96 | прошёл. |
| `[novgorod_autosave][slow]` | 0 | 336,23 | прошёл. |

Отдельный `[novgorod_live] --reporter junit --out /srv/novgorod-work/scratch/fix04e-ci783/live-junit.xml` с новым user-dir: код 19, 60,48 с. Копия XML — `servak-live-junit.xml`; `testsuite` сообщает `tests="1996"`, `failures="10"`, `errors="9"`. Восемь упавших имён TestCase (в XML 11 строк testcase с failure/error из-за SECTION):

1. `Novgorod live speech preserves tags and uses actual native hearing`.
2. `Novgorod semantic NPC speech shares native CHAT candidates`.
3. `Novgorod NPC speech keeps native variable tags literal`.
4. `Novgorod NPC silence is visible behaviour without sound`.
5. `Novgorod speech refusals leave the native world unchanged`.
6. `Novgorod conversation memory records what was heard said and kept silent`.
7. `Novgorod frame exports NPC identity opinion memory and visible items`.
8. `Novgorod whispered avatar speech is heard only as far as native sound reaches`.

Отдельный запуск случая CHAT с `-s`, новым user-dir и теми же флагами: код 1, 31,19 с; `novgorod_semantic_test.cpp:1351 CHECK( eligible == expected_eligible )` падает при `true == false` в одном SECTION. Лог — `servak-chat-section.log`, время — `servak-chat-section.time`.

Пробные запуски `[novgorod_semantic]` и `[novgorod_persistence]` с `NOVGOROD_P4_MODE=create` и новыми user-dir остановились до загрузки тестов: оба код 1, 0,02 с; `test_main` требует также `NOVGOROD_P4_WORLD`. Точные команды и вывод — `Q-CI783-01.md`. Глобальный `[slow]` был запущен по ошибке и остановлен сигналом 15 через 165,89 с; его неполный результат не учитывается. Рабочая копия репозитория не менялась, коммитов не было. Холодную и тёплую сборку здесь не измеряли.
