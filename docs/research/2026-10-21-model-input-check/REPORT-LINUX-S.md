# Малый круг проверки входа v2 на Linux

Исправлены оба отказа боевых запусков. Для блока прав запись /tmp теперь подтверждается только явным exclude_slash_tmp: false в Linux-контексте и единственным вхождением этого корня. Resume до любого вызова Codex проверяет исходный cwd по единственному rollout нити. Установленные v2-live/ и servak v2/ не менялись; разрешающий JSON остался побайтно прежним. Исходные решения и ограничения зафиксированы в PLAN-LINUX-S.md.

| Пункт | Правка, файл:строка | Тест | Красный лог | Зелёный лог | Мутант |
|---|---|---|---|---|---|
| Н6, Linux /tmp | check-codex-input.py:134–141 | test_input_check.py:2575,2588: точный блок и SHA 95dfb1a7…; пять запретов | linux-s-red.log:729–735: прежний checker отверг разрешённый блок. Отрицательные случаи — закрепление | linux-s-green-pc.log:180, linux-s-green-servak.log:69 | tmp_policy_unconditional, tmp_duplicate, tmp_windows: linux-s-mutants.log:855,876,897 |
| Н7, cwd и история resume | codex-exec.sh:45–89: физический PWD, точный ID, один rollout и первая session_meta, лексическое сравнение через checker | test_input_check.py:2615,2640,2650: неверная папка, отсутствие/дубль/повреждение rollout, иной каталог sessions, неверный ID, совпадение и Git Bash | linux-s-red.log:736–883: старый wrapper успел вызвать Codex или дал неверный код; invalid-id краснеет по причине | linux-s-green-pc.log:180, linux-s-green-servak.log:69 | resume_no_preflight, resume_after_version, resume_first_rollout, resume_loose_id, resume_without_cygpath: linux-s-mutants.log:939,965,1002,1025,1048 |
| Н2, кодировка TOML | codex-exec.sh:93: UTF-8 для разборщика | test_input_check.py:2660: родительская кодировка cp1251 | linux-s-red.log:885–891: вместо [вход] получались символы замены | linux-s-green-pc.log:180, linux-s-green-servak.log:69 | linux-s-mutants.log:1071 |
| Н3, фикстура отпечатка | fixtures-linux/wrapper-v2-live-accepted.sh; ссылка теста test_input_check.py:899 | Сравнение потока отпечатка при трёх синтетических MCP-серверах; закрепление | Исходная сдача уже проходила; доказательство — мутант config_order | linux-s-green-pc.log:180, linux-s-green-servak.log:69 | linux-s-mutants.log:1139 |
| Н4, сегменты . и .. | Код check-codex-input.py:74–79 уже отвергал их; добавлен test_input_check.py:2670 | Linux POSIX-правило; закрепление | На исходной сдаче зелёный, что соответствует найденному поведению | linux-s-green-pc.log:180, linux-s-green-servak.log:69 | linux-s-mutants.log:1115 |
| Н5, подсказка resume | codex-exec.sh:6 | test_input_check.py:2517 | linux-s-red.log:723–726: нет предупреждения о -s | linux-s-green-pc.log:180, linux-s-green-servak.log:69 | linux-s-mutants.log:1093 |

Финальная секция красного прогона имеет тот же SHA тестов 0eab0f59e68b19a021b1f0e6b8543dfbe629bbda10c5ca74d1153e187af1decc, что и зелёная: linux-s-red.log:713, linux-s-green-pc.log:168. На копии исходных исполняемых файлов она дала **10 failed, 11 passed, 249 deselected** (linux-s-red.log:892); отличающие падения относятся к Н6, Н7, Н2 и Н5. Закрепления Н3, Н4 и отрицательные случаи Н6 доказаны мутантами. Последний круг мутантов, linux-s-mutants.log:837–1141, поймал все **12** вариантов по утверждению теста. Для Git Bash тест избирательно отключает автоматическое преобразование одного аргумента MSYS, иначе оно скрывало бы удаление cygpath.

Полный прогон на ПК: **270 passed**, 2026-10-22 00:38:27–00:39:53 UTC (linux-s-green-pc.log:167–183). Полный прогон на servak в отдельной тестовой папке: **269 passed, 1 skipped**, 2026-10-22 00:40:15–00:40:43 UTC (linux-s-green-servak.log:57–72). Пропущен только test_linux_s_resume_git_bash_pwd_matches_windows_meta: его входом является Windows Git Bash /c/…; на ПК он прошёл. Проверка bundle после тестов: **88 файлов, расхождений SHA нет** (linux-s-audit.json, 2026-10-22T00:42:03Z). Реальный Codex и модель в этом круге не запускались.

| Файл | SHA-256 до | SHA-256 после |
|---|---|---|
| check-codex-input.py | fa08d4966101d88013e95bf067855f163cffe6fea07fa4af33cbdec7f9b5988e | e0edb883602d8f722b63fea4e7b7e6a1913bb4ec8d0a718a79f6d294b6fa2ed4 |
| codex-exec.sh | b8e3cd66f714ea21d7ef32a1ef481ce95d45e2fd4e00f0d606661fcbccabfb7c | 19947e42637fd5ef14bba1b49f7ecc6bf8b37350fd7bac5ee4c93b892a13d7ba |
| codex-input-allow.json | 397d0a1bd2080a4172686ecb84ac71d160d4966c0e4d889a7fbe8ccfabdadba5 | 397d0a1bd2080a4172686ecb84ac71d160d4966c0e4d889a7fbe8ccfabdadba5 |

Фикстура fixtures-linux/wrapper-v2-live-accepted.sh — точная копия читаемой установленной v2-live/codex-exec.sh, обе с SHA b8e3cd66f714ea21d7ef32a1ef481ce95d45e2fd4e00f0d606661fcbccabfb7c (linux-s-audit.json). Три исполняемых файла и тест в bundle servak равны исходникам ПК по SHA; linux-s-audit.json сверяет также каждый файл с манифестом servak.

Локально изменены check-codex-input.py, codex-exec.sh, test_input_check.py и тестовый запускатель linux-work/run-pytest.py (добавлен параметр --basetemp). Созданы fixtures-linux/wrapper-v2-live-accepted.sh, .baseline-linux-s/ с тремя исходными файлами, linux-s-work/{create-bundle.py,run-mutants.py,run-servak.py,verify-bundle.py,audit.py,bundle/}, .mutants-linux-s/, локальные каталоги .pytest-linux-s*, linux-s-{red,green-pc,green-servak,mutants}.log, linux-s-audit.json и этот отчёт. Полный перечень файлов bundle — linux-s-work/bundle/manifest.json.

На servak создана и изменялась только собственная /srv/novgorod-work/codex-direct/test-runs/v2ls-20261022T003144Z/: bundle/ по манифесту, копия зависимостей pydeps/ из прежней собственной тестовой папки, tmp/, .pytest-linux-s/ и verify-bundle.py. Установленная /srv/novgorod-work/codex-direct/v2/, домашний каталог Codex и журналы задач не менялись.

## Не проверено

Новый живой запуск модели не делался по условию задания; разрешённый блок /tmp воспроизведён по точному тексту и turn_context названной нити. Дополнительный корень из $TMPDIR остаётся FAIL до отдельного разбора. Лексический preflight намеренно отвергает симлинк и алиас cwd, даже когда они ведут в ту же папку. Для new рабочая папка задаётся аргументом <W>, поэтому сравнение с PWD не вводилось. Установку на ПК и servak выполняет ведущий после проверки этого отчёта.
