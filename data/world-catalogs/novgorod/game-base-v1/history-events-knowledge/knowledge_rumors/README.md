# knowledge_rumors — знание, слухи, грамотность

Домен брифа `knowledge_rumors`, приоритет M3. Статус: **candidate**, не утверждено.

## Что это

`knowledge_rumors.csv` (105 строк), поле `kind` различает четыре подтипа, как того требует бриф:

| kind | строк | источник |
|---|---|---|
| `rumor` | 53 | `rus13tpl novgorod_rumor_templates_v1.json` (draft) — шаблоны слухов: тема, кто разносит, где слышно, варианты правдивости, что запрещено раскрывать |
| `knowledge_profile` | 27 | `novgorod_common_knowledge_v1.json` (16 профилей знания по соц. группе) + `novgorod_route_knowledge_rules_v1.json` (11 профилей дорожного знания по соц. группе), оба draft |
| `literacy` | 8 | **исследование этого прохода** (нет готового датасета в каталоге) — грамотность по 8 ролям |
| `letter_genre` | 17 | `sqlite novgorod_1230(1).birchbark_selection` (19 датированных грамот, confidence A, источник S05 = gramoty.ru), сгруппированы по полю `theme` в 17 жанровых пулов |

## Метод

`scripts/build_knowledge.js` читает все четыре источника и пишет единую таблицу с общими полями брифа
(`kn_id, kind, role_refs, topic, event_ref, carrier_rule, distortion_rule, text_pool_ref, source_refs,
confidence, status`).

- `rumor`: `event_ref` = `generic_class:<rumor_type>` (у черновика rumor_templates нет привязки к конкретному
  историческому событию — только к типу; это и есть «явный generic-класс», разрешённый acceptance-критерием
  брифа). `text_pool_ref` хранит сами `typical_text_patterns` черновика (короткие фразы-образцы, не полный
  текст источника — авторское право не затронуто).
- `knowledge_profile`: по одной строке на социальную группу из каждого из двух draft-файлов (не слиты в одну
  запись на группу — общее знание и дорожное знание описаны раздельно в исходниках, слияние не сделано
  самостоятельно).
- `literacy`: **не механическая выборка**, а короткая содержательная сводка по 8 ролям, основанная на
  контексте берестяного корпуса, уже процитированного в sqlite (`S05` gramoty.ru, `S06` RNC birchbark corpus,
  `S20`) и на общеизвестном научном консенсусе о новгородской грамотности (работы А. А. Зализняка и
  В. Л. Янина о новгородском диалекте и берестяных грамотах, включая учебные грамоты мальчика Онфима) —
  без постраничной цитаты конкретного издания в этом проходе, поэтому `confidence=B`, а не A.
- `letter_genre`: тема (`theme`) берестяной грамоты из sqlite становится жанровым пулом; `carrier_rule`
  перечисляет номера и датировки конкретных грамот (примеры), `text_pool_ref` указывает условный путь
  `item_text_pools:birchbark:<тема>` для стыка с доменом D9 (не создаёт саму таблицу `item_text_pools` —
  только ссылку на будущий ключ).

## Проверка (`scripts/validate_knowledge.js`)

- 105/105 строк.
- 0 строк `rumor` без `event_ref`/generic-класса.
- 0 строк `letter_genre` без `text_pool_ref`.
- Резолвинг `role_refs` в реальные роли occupations TSV не проверен отдельным скриптом в этом проходе (роли
  черновика `common_knowledge`/`route_knowledge_rules` используют свои `social_group_id`, не `occupation_id`
  из `novgorod_occupations_v1.tsv` — это два разных словаря ролей, стык не построен, см. ограничения).

## Известные ограничения

- **Словарь ролей не единый.** `rumor_templates.who_spreads` — свободный текст («купцы», «возчики» и т. п.),
  `common_knowledge`/`route_knowledge_rules` используют `social_group_id` (`group_local_commoners` и т. п.),
  а `novgorod_occupations_v1.tsv` — `occupation_id` с полями `typical_rumors_known` и т. п. Эти три словаря
  ролей не сведены в один в этом проходе — occupations TSV не был использован как источник строк, хотя в
  брифе он упомянут («occupations TSV typical_rumors_known/typical_*_knowledge»); интеграция с ним — реальный
  оставшийся разрыв, а не забытый пункт.
- Литературные жанры берестяных грамот сведены только по 19 документам одной выборки (sqlite); полный
  корпус gramoty.ru (тысячи документов) не запрашивался — 17 пулов покрывают только темы, встретившиеся в
  этой выборке 1220–1240 гг.
- `deferred_event_templates` (41, draft) — не включён в этот домен: по внимательному чтению это шаблоны
  отложенных сценовых событий (npc_leaves и т. п.), а не слухи/знание/грамотность; не подошёл ни под одно
  `kind` брифа, поэтому не притянут искусственно.

## Пересборка

```
node scripts/build_knowledge.js <novgorod_rumor_templates_v1.json> <novgorod_common_knowledge_v1.json> \
  <novgorod_route_knowledge_rules_v1.json> <sqlite_dump.json> .
node scripts/validate_knowledge.js .
```
