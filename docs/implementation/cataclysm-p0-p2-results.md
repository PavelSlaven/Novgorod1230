# CDDA P0–P2: фактические результаты native эксперимента

**Статус:** REFERENCE / DOMAIN GUIDE. **Дата:** 2026-10-18.
**CR:** [#756](https://github.com/PavelSlaven/Novgorod1230/issues/756).
**Спецификация:** [fixture и критерии до реализации](cataclysm-p0-p2-experiment.md).
**Воспроизведение:** [команды и pinned source](../../tools/cataclysm-prototype/README.md).

Native проверки P1/P2 прошли. Это допуск к исследованию P4/P3, не готовый
игровой срез и не production cutover.

Независимый Contract/data/code audit: **PASS_WITH_NOTES**, Codex (GPT-6),
2026-10-18, commit `22e1d1da5eff19cb854d3f6132c259df1c85fa3b`.
WR §21.1: утверждены authored technical fixture, пороги и evidence в
`docs/implementation/cataclysm-p0-p2-experiment.md`, этом отчёте,
`tools/cataclysm-prototype/novgorod_slice_test.cpp` и обоих
`tools/cataclysm-prototype/evidence/seed-{17,23}.jsonl` на указанном commit.
Проверяющий сверил код и сохранённые логи; новую сборку при аудите не запускал.
Ограничения walking AUTOPEEK и дальнейших этапов остаются явными ниже.

Repository checks: `docs:check`, `test:docs` (12/12), `architecture:check`,
`git diff --check` прошли. Новый MODULE потребовал штатного `docs:generate`;
после генерации повторные docs checks прошли. CBM `detect_changes` подтвердил
11 путей; docs/tools исключены из индекса, поэтому выводы проверены прямым
чтением всех changed sources и native upstream, а не полнотой графа.

## Сборка

CDDA `0d8843f1c500052c3e026e3da6f8edaf5e00b626`, Clang 19.1.1,
CMake 3.28.3, Ninja 1.11.1, Release/curses, TILES=OFF, BUILD_TESTING=ON,
CATA_CCACHE=OFF, восемь jobs. Машина и WSL описаны в спецификации.

- Первичная pristine сборка: 785/785 Ninja actions; native `[activity],[npc]`:
  244 cases, 26 009 assertions, 44.9518 s, exit 0.
- Независимый shallow clone того же SHA: 785/785; тот же smoke:
  244 cases, 26 009 assertions, 52.6634 s, exit 0.
- GCC 13.3 Release остановился на upstream `vehicle_use.cpp` из-за
  `-Werror=maybe-uninitialized`. Warning policy не отключалась; выбран Clang.
- `git apply --check` финального patch на чистом повторном clone прошёл.
- После финального patch повторный `[activity],[npc]`: 244 cases,
  26 009 assertions, 41.2778 s, exit 0.

## P2: исполненные проверки

Два независимых запуска `[novgorod_slice]`, seeds 17 и 23: каждый exit 0,
541 assertions, четыре test cases. Длительность с загрузкой данных:
18.2261 s и 18.0503 s соответственно. Пропущенных cases в этих запусках нет.
Readback сохранён в [seed 17](../../tools/cataclysm-prototype/evidence/seed-17.jsonl)
и [seed 23](../../tools/cataclysm-prototype/evidence/seed-23.jsonl), по 14 JSON records.

| Проверка | Подтверждённый результат |
| --- | --- |
| P1 fixture | Native карта, закрытая дверь и стена, три различных NPC ID, шесть положительных уникальных item UID |
| T01 | Восток и северо-восток через `handle_action`/`do_turn`; native absolute position, moves и calendar изменились |
| T02 | Стена остановила перемещение; native impassability и видимость препятствия подтверждены |
| T03 | Rock и stick перенесены с земли в native backpack; количество 1, на земле 0; pickup создаёт новый UID по upstream семантике |
| T04 | Native hacksaw activity: 12000 moves, 113 ticks/seconds, fence → dirt и шесть pipe; после первого тика activity ещё активна, ограда цела; NPC продвигаются общим loop |
| T05 | Заранее существующий zombie сначала скрыт; первый шаг открывает угрозу; native safe mode STOP отвергает второй шаг; readback остаётся на первом шаге |
| Исчерпание ввода | Следующий запрос без команды явно завершается `NOVGOROD_TEST_INPUT_EXHAUSTED` |

T05 сохраняет STOP до явных `IGNORE_ENEMY`/`PAUSE`, завершающих текущий тик.
Сам STOP, позиция, время и visibility не устанавливаются тестом после before.
В seed 17 и 23 очередь наблюдала safe mode `1 → 2 → 2 → 1`; два последних
состояния отделяют отклонённое движение от последующего подтверждения угрозы.

## Измерения

Пять прогревочных действий, затем 100 samples; nearest-rank p50/p95.
Время загрузки данных не включено. Это маленькая fixture, не crowd benchmark.

| Метрика | Seed 17 | Seed 23 | Порог P0 |
| --- | ---: | ---: | ---: |
| Native tick p50 / p95, ms | 1.973 / 2.468 | 2.001 / 2.510 | — |
| 100 последовательных ticks, ms | 200.975 | 209.338 | ≤2000 |
| Move round-trip p50 / p95, ms | 4.977 / 5.670 | 4.656 / 5.164 | p95 ≤250 |
| Peak RSS, GiB | 1.068 | 1.081 | ≤8 |

## Выявленные ограничения

Первый native draft не компилировался: использовал несовместимые API pinned
версии. Исправлены UID accessor, include map selector и длительность; draft
не учитывался как успешная проверка. Затем T05 в `run-17-d/e` фактически
провалился: visibility cache без renderer обновлялся после дополнительного
шага. Узкое test-mode обновление native caches перед существующим
`mon_info_update` исправило этот lifecycle; `run-17-f` и seed 23 прошли.

Walking AUTOPEEK и свободный UI-диалог требуют других интерактивных входов.
Поэтому T05 использует native run mode, а fixture NPC — neutral attitude.
Это явные границы P2 harness. Общий headless UX, свободная речь, NPC semantic
arbiter, невидимые игроку данные, approved prose и браузер ещё не проверены.

UID native предмета нельзя считать стабильным при pickup. Readback сохраняет
оба UID и баланс; будущий adapter обязан учитывать реальное правило CDDA.

P4 checkpoint/crash/retry ещё не выполнен. P3–P6, T06–T18 и GO_FOR_P7 не
заявляются. Production bindings, PostgreSQL и пользовательские saves не менялись.
