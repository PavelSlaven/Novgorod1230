# Независимая выборочная сверка land1230-k2

Проверены 152 строки sample.tsv, ссылки плана пилота и числа меры. Итог: 733 проверки; верно 616, неверно 95, не проверить 22. Причина верхнего уровня у содержательных ошибок — данные. Это вывод о выборке, а не утверждение о проверке всего каталога.

Каталог, план, мера, исходники CDDA и исходные материалы не изменялись. Все результаты и промежуточные файлы находятся в K. Игру, сборки и тесты CDDA не запускали; git использовался только для чтения. Цель нити остаётся активной до сообщения ведущего о приёмке DONE.

## Пути и доказательства

- K = `C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/land1230/k2`.
- W = родитель K, `.../codex-direct/land1230`.
- D = `C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct`.
- CS = `C:/Users/Slaven/cdda-src/0d8843f`, база `0d8843f1c500052c3e026e3da6f8edaf5e00b626`.
- R = `C:/Users/Slaven/Documents/Novgorod`. Ссылки `origin/...:путь:строка` открывались через `git -c safe.directory=C:/Users/Slaven/Documents/Novgorod -C R show ветка:путь`. Разовая опция не меняет конфигурацию.

В TSV эти обозначения раскрываются указанными путями. Ссылка вида `:131` после полного имени файла относится к тому же файлу. Короткие цитаты ограничены 200 знаками. Для исторического суждения без открытого первичного документа явно указано «знание проверяющего». Уверенность в конкретном источнике отделена от допустимости самого обычного объекта.

## Числа проверок

| Часть | Проверка | Верно | Неверно | Не проверить |
|---|---|---:|---:|---:|
| А | источник | 139 | 5 | 8 |
| А | пояс | 145 | 5 | 2 |
| А | допустимость | 129 | 20 | 3 |
| А | механизм | 93 | 59 | 0 |
| Б | ссылка | 74 | 2 | 1 |
| Б | нет в CDDA | 5 | 1 | 0 |
| В | число | 24 | 2 | 8 |
| В | арифметика | 7 | 1 | 0 |

## Все отрицательные вердикты

Открытые доказательства находятся в соответствующей строке TSV по ссылке из столбца id. Для части А id — идентификатор каталога, для Б и В — номер строки плана или меры.

