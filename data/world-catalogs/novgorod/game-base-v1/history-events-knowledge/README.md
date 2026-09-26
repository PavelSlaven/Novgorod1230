# history-events-knowledge — события 1230–1250, исторические лица, слухи и знание, внешние отношения

Коллектор: `collect-history-events-knowledge`. Статус группы: **candidate во всех четырёх доменах** — ни одна
строка не утверждена самостоятельно (WR §21.1); утверждение — отдельный проход старшей модели/владельца.

Бриф коллектора: `scratchpad/gb-retry/history-events-knowledge.json` (прочитан целиком перед началом сборки).

## Домены

| Папка | Домен(ы) брифа | Приоритет брифа | Статус |
|---|---|---|---|
| `historical_events/` | `historical_events` | M3 | 35 событий / 175 фаз из черновика LLM (rus13tpl timeline v1), пересобраны скриптом; исправлено 2026-09-26 (было `rework`, см. `historical_events/VERIFICATION.md`) — 25 фаз (5 событий, 14%) подтверждены постраничными книжными свидетельствами группы (confidence B, было — неверными ссылками по ключевым словам на sqlite), остальные 150 — confidence C (не сверены построчно с текстом НПЛ в этом проходе, см. «Что НЕ сделано»); восстановлены `summary`/`historical_context`/`market_goods_affected`/`needs_review` |
| `historical_figures/` | `historical_figures` | M3 | 23 лица (было 21, исправлено 2026-09-26, было `rework` — см. `historical_figures/VERIFICATION.md`): 14 из sqlite `persons_1230` (confidence A, летописно засвидетельствованы, 6 окон должностей скорректированы книжными свидетельствами) + 7 из черновика `novgorod_key_npc_seeds_v1` (confidence C/D, включая один флаг конфликта дат; анахронизм Биргера и окно Батыя исправлены) + 2 добавлены из книжных свидетельств (тысяцкий Борис, архиепископ Антоний, confidence B) |
| `knowledge_rumors/` | `knowledge_rumors` | M3 | 105 строк: 53 шаблона слухов + 27 профилей знания (общее+дорожное) + 8 строк грамотности по роли (исследование) + 17 жанровых пулов берестяных грамот (sqlite, confidence A) |
| `polities_external_relations/` | `polities_external_relations` (не было в каталоге — заявлено критиком брифа) | M3 | 26 строк: 6 региональных периферий (draft), 10 даннических зон (sqlite territories), Псков отдельно, 9 внешних держав/акторов, включая 4 подтверждённых веб-поиском (Ливонский орден 1237, монгольское нашествие 1237–1238, Невская битва 1240, вел. кн. Ярослав 1238–1246) |

Итого новых строк: **35 + 175 + 23 + 105 + 26 = 364** (было 362 с 21 лицом до исправлений 2026-09-26;
прежняя версия README называла сумму 397 — арифметическая ошибка, не связанная с проходом 2026-09-26,
исправлена здесь заодно; без учёта отдельного `rejected_report.json`, который пуст —
жёстких отказов нет, см. `historical_events/README.md`), во всех — `source_refs` и `confidence`, посчитано скриптами.

## Что НЕ сделано (сознательно, не потеряно — см. README каждого домена)

- **Построчный аудит всех 175 черновых фаз `historical_events` по тексту НПЛ не выполнен** — только 25 фаз
  (5 событий) сверены построчно с конкретными записями книжных свидетельств группы (`servak`
  `history-events-knowledge.csv`); до исправлений 2026-09-26 эти же 25 фаз были помечены `confidence=B` по
  более слабому критерию (совпадение года и ключевого слова с sqlite `novgorod_1230(1).events`), из-за чего
  3 из 5 событий ссылались на не относящиеся к ним записи sqlite (см. `historical_events/VERIFICATION.md`).
  Полный перевод/сверка церковнославянского текста НПЛ по всем 175 фазам (файлы, на которые раньше ссылался
  этот README, уже удалены из scratchpad) не входила в бюджет прохода 2026-09-26 — это главный оставшийся
  разрыв: 150 фаз (30 событий) остаются `confidence=C`.
- **`node_refs_v6 → node_refs_v17` не переведены.** Черновик привязан к графу v6 (`gn_nov_g1_...`); мэппинг на
  ~11 тыс. узлов v17 (G2–G4) требует владельца spatial/place_names и отдельного прохода — вне бюджета и
  полномочий этого коллектора. Поле `node_refs_v17` во всех 175 строках оставлено пустым, а не выдумано;
  `node_refs_v6` сохранён как есть.
- **`historical_figures`: конфликт дат «Михаил Степанич».** Черновик `novgorod_key_npc_seeds_v1` даёт
  посадника «Михаил Степанич» на 1230–1250, что перекрывает засвидетельствованных летописью Внезда Водовика и
  Степана Твердиславича на те же годы (sqlite, confidence A). Строка оставлена с `status=candidate-conflict`,
  `confidence=D` и явной пометкой — не удалена и не тихо исправлена (см. `historical_figures/README.md`).
- **`polities_external_relations`: два несведённых слоя одной сущности.** Регионы `pskov_land`, `belozero_land`,
  `karelian_land`, `zavolochye_land` присутствуют одновременно как строки из черновика rus13tpl
  (`po_region_*`) и как строки из sqlite `territories` (`po_periphery_*` / `po_pskov_land`). Слияние в один
  канонический ряд требует решения владельца о приоритете источников — не выполнено самостоятельно.
- **Дания (Эстляндия) и Любек** включены по прямому требованию брифа, но без сфокусированного исследования —
  помечены `confidence D`/`C` с явным `ПРОБЕЛ:` в `source_refs`, а не заполнены правдоподобной, но
  неподтверждённой информацией.
- Полная сверка `historical_events`/`polities_external_relations` между собой на предмет противоречий по
  датам (требование acceptance для `polities_external_relations`) выполнена только выборочно (Ярослав,
  монгольское нашествие, Невская битва); систематический скрипт cross-check между всеми 4 доменами не написан.

## Источники, использованные в этом проходе

- `data/rus13-base-staging/nov_region_audit/novgorod_historical_timeline_1230_1250_v1.json` (draft LLM, v6-граф)
- `data/rus13-base-staging/nov_region_audit/novgorod_status_rules_v1.json` (`historical_key_npc_profiles`, draft)
- `data/rus13-base-staging/nov_region_audit/novgorod_rumor_templates_v1.json`,
  `novgorod_common_knowledge_v1.json`, `novgorod_route_knowledge_rules_v1.json` (draft)
- `data/rus13-base-staging/nov_region_audit/novgorod_neighbor_regions_v1.json` (draft, 6 региональных периферий)
- `C:/Users/Slaven/Downloads/novgorod_1230(1) (1).sqlite` — курированная база с кодами A–D и 30 источниками
  (S01 = НПЛ, Насонов 1950/Michell&Forbes 1914; S02 = договор 1191–1192 с Готским берегом; S05 = gramoty.ru).
  Не была упомянута в каталоге ранее (см. критику брифа) — теперь процитирована во всех четырёх доменах.
- НПЛ, скачанные страницы izbornik.org.ua (старший извод 1219–1318, младший извод 1220–1257) —
  `scratchpad/gb-collect-history-events-knowledge/novg{06,07,08,23,24,25}.txt` — использованы для проверки
  годового покрытия источника; построчный аудит фаз по ним не завершён (см. выше).
- Веб-поиск (2026-09-26, 4 запроса) для настоящих разрывов внешнеполитического домена: формирование
  Ливонского ордена (май 1237), княжение Ярослава Всеволодовича в Новгороде (1231–1236) и во Владимире
  (1238–1246), ход монгольского нашествия 1237–1238 (взятие Торжка 5 марта 1238, поворот у Игнач-креста),
  спор об авторстве шведского похода 1240 г. (Биргер/Ульф Фасе). Источники указаны построчно в
  `polities_external_relations.csv`.

## Как пересобрать всё

```
node historical_events/scripts/build_events.cjs <timeline.json> <sqlite_dump.json> historical_events/
node historical_events/scripts/validate_events.cjs historical_events/
node historical_figures/scripts/build_figures.cjs <sqlite_dump.json> <status_rules.json> historical_figures/
node historical_figures/scripts/validate_figures.cjs historical_figures/
node knowledge_rumors/scripts/build_knowledge.js <rumor_templates.json> <common_knowledge.json> <route_knowledge_rules.json> <sqlite_dump.json> knowledge_rumors/
node knowledge_rumors/scripts/validate_knowledge.js knowledge_rumors/
node polities_external_relations/scripts/build_polities.js <neighbor_regions.json> <sqlite_dump.json> polities_external_relations/
```
`historical_events` и `historical_figures` — скрипты `.cjs` (переименованы 2026-09-26: корневой
`package.json` задаёт `"type": "module"`, а эти скрипты используют `require()`, что раньше делало команды
из этого README невоспроизводимыми — `ReferenceError: require is not defined`). `knowledge_rumors` и
`polities_external_relations` не входили в проход исправлений 2026-09-26 — их скрипты не переименованы;
если у них такая же проблема воспроизводимости, это отдельная задача для владельца тех доменов.

Все скрипты только читают исходные JSON/sqlite-дампы (пути передаются аргументами) и пишут внутри своей папки.
`sqlite_dump.json` — построчный экспорт `C:/Users/Slaven/Downloads/novgorod_1230(1) (1).sqlite` через
`sqlite3`/python (см. `historical_figures/README.md` за точной командой экспорта).