| Часть | id | Проверка | Причина | Каким должно быть значение |
|---|---|---|---|---|
| А | [C0058](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/land1230/k2/verdicts.tsv:8) | допустимость | правило | нет; явный анахронизм |
| А | [C0069](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/land1230/k2/verdicts.tsv:19) | пояс | правило | вода / город; без неподтверждённого сельского двора |
| А | [C0091](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/land1230/k2/verdicts.tsv:40) | допустимость | правило | нет; явный анахронизм |
| А | [C0499](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/land1230/k2/verdicts.tsv:67) | пояс | правило | двор / вода / даль |
| А | [C0965](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/land1230/k2/verdicts.tsv:73) | механизм | правило | M20 place_monsters (M19 — группа животных); не размещение предметов |
| А | [C1088](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/land1230/k2/verdicts.tsv:77) | механизм | правило | M20 place_monsters (M19 — группа животных); не размещение предметов |
| А | [C1250](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/land1230/k2/verdicts.tsv:79) | пояс | правило | ? до подтверждения местной привязки |
| А | [C1250](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/land1230/k2/verdicts.tsv:80) | допустимость | знание | да; историческая допустимость не равна надёжности этой ссылки |
| А | [C1250](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/land1230/k2/verdicts.tsv:81) | механизм | правило | M20 place_monsters (M19 — группа животных); не размещение предметов |
| А | [C1550](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/land1230/k2/verdicts.tsv:89) | механизм | правило | M20 place_monsters (M19 — группа животных); не размещение предметов |
| А | [C1854](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/land1230/k2/verdicts.tsv:102) | источник | источник | источник должен включать servak:/srv/novgorod-work/data/master-archive/unpacked/Novgorod1230_MASTER_ARCHIVE_v1/data/normalized_source_tables/material_entities/material_entities.csv:2139 |
| А | [C1854](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/land1230/k2/verdicts.tsv:104) | допустимость | применение правила | да; мастер-архив, уверенность A |
| А | [C1955](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/land1230/k2/verdicts.tsv:106) | источник | источник | источник должен включать servak:/srv/novgorod-work/data/master-archive/unpacked/Novgorod1230_MASTER_ARCHIVE_v1/data/normalized_source_tables/material_entities/material_entities.csv:712 |
| А | [C1955](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/land1230/k2/verdicts.tsv:108) | допустимость | применение правила | да; мастер-архив, уверенность A |
| А | [C2241](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/land1230/k2/verdicts.tsv:123) | пояс | правило | ? до подтверждения местной привязки |
| А | [C2241](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/land1230/k2/verdicts.tsv:124) | допустимость | знание | да; историческая допустимость не равна надёжности этой ссылки |
| А | [C2380](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/land1230/k2/verdicts.tsv:131) | пояс | правило | ? до подтверждения местной привязки |
| А | [C2380](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/land1230/k2/verdicts.tsv:132) | допустимость | знание | да; историческая допустимость не равна надёжности этой ссылки |
| А | [C2724](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/land1230/k2/verdicts.tsv:185) | механизм | правило | M39/M41 или генерация terrain/furniture; не M17/M15 |
| А | [C2957](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/land1230/k2/verdicts.tsv:216) | допустимость | знание | да; историческая допустимость не равна надёжности этой ссылки |
| А | [C3200](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/land1230/k2/verdicts.tsv:229) | механизм | правило | M39/M41 или генерация terrain/furniture; не M17/M15 |
| А | [C3876](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/land1230/k2/verdicts.tsv:254) | источник | источник | источник должен включать servak:/srv/novgorod-work/data/master-archive/unpacked/Novgorod1230_MASTER_ARCHIVE_v1/data/normalized_source_tables/material_entities/material_entities.csv:1570 |
| А | [C3876](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/land1230/k2/verdicts.tsv:256) | допустимость | применение правила | да; мастер-архив, уверенность B |
| А | [C4118](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/land1230/k2/verdicts.tsv:278) | источник | источник | источник должен включать servak:/srv/novgorod-work/data/master-archive/unpacked/Novgorod1230_MASTER_ARCHIVE_v1/data/normalized_source_tables/material_entities/material_entities.csv:273 |
| А | [C4118](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/land1230/k2/verdicts.tsv:280) | допустимость | применение правила | да; мастер-архив, уверенность B |
| А | [C4386](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/land1230/k2/verdicts.tsv:285) | механизм | правило | M47 sounds::sound / M34 u_make_sound, вместо M49/M33 |
| А | [C4398](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/land1230/k2/verdicts.tsv:288) | допустимость | знание | да; историческая допустимость не равна надёжности этой ссылки |
| А | [C4478](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/land1230/k2/verdicts.tsv:297) | механизм | правило | M47 sounds::sound / M34 u_make_sound, вместо M49/M33 |
| А | [C5030](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/land1230/k2/verdicts.tsv:325) | механизм | применение правила | M17/M15 для продукта; механизм обработки пищи для сушки; не NPC M24/M25/M26 |
| А | [C5197](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/land1230/k2/verdicts.tsv:336) | допустимость | знание | да; историческая допустимость не равна надёжности этой ссылки |
| А | [C5283](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/land1230/k2/verdicts.tsv:341) | механизм | правило | M12 с place_terrain/place_furniture или M39 для terrain/furniture; не M17/M15 |
| А | [C5290](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/land1230/k2/verdicts.tsv:345) | механизм | правило | M12 с place_terrain/place_furniture или M39 для terrain/furniture; не M17/M15 |
| А | [C5335](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/land1230/k2/verdicts.tsv:349) | механизм | правило | M12 с place_terrain/place_furniture или M39 для terrain/furniture; не M17/M15 |
| А | [C5336](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/land1230/k2/verdicts.tsv:353) | механизм | правило | M12 с place_terrain/place_furniture или M39 для terrain/furniture; не M17/M15 |
| А | [C5360](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/land1230/k2/verdicts.tsv:357) | механизм | правило | M12 с place_terrain/place_furniture или M39 для terrain/furniture; не M17/M15 |
| А | [C5389](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/land1230/k2/verdicts.tsv:361) | механизм | правило | M12 с place_terrain/place_furniture или M39 для terrain/furniture; не M17/M15 |
| А | [C5408](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/land1230/k2/verdicts.tsv:365) | механизм | правило | M12 с place_terrain/place_furniture или M39 для terrain/furniture; не M17/M15 |
| А | [C5412](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/land1230/k2/verdicts.tsv:369) | механизм | правило | M12 с place_terrain/place_furniture или M39 для terrain/furniture; не M17/M15 |
| А | [C5413](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/land1230/k2/verdicts.tsv:373) | механизм | правило | M12 с place_terrain/place_furniture или M39 для terrain/furniture; не M17/M15 |
| А | [C5416](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/land1230/k2/verdicts.tsv:376) | допустимость | правило | да для названного объекта; фильтр дикой генерации учитывать отдельно |
| А | [C5416](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/land1230/k2/verdicts.tsv:377) | механизм | правило | M12 с place_terrain/place_furniture или M39 для terrain/furniture; не M17/M15 |
| А | [C5430](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/land1230/k2/verdicts.tsv:381) | механизм | правило | M12 с place_terrain/place_furniture или M39 для terrain/furniture; не M17/M15 |
| А | [C5431](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/land1230/k2/verdicts.tsv:385) | механизм | правило | M12 с place_terrain/place_furniture или M39 для terrain/furniture; не M17/M15 |
| А | [C5432](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/land1230/k2/verdicts.tsv:389) | механизм | правило | M12 с place_terrain/place_furniture или M39 для terrain/furniture; не M17/M15 |
| А | [C5443](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/land1230/k2/verdicts.tsv:393) | механизм | правило | M12 с place_terrain/place_furniture или M39 для terrain/furniture; не M17/M15 |
| А | [C5444](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/land1230/k2/verdicts.tsv:397) | механизм | правило | M12 с place_terrain/place_furniture или M39 для terrain/furniture; не M17/M15 |
| А | [C5445](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/land1230/k2/verdicts.tsv:401) | механизм | правило | M12 с place_terrain/place_furniture или M39 для terrain/furniture; не M17/M15 |
| А | [C5446](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/land1230/k2/verdicts.tsv:405) | механизм | правило | M12 с place_terrain/place_furniture или M39 для terrain/furniture; не M17/M15 |
| А | [C5447](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/land1230/k2/verdicts.tsv:409) | механизм | правило | M12/place_terrain или M39; не M17/M15 |
| А | [C5464](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/land1230/k2/verdicts.tsv:413) | механизм | правило | M12 с place_terrain/place_furniture или M39 для terrain/furniture; не M17/M15 |
| А | [C5468](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/land1230/k2/verdicts.tsv:417) | механизм | правило | M12 с place_terrain/place_furniture или M39 для terrain/furniture; не M17/M15 |
| А | [C5484](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/land1230/k2/verdicts.tsv:421) | механизм | правило | M12 с place_terrain/place_furniture или M39 для terrain/furniture; не M17/M15 |
| А | [C5524](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/land1230/k2/verdicts.tsv:425) | механизм | правило | M12 с place_terrain/place_furniture или M39 для terrain/furniture; не M17/M15 |
| А | [C5525](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/land1230/k2/verdicts.tsv:429) | механизм | правило | M12 с place_terrain/place_furniture или M39 для terrain/furniture; не M17/M15 |
| А | [C5531](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/land1230/k2/verdicts.tsv:433) | механизм | правило | M12 с place_terrain/place_furniture или M39 для terrain/furniture; не M17/M15 |
| А | [C5541](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/land1230/k2/verdicts.tsv:437) | механизм | правило | M12 с place_terrain/place_furniture или M39 для terrain/furniture; не M17/M15 |
| А | [C5542](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/land1230/k2/verdicts.tsv:441) | механизм | правило | M12 с place_terrain/place_furniture или M39 для terrain/furniture; не M17/M15 |
| А | [C5561](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/land1230/k2/verdicts.tsv:445) | механизм | правило | M12 с place_terrain/place_furniture или M39 для terrain/furniture; не M17/M15 |
| А | [C5584](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/land1230/k2/verdicts.tsv:448) | допустимость | правило | да для названного объекта; фильтр дикой генерации учитывать отдельно |
| А | [C5584](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/land1230/k2/verdicts.tsv:449) | механизм | правило | M12 с place_terrain/place_furniture или M39 для terrain/furniture; не M17/M15 |
| А | [C5613](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/land1230/k2/verdicts.tsv:453) | механизм | правило | M12 с place_terrain/place_furniture или M39 для terrain/furniture; не M17/M15 |
| А | [C5614](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/land1230/k2/verdicts.tsv:457) | механизм | правило | M12 с place_terrain/place_furniture или M39 для terrain/furniture; не M17/M15 |
| А | [C5615](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/land1230/k2/verdicts.tsv:461) | механизм | правило | M12 с place_terrain/place_furniture или M39 для terrain/furniture; не M17/M15 |
| А | [C5616](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/land1230/k2/verdicts.tsv:465) | механизм | правило | M12 с place_terrain/place_furniture или M39 для terrain/furniture; не M17/M15 |
| А | [C5642](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/land1230/k2/verdicts.tsv:469) | механизм | правило | M12 с place_terrain/place_furniture или M39 для terrain/furniture; не M17/M15 |
| А | [C5649](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/land1230/k2/verdicts.tsv:473) | механизм | правило | M12 с place_terrain/place_furniture или M39 для terrain/furniture; не M17/M15 |
| А | [C5673](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/land1230/k2/verdicts.tsv:477) | механизм | правило | M39/M41 или генерация terrain/furniture; не M17/M15 |
| А | [C5679](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/land1230/k2/verdicts.tsv:480) | допустимость | правило | да для названного объекта; фильтр дикой генерации учитывать отдельно |
| А | [C5679](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/land1230/k2/verdicts.tsv:481) | механизм | правило | M12 с place_terrain/place_furniture или M39 для terrain/furniture; не M17/M15 |
| А | [C5684](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/land1230/k2/verdicts.tsv:485) | механизм | правило | M12 с place_terrain/place_furniture или M39 для terrain/furniture; не M17/M15 |
| А | [C5718](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/land1230/k2/verdicts.tsv:489) | механизм | правило | M12 с place_terrain/place_furniture или M39 для terrain/furniture; не M17/M15 |
| А | [C5726](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/land1230/k2/verdicts.tsv:493) | механизм | правило | M12 с place_terrain/place_furniture или M39 для terrain/furniture; не M17/M15 |
| А | [C5738](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/land1230/k2/verdicts.tsv:497) | механизм | правило | M12 с place_terrain/place_furniture или M39 для terrain/furniture; не M17/M15 |
| А | [C5789](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/land1230/k2/verdicts.tsv:505) | механизм | правило | M12 с place_terrain/place_furniture или M39 для terrain/furniture; не M17/M15 |
| А | [C5822](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/land1230/k2/verdicts.tsv:509) | механизм | правило | M12 с place_terrain/place_furniture или M39 для terrain/furniture; не M17/M15 |
| А | [C5894](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/land1230/k2/verdicts.tsv:513) | механизм | правило | M12 с place_terrain/place_furniture или M39 для terrain/furniture; не M17/M15 |
| А | [C5951](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/land1230/k2/verdicts.tsv:517) | механизм | правило | M12 с place_terrain/place_furniture или M39 для terrain/furniture; не M17/M15 |
| А | [C6025](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/land1230/k2/verdicts.tsv:521) | механизм | правило | M12 с place_terrain/place_furniture или M39 для terrain/furniture; не M17/M15 |
| А | [C6045](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/land1230/k2/verdicts.tsv:525) | механизм | правило | M12 с place_terrain/place_furniture или M39 для terrain/furniture; не M17/M15 |
| А | [C6080](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/land1230/k2/verdicts.tsv:529) | механизм | правило | M12 с place_terrain/place_furniture или M39 для terrain/furniture; не M17/M15 |
| А | [C6087](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/land1230/k2/verdicts.tsv:533) | механизм | правило | M12 с place_terrain/place_furniture или M39 для terrain/furniture; не M17/M15 |
| А | [C6097](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/land1230/k2/verdicts.tsv:536) | допустимость | правило | да для названного объекта; фильтр дикой генерации учитывать отдельно |
| А | [C6097](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/land1230/k2/verdicts.tsv:537) | механизм | правило | M12 с place_terrain/place_furniture или M39 для terrain/furniture; не M17/M15 |
| А | [C6160](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/land1230/k2/verdicts.tsv:544) | допустимость | знание | да; историческая допустимость не равна надёжности этой ссылки |
| А | [C6266](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/land1230/k2/verdicts.tsv:568) | допустимость | знание | да; историческая допустимость не равна надёжности этой ссылки |
| А | [C6315](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/land1230/k2/verdicts.tsv:572) | допустимость | слияние названий | да для стога; f_hay (тюк) не отождествлять со стогом |
| А | [C6315](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/land1230/k2/verdicts.tsv:573) | механизм | правило | M12 с place_terrain/place_furniture или M39 для terrain/furniture; не M17/M15 |
| А | [C6318](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/land1230/k2/verdicts.tsv:574) | источник | слияние названий | исключить извлечение фамилии автора как элемента окружения; подтверждающего источника для элемента hayashi нет |
| А | [C6338](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/land1230/k2/verdicts.tsv:580) | допустимость | знание | да; историческая допустимость не равна надёжности этой ссылки |
| Б | [9](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/land1230/k2/pilot-verdicts.tsv:12) | ссылка | источник | wild-region.json:23–131 или отдельная ссылка 129–131 |
| Б | [20](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/land1230/k2/pilot-verdicts.tsv:16) | ссылка | источник | start.json:4 |
| Б | [60](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/land1230/k2/pilot-verdicts.tsv:72) | нет в CDDA | источник | родная мебель f_log_stack_short/mid/tall существует |
| В | [41](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/land1230/k2/metric-verdicts.tsv:4) | число | применение правила | 438,50 знака |
| В | [42](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/land1230/k2/metric-verdicts.tsv:6) | число | применение правила | 492,50 знака |
| В | [59](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/land1230/k2/metric-verdicts.tsv:28) | арифметика | применение правила | объединение 13,0–14,1%; 1,3–1,4 сцены с людьми на 10 |

## Систематические ошибки правил

| Правило | Строк выборки | Наблюдение |
|---|---:|---|
| `rules.md:66`, последняя ветвь §4 для прочего | 56 | M17/M15 назначены 49 terrain/furniture id, четырём живым животным, двум стоящим растениям и одному ландшафту. Эти механизмы размещают предметы, а не соответствующие объекты мира. Конкретные 49 id существуют; это ошибка выбора механизма, не отсутствующие id. |
| `rules.md:34`, применение §3.4 | 4 | C1854/C1955 имеют historical_confidence A, C3876/C4118 — B; model_only относится к price_model.numeric_confidence в k1/archive-rows.tsv:4792/2692/3781/2203. В каталог перенесено сомнение из оценки цены. |
| `rules.md:33`, перенос remove из фильтра CDDA в §3.3 | 4 | C5416, C5584, C5679 и C6097: отсутствие дикого лесного соответствия или исключение искусственного объекта из дикого генератора не означает исторического запрета груши в саду, очага или выкопанной ямы. |

Отдельно: C6315 смешивает стог с прессованным тюком f_hay; C0058 и C0091 получают сомнительно вопреки прямому анахронизму в том же архивном источнике. Девять поправок с причиной «знание» относятся к обычным местным объектам, а не к надёжности использованной литературной или черновой ссылки. Среди пяти ошибок пояса нет одного узкого правила с тремя одинаковыми сбоями: родентная группа — один случай, именной приоритет — один, ручные правила — два, общее слово воды — один.

## Пересмотр и историческая допустимость

Руководитель пересмотрел 77 отрицательных выводов помощников: подтвердил 74, снял 3. Каждое решение записано в journal.md. Сняты C3227/пояс (перепутаны правила «слово» и «имя»), C6198/источник (точный мост есть в конце строки) и Б:11/нет в CDDA (наличие родного типа не опровергает отсутствие его размещения в текущем мире у двора). В последнем случае проверка убрана из учёта как не утверждающая отсутствие родного типа.

Все 152 строки просмотрены на исторические и природные противоречия. Руководитель добавил 16 отрицательных вердиктов допустимости, три отрицательных вердикта пояса и отрицательный вердикт Б:60. После обязательной проверки диапазона отдельно проверены четыре поля C5447 вместо дубликата C2842. Добавленная арифметическая ошибка В:59 подтверждена расчётом пересечения типов.

Для индейки прямой архивный текст дополнительно согласуется с [исследованием Folger Shakespeare Library об американском происхождении птицы](https://www.folger.edu/blogs/shakespeare-and-beyond/turkey-journey-atlantic-early-modern-islamic-world/). Историческая допустимость солеваров согласуется с [аннотацией исследования Тороповой, Торопова и Самойлова о ранней Русе и солеварении](https://www.old.archeo.ru/izdaniya-1/zapiski-iimk/annotations/zapiski-iimk-ran.-vyp.-20.-spb-2019-g.-annotacii). Для груши использовано знание проверяющего; поисковый текст [статьи «Ягодные и плодовые растения в питании новгородцев», 2024](https://journals.rcsi.science/0869-6063/article/view/277271/ru_RU) также указывает на корни груши XI–XII вв., но полный оригинал этой статьи открыть не удалось.

## Итог плана пилота

83 вердикта: 77 ссылок, включая непроверяемую SQLite-запись, и 6 проверок отсутствия. В строке 36 отдельно учтены общее отсутствие полевой группы и точный id GROUP_FIELD. Две ссылки неверны: wild-region.json:23–128 не включает шанс river на строке 131, start.json:2 не содержит нужный id (он на строке 4). Утверждение строки 60 об отсутствии мебели поленницы неверно: есть f_log_stack_short/mid/tall с разбором на log. Отдельного зерна/семени ржи, зернового жнивья, GROUP_FIELD и отдельной настройки частоты деревень указанными запросами не найдено; запросы, корни поиска и разграничение похожих совпадений приведены в pilot-verdicts.tsv.

## Итог чисел меры

Авторские скрипты скопированы в tmp/n1-density.py и tmp/n1-baseline.py. Единственное отличие от оригиналов — OUT_DIR/OUT, перенесённые в K/tmp; входы и алгоритмы сохранены. Команды `python -B tmp/n1-density.py`, `python -B tmp/n1-baseline.py`, `python -B tmp/n1-calculations.py`; логи — tmp/n1-density-run.log, tmp/n1-baseline-run.log, tmp/n1-calculations.log. Воспроизведены 4598 записей, 192/92 записи пути, 169 прибытий, 193 описания природы; 11 примет визита, 10 пустых отрезков из 11, 0 ходов вне двора, 1 OMT, прежние количества выдумок 13 и 7.

Две медианы знаков должны быть 438,50 и 492,50, а не 438 и 492. В §4.3 сумма 4×5+1×5=25 верна. Ожидание людей рассчитано неверно как сумма долей толпы и занятия: в обоих срезах есть по одной записи с обоими типами. Объединение составляет 27/192=14,0625% и 12/92=13,0435%, то есть 1,3–1,4 сцены с людьми на десять. Дополнительный расчёт — tmp/root-union.py, результат tmp/root-union.log:1–2. Числа 632 прошедших хода и 633 представленных значений native_turn не противоречат друг другу.

## Обязательные проверки формы

`python -B tmp/check_verdicts.py` — PASS: 152 id, 608 уникальных пар id/проверка; ровно четыре разные проверки на каждый id; множество id совпадает с sample.tsv; заголовки трёх TSV дословно совпадают с заданием, каждая строка имеет пять полей; у всех неверно есть допустимая причина и доказательство, у верно причина пуста. Первый прогон выявил дубликат C2842 и пропуск C5447; после исправления полная проверка прошла. В таблице отчёта представлены все 95 отрицательных вердиктов. Цитат длиннее 200 знаков нет.

## Не проверено

- А, C3164, источник: ограничение: ссылка ведёт на SQLite economy#10, а разрешённый SSH доступ не позволяет открыть эту таблицу.
- А, C3164, пояс: ограничение: место или пояс нельзя сверить без исходного SQLite/архивного листа.
- А, C3164, допустимость: ограничение: источник допускаемости недоступен для проверки.
- А, C4483, источник: ограничение: ссылка указывает на лист Data:39 внутри tar.gz/XLSX, который нельзя открыть разрешёнными командами.
- А, C4483, пояс: ограничение: место или пояс нельзя сверить без исходного SQLite/архивного листа.
- А, C4483, допустимость: ограничение: источник допускаемости недоступен для проверки.
- А, C5673, источник: архив недоступен.
- А, C6164, источник: архив недоступен.
- А, C6216, источник: архив недоступен.
- А, C6318, допустимость: из источника извлечена фамилия автора, а не объект мира.
- А, C6342, источник: архив недоступен.
- А, C6374, источник: архив недоступен.
- А, C6432, источник: архив недоступен.
- Б, 8, ссылка: ограничение.
- В, 48, число: Источник перечисляет приметы, но не задаёт, считать ли ворота с проходом и людей со зверями отдельными приметами; итоговый диапазон не воспроизводится однозначно..
- В, 59, число: Это предложенные пороги пробы; скриптовые частоты не задают единственного правила выбора этих целей..
- В, 60, число: Это критерий будущей пробы, а не результат расчёта; baseline измеряет только текущий двор..
- В, 61, число: Нет исходной медианы судей для текущей пробы и сравнимого маршрута; baseline считает d10-строки, а не медиану судей..
- В, 67, число: baseline.py читает одну v31-plus/perception.jsonl и не подтверждает отсутствие других записей вне этого набора..
- В, 72, число: Это целевой порог будущей прогулки, baseline описывает только текущий визит во двор..
- В, 74, число: Это целевой порог; baseline.py подтверждает прежние количества d10, но не устанавливает правильность будущей нормы..
- В, 76, число: Скрипт выводит 16 только для вещей и мебели вне OMT; отдельно приводит 21 название местности вне OMT; полный прирост всех разделов этим числом не рассчитан..

В части А это восемь источников в SQLite/архивах, два пояса и три допустимости, включая фамилию Hayashi вместо элемента мира. В части Б — запись events#9. В части В пять строк относятся к предложенным нормативным порогам, которые не следуют однозначно из скриптов; три другие — неоднозначный подсчёт требования к прозе, отсутствие любых других записей прогулки и полный прирост примет без OMT-фильтра (16 относится лишь к вещам/мебели). Отсутствие научной проверки всей истории каждого вида не подменено утверждением о такой проверке: исторический просмотр выполнен в пределах знания проверяющего, как разрешает задание.

URL в столбцах источник выборки не было. MCP index_status/check_index_coverage отклонены средой с «requires approval, but approval policy is never»; графовые выводы не использовались, доказательства получены прямым чтением и rg. Полный оригинал упомянутой статьи о плодовых растениях не прочитан. Новых запусков игры и живой пробы не было по условиям задачи.

## Рабочие места

- K: итоговые verdicts.tsv, pilot-verdicts.tsv, metric-verdicts.tsv, report.md и journal.md — доказательства сдачи.
- K/tmp: копии авторских скриптов, их результаты и логи, результаты помощников и проверочные скрипты — промежуточные материалы и доказательства воспроизведения. Сохранены до приёмки. Размер du -sh приведён в DONE.

## Находки вне требуемых буквальных проверок

- W/pilot-plan.md:30: для снопов и суслонов предлагается новая мебель от f_hay, хотя CS/data/json/furniture_and_terrain/furniture-domestic_plants.json:402–403 задаёт f_stook_full / grain stook, а :417–419 — f_stook_empty. Это выбор реализации, а не ошибка буквальной ссылки на f_hay; требуется рассмотреть родной механизм до добавления мебели.

## Для ведущего

- Получены независимые вердикты и перечень значений для исправления; проверяемые файлы не редактировались.
- Не выполнены проверки, перечисленные в разделе «Не проверено»; вся задача не расширялась до проверки полного каталога или реализации пилота.
- Нужно принять или вернуть DONE; исправление исходных данных и решений правил остаётся у автора каталога.
