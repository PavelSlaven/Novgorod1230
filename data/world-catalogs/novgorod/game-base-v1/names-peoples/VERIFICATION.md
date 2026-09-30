# names-peoples — independent verification

- Who: verifier agent (label `verify-names-peoples`), an independent senior pass. I am not the collector (`collect-names-peoples`).
- When: 2026-09-26.
- What: every file in `data/world-catalogs/novgorod/game-base-v1/names-peoples/`:
  - `personal_names/personal_names.csv`, `personal_names/coverage-report.json`, `personal_names/README.md`
  - `place_names/place_names.csv`, `place_names/README.md`
  - `peoples_origins/peoples_origins.csv`, `peoples_origins/README.md`
  - `README.md` and `scripts/*.mjs`
- Data files were not edited. Checks were run by one-off node scripts kept in the verifier scratch folder, which was deleted afterwards.

## Deterministic checks (all files)

| File | Rows (script) | README says | Column-count errors | Empty source_refs | Empty confidence | Confidence values | Duplicate ids | Duplicate natural key |
|---|---|---|---|---|---|---|---|---|
| personal_names.csv | 54 | 54 | 0 | 0 | 0 | A:54 | 0 | 0 (name_form, sex, people) |
| place_names.csv | 911 | 911 | 0 | 0 | 0 | C:878, B:33 | 0 | 0 (node_ref, kind, name) |
| peoples_origins.csv | 16 | 16 | 0 | 0 | 0 | A:3, B:3, **"A–B":2**, C:8 | 0 | 0 |

- place_names matches the v6 register TSV 1:1. I compared all 911 rows by name and `region_cell_code` and found 0 mismatches. The row counter in `source_refs` (`#cell:n`) is the data-row index, and it is correct.
- peoples_origins matches its sources 1:1: `foreigner_profiles.csv` FG001–FG010 and `novgorod_neighbor_regions_v1.json` (6 regions).
- personal_names matches `candidate.json` `names[]` 1:1 (54 rows). Every `source_id` exists in `source-records.json`.
- None of the files contains quotations longer than one sentence. The group used no book text.

## Sample checked against cited sources (37 rows)

- **personal_names, 21 rows, checked against primary or scholarly sources.**
  - Гр. №729 (gramoty.ru, dated 1160–1180 by convention): Иван, Кирилл (Кюрил), Жирко (Жирок), Филипп, Дмитр and Жиадок (Жѧдокъ) are present. That is 6 of 6.
  - Гр. №334 (dated 1220–1240): Мирослав, Ратмир, Федот and Драч are present. 4 of 4.
  - Гр. №1091 (dated 1180–1200): Фома, Яким and Микула are present. 3 of 3.
  - Чайкина 2006 (Вопросы ономастики №3, pp. 33–37; I extracted the PDF text and searched it): Яна, Маремьяна, Мирофа, Граврия, Олисава, Харитония, Ириния and Передслава (гр. №328) are present, and so are Миляна (№541) and Нежка (№644). 8 of 8 plus 2 more.
  - The НПЛ 1230 names (Иванко Тимощинич, Спиридон, Ростислав, Стефан, Прокша, Волос) could not be re-fetched: litopys.org.ua failed its TLS check. They agree with the well-known annal entries for 6738 and 6739, and the remote book evidence (`names-peoples.csv`) independently lists Иванко Тимощинич, Спиридон and Волос Блудкинич.
  - Result: no fabricated names and no wrong attributions.
- **place_names, 16 rows** (ids 1, 58, 141, 223, 302, 335, 386, 397, 429, 526, 601, 689, 778, 834, 861, 911). Each row agrees with its register row. The C rows are marked in the source itself as "historically plausible construct, not a source fact". The B rows are marked `source_backed_anchor` or `source_backed_functional_anchor`.
- **peoples_origins, all 16 rows.** Every row agrees with its source row. The group-level notes are below.

## Verdicts

### `personal_names/personal_names.csv` — approve_with_limits

The 54 rows are real and correctly attributed. They can be used as a Novgorod-Rus name pool once these limits are fixed or accepted:

1. **Confidence is overstated for the 34 female names (A2 → A).**
   - Their only source is Чайкина 2006. That is a scholarly secondary survey covering the 11th–14th centuries, and `valid_from/valid_to` is 1100–1400. By the group rule (A = primary, B = scholarly secondary), these rows are B.
   - They could stay A only if they cited the exact gramota and its dating, which the article gives for some names: Передслава №328, Миляна №541, Нежка №644.
   - Some of these calendar names may be attested only in 14th-century gramoty, so they are not proven for 1230.
2. **`frequency_class` holds pool ids, not frequency classes** (`russian_common_male`, `dynastic_male`, and so on). The column name is wrong. The source's own weight policy is "editorial equal weight 1; corpus counts are not weights", so the frequency class should be empty or `equal_editorial`, with pool membership in a separate column.
3. `valid_from` and `valid_to` were dropped from the source. They are needed to filter for 1230. For example, the gramota №729 names date from 1160–1180.
4. `people_ref = novgorod_rus` has no matching row in `peoples_origins.csv`, so the cross-reference is broken.
5. `name_kind` is a placeholder (`baptismal_or_vernacular`). The README admits this, but the brief requires a baptismal/vernacular/nickname split. Vernacular names such as Жирко, Драч, Прокша, Волос, Нежка and Миляна can be separated deterministically from the Chaykina classification.
6. One source record id mixes alphabets: `npl/1230/ivanко` has a Latin prefix and a Cyrillic ending. It is inherited from the source and is cosmetic.

### `personal_names/coverage-report.json` — approve

It is correct. It lists all **9** excluded names: Rolf, Ольга, Елена, Мстислав (Георгий), Ростислав (Михаил), Марена, Милуша, Милослава and Онцифор.

### `personal_names/README.md` and the group `README.md` — rework (text errors)

- The README says "excluded: 1 name (Rolf)". It is **9**; see coverage-report.json.
- The README says pool membership comes from `novgorod_npc_name_pools_v1.json`. That is false:
  - The script reads `npcPools.pools_by_id || npcPools.pools`, and neither key exists in that file, so the file contributes nothing.
  - Every pool value comes from `candidate.pools`.
  - This is the correct outcome, because the candidate's `AUDIT_CORRECTIONS.md` and `approval-request.json` name that file as a `forbidden_promotion_source`. The README and the script comment should say so, and the dead read should be removed.
- The README says "only 1 excluded Scandinavian candidate name exists network-wide" and "`baltic_west_contextual` is empty".
  - The `baltic_west_contextual` pool is indeed empty.
  - However, `candidate.contextual_authoring_only` holds 6 B1 names that are neither mentioned nor exported: Гюлопа (Turkic), Иголанд (Finnic), and Hæil(h)vatr, Regenbode, Dethard and Adam (Baltic-West). These are the only existing non-Slavic seeds.
- The group README says the domain was "cross-joined with rus13tpl pools". That is false for the same reason.

### `place_names/place_names.csv` — approve_with_limits

The transfer is faithful and there are no fabrications: every C name is declared fictional-historicized by its source. Limits:

1. **`name_status` does not use the brief's enum** (`attested|reconstructed`); it copies the v6 values. The B band mixes two different things:
   - Well-attested anchors: Новгород, Руса, Торжок, Неревский, Людин, Загородский, Славенский and Плотницкий концы, Юрьев монастырь, Рюриково городище, Ярославово дворище, Хутынь. These are attested in chronicles and could be A with a chronicle ref.
   - Purely functional labels: «Двор власти в Новгороде», «Новгородская лодейная площадка», «Судный двор у Торга». These are not toponyms.

   The only source_ref for the B rows is the v6 game register. No primary attestation is cited.
2. `name_ru` embeds the functional suffix («Березье: охотничий стан»). For prose and for the brief's uniqueness rule, the toponym and the object kind should be split.
3. There is a technical artifact in a name: `pn_v6_0262` «Нижний Починок у Ильменя: село (участок 02_04)» is the same cell, kind and base name as `pn_v6_0258`. The only thing telling them apart is a grid label that would leak into prose.
4. **Anachronism risk, flagged but not proven, confidence already C:**
   - «слобода» in «Плотницкая слобода» and «Гончарная слобода Людина конца» (both B rows).
   - «Починок» as a settlement term.

   The B-rated «слобода» names should get a dating check or be downgraded to C.
5. The known gaps are acknowledged: `node_ref` is a v6 cell rather than a v17 node, so the brief's "node_ref exists" check cannot run; `first_attestation` is empty; there is no dedup against rus13 `graph_nodes`.
6. The collector skipped the remote book evidence. `names-peoples.csv` on servak (283 verified rows, 1 rejected) has **21 `place_names,dating` rows** plus concrete street, weir and pogost names (Щитная улица, Ополецкий погост, Селигер, Загородье, …). These directly fill `first_attestation` and the attested anchors.

### `peoples_origins/peoples_origins.csv` — rework

The rows copy their sources correctly, but the table does not meet the brief's shape or the group rules:

1. **Confidence `A–B` on `pp_fg005` and `pp_fg008` is not a valid value.** It must be A, B or C; the rule is to take the lower value, B.
2. `endonym`, `languages` and `faith` are **empty in all 16 rows**. `legal_status_ref` and `name_pool_ref` are `unassigned` everywhere. These are the core fields of the brief.
3. `pf_ids` is misused: it holds costume group ids (FG001…) instead of place_family ids. For the six neighbour rows, `presence_note` holds route directions, not presence.
4. **Category error:** the six rows from `novgorod_neighbor_regions_v1` are *lands*, not *peoples*. The draft source also treats Ладога/Ижора and Заволочье, which were parts of the Novgorod land in 1230, as "neighbour lands". The umbrella rows FG004 and FG005 bundle эсты/чудь, ливы, водь, ижора and корела into one row each.
5. **5 of the 13 brief-named peoples are missing**: новгородцы, смоляне, чудь/эсты, весь and емь/сумь. The missing новгородцы row breaks `personal_names.people_ref = novgorod_rus`.
6. **Available verified sources were not used.**
   - Remote `names-peoples.csv` has 64 `peoples_origins` rows (presence, event, description, name_form, social_rule, custom). 72 rows mention весь/вепсы, емь/сумь, чудь, смоляне, ижора, водь or корела. They include Veps noble names and nicknames usable for the empty Finnic name pools.
   - The costume source's own `source_ids` (SRC028, …) were not carried into `source_refs`.

   The README calls these gaps "need new research", but most of that research already exists.

## Summary of required actions (collector, next pass)

1. peoples_origins: add rows for новгородцы, смоляне, чудь/эсты, весь, емь/сумь, ижора, водь and корела, with language, faith and endonym, using the book evidence and the WK claims. Fix `A–B`, and fix the `pf_ids` and neighbour-land semantics.
2. personal_names:
   - Downgrade the Чайкина-only rows to B, or cite the exact gramota.
   - Rename or fill `frequency_class` correctly and add `valid_from/valid_to`.
   - Export or list the 6 contextual B1 names.
   - Add the 70 `name_form` and 11 `social_rule` rows from the book evidence (patronymics, "жена по мужу" naming, Veps names).
3. place_names: split the toponym from the kind, remove the grid-label distinguisher, map the B anchors to chronicle attestations and fill `first_attestation` from the 21 book-evidence dating rows, and check «слобода».
4. READMEs: correct the excluded count (9) and the false claims about npc_name_pools and Baltic names.

No row in the group is fabricated. The problems are overstated confidence, mislabelled or empty fields, and existing evidence that was not used.

## Исправления 2026-09-26

Исполнитель: fixer-агент (fix-names-peoples), отдельный проход по итогам верификации выше. Правился только `peoples_origins/peoples_origins.csv` (и его `README.md`/build-скрипт), `personal_names/README.md` и групповой `README.md` — по одноимённым вердиктам `rework` выше. `personal_names/personal_names.csv`, `coverage-report.json` и весь `place_names/` не трогались (approve/approve_with_limits, не rework). Скрипт `scripts/build-peoples-origins.mjs` перезапущен, `peoples_origins.csv` пересобран детерминированно (23 строки, 0 дублей id, 0 невалидных confidence, 0 пустых `source_refs` — проверено одноразовым скриптом в scratch).

### `peoples_origins/peoples_origins.csv` и `peoples_origins/README.md`

1. **`A–B`** (`pp_fg005`, `pp_fg008`) заменено на **`B`** (правило группы: комбинированная оценка берёт худшую); в скрипте добавлена детерминированная нормализация `normalizeConfidence()`, а не ручная правка значений.
2. **`pf_ids`** очищен для всех 10 `guest_itinerant`-строк (раньше там дублировался costume group id, а не place_family id — неверная, а не отсутствующая ссылка). Реальных place_family id для этих групп нет, поэтому поле оставлено пустым, а не заполнено произвольно.
3. Добавлена колонка **`entity_kind`** (`guest_itinerant` / `neighbor_land` / `people`) — прямое исправление категориальной ошибки («шесть соседних-земельных строк — это земли, а не народы»).
4. Добавлено **7 отдельных строк `people`**, все с `source_refs` на верифицированный remote book evidence (`book:<id> §<section_path> ¶<para_no>`, домен `peoples_origins`), confidence `B` (все цитаты — научно-вторичный источник, не первичная запись): новгородцы (`pp_novgorod_rus`, ключ выбран специально, чтобы `personal_names.people_ref = novgorod_rus` разрешался в реальную строку), водь (`pp_vod`), ижора (`pp_izhora`), корела (`pp_korela`), весь (`pp_ves`), чудь/эсты (`pp_chud_est` — бандлит эстонскую чудь и заволочскую чудь как один брифовый народ, а не разные брифовые народы), емь/сумь (`pp_yem_sum`).
5. **Смоляне не добавлены** — источника не нашлось ни в remote book evidence, ни в других read-only источниках этого прохода. Строка не создана; пробел явно зафиксирован в `peoples_origins/README.md` (раздел «Gaps») как реальный, не закрытый.
6. Собственные `source_ids` костюмного источника (`SRC013`, `SRC035`, …) теперь попадают в `source_refs` для всех 10 `guest_itinerant`-строк.
7. `peoples_origins/README.md` переписан: новые счётчики (23 строки), таблица покрытия брифовых народов обновлена, добавлен раздел «Fixed this pass», список источников дополнен remote book evidence.

### `personal_names/README.md`

1. «excluded: 1 name (Rolf)» исправлено на **9 names** (полный список из `coverage-report.json.excluded_pending_review`: Rolf, Ольга, Елена, Мстислав (Георгий), Ростислав (Михаил, rejected), Марена (rejected), Милуша (rejected), Милослава (rejected), Онцифор).
2. Ложное утверждение «pool membership comes from `novgorod_npc_name_pools_v1.json`» заменено на факт, подтверждённый чтением скрипта и файла: скрипт ищет `npcPools.pools_by_id || npcPools.pools`, этих ключей в файле нет (реальные ключи — `male_name_pool`/`female_name_pool`/…), поэтому lookup всегда пуст; вся принадлежность к пулам идёт из `candidate.pools`. Указано, что `novgorod_npc_name_pools_v1.json` — задекларированный `forbidden_promotion_source` (`approval-request.json`).
3. «only 1 excluded Scandinavian candidate name exists network-wide» дополнено: в `candidate.contextual_authoring_only` есть ещё 6 сидов B1 (Гюлопа, Иголанд, Hæil(h)vatr, Regenbode, Dethard, Adam), не экспортированных ни в один пул — они названы явно.

### `README.md` (группа)

1. Ложное «cross-joined with rus13tpl pools» для `personal_names` заменено ссылкой на реальное поведение скрипта (см. выше) и на `forbidden_promotion_source`.
2. Счётчик `peoples_origins/` обновлён с 16 на 23 строки, добавлен список 7 новых народов.
3. Уточнено, что remote book evidence прогнан только для `peoples_origins` в этом проходе; `personal_names` и `place_names` — реальный, зафиксированный пробел на будущее.

### Проверки, фактически выполненные

- Одноразовый Python-скрипт в scratch (`.../scratchpad/gb-fix-names-peoples/`, удалён после задачи) — подсчёт строк, колонок, дублей id, валидности confidence, пустых `source_refs` в пересобранном `peoples_origins.csv`.
- `node scripts/build-peoples-origins.mjs` запущен и завершился без ошибок (вывод: `23 rows`, `смоляне — real gap`).
- Цитаты book evidence сверены построчно с `ssh servak "cat /srv/novgorod-work/data/books/evidence/names-peoples.csv"` (283 строки, читано напрямую, не по памяти).
- `git status` по каталогу `names-peoples/` — изменены только перечисленные файлы; `personal_names.csv`, `coverage-report.json`, весь `place_names/` не тронуты.

### Что не исправлено (реальные ограничения)

- Смоляне — нет источника, строка не создана (см. выше).
- `personal_names.csv` не переработан в этом проходе (не входил в rework-вердикт): confidence-overstatement для 34 женских имён (Чайкина 2006, A→B), `frequency_class`/`valid_from`/`valid_to`/`name_kind` — как описано в вердикте `approve_with_limits` выше, остаются на следующий проход по этому файлу.
- `place_names.csv` не переработан (не входил в rework-вердикт): разделение toponym/kind, `first_attestation` из 21 book-evidence dating строки, проверка «слобода» — как описано в вердикте `approve_with_limits` выше.
- Для новых 7 `people`-строк `endonym`/`languages`/`faith` заполнены только там, где нашлась прямая цитата в remote book evidence; там, где цитаты не было (например `faith` для водь/корелы/веси/новгородцев), поле оставлено пустым, а не выдумано — это реальный, а не скрытый пробел.

## Повторная проверка 2026-09-26

Проверяющий: независимый re-checker (старший проход, не fixer). Данные не правились. Проверки — одноразовыми python/node-скриптами в scratch (`gb-recheck-names-peoples/`), удалены после задачи.

### Что фактически выполнено

- Пересчёт `peoples_origins.csv` скриптом: 23 строки, 14 колонок, 0 строк с неверным числом колонок, 0 дублей `pp_id`, 0 пустых `source_refs`, confidence A:3 / B:12 / C:8 (невалидных нет), `entity_kind` guest_itinerant:10 / neighbor_land:6 / people:7, `pf_ids` пуст во всех 23.
- Копия `scripts/build-peoples-origins.mjs` запущена в scratch: результат **байт-в-байт совпадает** с `peoples_origins.csv`.
- 10 строк `guest_itinerant` сверены скриптом с `costume-dataset-v1/data/foreigner_profiles.csv`: name/who/presence_basis/source_ids совпадают 10/10; `A–B` → `B` для FG005, FG008.
- Все 7 строк `people` (все, их меньше 15) сверены: 29 ссылок `book:<id> §<section> ¶<para>` — 29/29 точно находятся в `servak:.../evidence/names-peoples.csv` (283 строки), содержание строк соответствует `value`/`quote`. Выдуманных фактов нет, анахронизмов в утверждениях о 1230 г. не найдено.
- README: утверждения проверены против `candidate.json`, `coverage-report.json`, `novgorod_npc_name_pools_v1.json`, `approval-request.json` (ключи пулов, 9 исключённых имён, 6 `contextual_authoring_only`, `forbidden_promotion_source`) — подтверждены.
- `personal_names.people_ref = novgorod_rus` (54/54) разрешается в `pp_novgorod_rus` по конвенции префикса `pp_`.

### `peoples_origins/peoples_origins.csv` — rework (узкий)

Исправлено: `A–B`; `pf_ids`; категориальная ошибка (колонка `entity_kind`); `source_ids` костюмного источника; добавлены водь, ижора, корела, весь, чудь/эсты, емь/сумь, новгородцы. Осталось или внесено этим проходом:

1. **Нарушение правила confidence.** `pp_novgorod_rus` = B, но единственный источник (`book:624953 ¶1396`) в evidence имеет `period = medieval_general` → по правилу группы максимум C. Кроме того, «автохтонное» в `presence_note` противоречит тексту источника о западных корнях первонасельников, а гипотеза Янина подана как факт.
2. **Смоляне: утверждение «источника нет» неверно.** Fixer искал только в `names-peoples.csv`. В локальном `sources/books-evidence-v1/` есть строки c1230/B: `economy-trade-measures` book 301539 ¶884 (смоленские гости в Новгороде), ¶906–913 (Смоленский договор 1229); `transport-health-recreation` book 886616 ¶15 (мор 1230 в Смоленске); `names-peoples` book 641352 ¶268 (смоленский воевода Ивор Михайлович, 1216). Строку можно собрать без новой исследовательской работы.
3. **Поля заполнены не по смыслу** (исходная проблема 3 повторена в новых строках): `pp_chud_est.typical_occupations` — это история дани, а `presence_note` — служебная пометка о бандле; `pp_yem_sum.languages` — типология фибул, `typical_occupations` — хроника набегов, `presence_note` пуст; `pp_izhora.languages` — современная этнографическая ремарка («до сих пор называет себя карелами»). У 6 строк `neighbor_land` `presence_note` по-прежнему содержит направления маршрутов.
4. **Неполные ссылки.** Утверждения есть в evidence, но их абзацы не процитированы: в `pp_vod` «XIII–XIV вв. … прибрежная полоса» — это ¶388, а не ¶315/316/387; в `pp_yem_sum` фибулы «в землях еми и суми» — ¶471. Отдельной ссылки на «сумь» в строке нет.
5. **Не закрыто, но задокументировано.** `endonym` заполнен 1/23, `faith` 1/23, `languages` 6/23; `name_pool_ref`/`legal_status_ref` = unassigned 23/23. Ладога/Ижора и Заволочье остаются `neighbor_land`, хотя в 1230 г. они были частью Новгородской земли (исходная проблема 4, часть 2, не решена).
6. **Мелочи.**
   - `pp_vod.endonym = Vatjalaiset` соответствует источнику (Седов), но это, вероятно, финский экзоним; нужна сверка.
   - `source_refs` у neighbor-строк ссылается на `game-base:sources.rus13/novgorod_neighbor_regions_v1.json`, но такого файла в `Novgorod-game-base/.../sources/` нет. Фактический файл лежит в `Одним ПРОМТОМ/...`; это унаследовано от прошлого прохода.
   - Комментарий скрипта «every citation is a scholarly secondary source» неточен: `641352` — это перевод Жития (первичный текст), а `624953 ¶1396` относится к периоду `medieval_general`.

### `scripts/build-peoples-origins.mjs` — approve_with_limits

Детерминирован, воспроизводит CSV 1:1, `normalizeConfidence()` корректен. Ограничения:
- в `BOOK_ATTESTED_PEOPLES` захардкожены confidence B и содержимое полей (см. п. 1, 3, 4 выше);
- комментарий о типе источников неточен.

### `peoples_origins/README.md` — approve_with_limits

Метод, счётчики (23 = 10 + 6 + 7) и таблица покрытия верны. Ошибки:
- «6 of 7 brief-named peoples … are now present», хотя перечислено 7 добавленных;
- «Смоляне — no source found» неверно (см. п. 2);
- путь neighbor-источника расходится с `source_refs`.

### `personal_names/README.md` — approve_with_limits

Все три ошибки прошлого вердикта исправлены и подтверждены:
- число исключённых имён — 9;
- мёртвый lookup в `npc_name_pools` описан и помечен как `forbidden_promotion_source`;
- указаны 6 сидов `contextual_authoring_only`.

Остаток — одна фраза: «`baltic_west_contextual` in the npc_name_pools file is empty». На деле этот пул находится в `candidate.pools` (0 имён), а в файле npc_name_pools такого ключа нет.

### `README.md` (группа) — approve_with_limits

Ложное «cross-joined with rus13tpl pools» удалено, счётчик 23 и список народов верны. Остаток: смоляне по-прежнему описаны как требующие «new sourced research», хотя источники уже есть (см. п. 2).

### Итог повторной проверки

Выдуманных строк нет, все ссылки на книги разрешаются. Для `peoples_origins.csv` нужен ещё один короткий детерминированный проход:
1. `pp_novgorod_rus` → C (или найти источник c1230);
2. добавить строку смолян из `books-evidence-v1`;
3. разнести содержимое по полям для chud_est, yem_sum и izhora;
4. дописать ¶388 и ¶471;
5. синхронизировать README.

## Правки rework (C001)

- Было: `pp_novgorod_rus` имел B при единственном `medieval_general`-источнике; смоляне отсутствовали, поля трёх народов смешивали язык, археологию и историю, ссылки ¶388/¶471 отсутствовали. Сделано: новгородцы C с гипотезой Янина как атрибуцией; смоляне добавлены по локальным книжным ¶884/¶912 с оговоркой о спорной датировке; поля и ссылки исправлены. Итого 24 строки, 8 `people`.
- Проверки: `node scripts/build-peoples-origins.mjs` — 24 строки; сборщик сверил четыре добавленных абзаца с локальными evidence CSV; `pp_novgorod_rus=C`, `pp_smolyane=B` проверены readback; локальный `git diff --check` — OK. Статус candidate; новый verdict не утверждается.

## Независимая проверка C001 (Claude Opus 5.5, коммит 5ec3e1f9)

Проверка отдельного прохода, не автора правок. Вердикт `rework` означает, что артефакт возвращён исполнителю; `approve_with_limits` — годен для M2c с перечисленными ограничениями; статус данных остаётся `candidate` до утверждения набора.

### peoples_origins/peoples_origins.csv — approve_with_limits

Проверено: Claude Opus 5.5 (независимая проверка C001, коммит 5ec3e1f9).

**Что проверено.**
- Diff строк скриптом: 23 → 24 строки, новая `pp_smolyane`. Изменены 6 `neighbor_land` и `pp_novgorod_rus`, `pp_vod`, `pp_izhora`, `pp_chud_est`, `pp_yem_sum`; 10 `guest_itinerant` не тронуты.
- Копия `build-peoples-origins.mjs`, запущенная в отдельной папке, воспроизводит CSV байт в байт.
- Confidence: A3 / B12 / C9, недопустимых значений нет.
- Все 30 ссылок `book:… ¶…` в 8 people-строках найдены в локальном `books-evidence-v1` (names-peoples, history-events-knowledge, economy-trade-measures). Каждое значение сверено с value/quote/note, все 8 people-строк прочитаны.
- Статус candidate, в CSV нет «approved». Колонки quote нет. Даты D19/D22 к файлу не относятся.

**Замечания прошлого раунда.**
1. `pp_novgorod_rus` B при medieval_general — исправлено: C; «автохтонное» убрано; гипотеза подана как мнение Янина.
2. Смоляне — исправлено: `pp_smolyane` B, `book:301539 ¶884` (гости по Всеволодовой грамоте, спорная датировка — из note evidence) и `¶912` (договор 1229 г., дата из note evidence). Обе строки c1230/B.
3. Поля не по смыслу — в основном исправлено: chud_est, yem_sum и izhora разнесены; у 6 `neighbor_land` маршруты заменены общей фразой, `typical_occupations` очищен.
4. ¶388 и ¶471 — исправлено: добавлены, найдены, совпадают по смыслу (¶471 упоминает сумь).
5. Пустые поля и Ладога/Заволочье — не исправлено, пробел задокументирован: endonym 1/24, faith 1/24, languages 6/24, name_pool_ref unassigned 24/24.
6. Мелочи — не исправлены:
   - Vatjalaiset не сверен;
   - путь `game-base:sources.rus13/novgorod_neighbor_regions_v1.json` не существует;
   - комментарий скрипта «Confidence B throughout … scholarly secondary» неверен.
- Синхронизация README выполнена частично: `peoples_origins/README.md:95–98` всё ещё говорит «6 of 7 … Смоляне remains an open gap (no source found)», а строка 66 — «route/trade-basis».

**Находки (не блокируют).**
- Устаревший абзац README (строки 95–98, 66).
- Устаревший комментарий в `build-peoples-origins.mjs:113–119`.
- `pp_vod.presence_note` смещает расселение славян на Ижорском плато в XIII–XIV вв.; по ¶387 это XI–XII вв.
- Фраза «Регион из регионального реестра…» в 6 neighbor-строках — служебный текст без записанного правила.
- Neighbor-строки и сборка ссылаются на json вне репозитория.

**Ограничения для M2c.**
- У people-строк нет пулов имён, правового статуса, веры и самоназвания; `pf_ids` пуст везде. Присутствие по месту и сезону (D1–D13) из таблицы не выводится.
- Смоляне стоят на Погодине и спорно датированной грамоте.
- Ладога-Ижора и Заволочье помечены `neighbor_land`.

Выдуманных значений, неверных дат и атрибуций не найдено.

## Правки rework (C001b)

- Отчёт независимой проверки C001 добавлен дословно; побайтовое совпадение с исходным group markdown проверено скриптом. Данные и генераторы этой группы в данном проходе не менялись.

### personal_names/name_pool_entries.csv — пул личных имён B2 (C013b) — approve_with_limits

Проверено: Claude Opus 5.5 — независимый проход WR §21.1 и повторная проверка исправлений скриптом ревьюера, 2026-09-28.

- **Учёт выписки.** 207/207 решений по строкам `m2c-names.csv`: 149 включено, 58 исключено по закрытому списку причин. 223 производных записи, 179 записей пула. Выписка закреплена снимком `sources/book_evidence_m2c_names_b2.csv` (149 строк). Валидатор отклоняет ссылку вне снимка и форму, которой нет в её строке. Самопроверка — 27 отрицательных проб. Пересборка побайтная.
- **Правила вывода** (README):
  - пол — из источника или по роду календарного имени; на выборке больше 100 строк ошибок нет, включая мужские имена на -а/-я;
  - народ — из новгородского документа или прямо из источника;
  - класс относится к форме имени, а не к носителю. Крестильное имя — `ordinary`, даже если засвидетельствовано у посадника или владыки (`calendar_name_any_christian`). `dynastic` — княжеская форма (Ростислав). `significant` — некалендарная форма единственного известного лица.
- **Итог:** ordinary 142, significant 27, monastic 9, dynastic 1; веса равные. Селектор ordinary закрыт по умолчанию, пробы есть на dynastic, significant и monastic. Пути от LLM к именам нет.
- **Исправлено по первому проходу:**
  - формы в именительном падеже: Офимья, Деметрий, Павел;
  - Лембит (поздняя форма) снят;
  - Нястя → Анастасия, Ярина → Ирина;
  - L25 → `medieval_general`;
  - провенанс Гостяты без L46.
- **Ограничения:**
  - `pp_fg001` и `pp_fg002` — прокси происхождения для послов 1259–1262; все они significant;
  - 37 typed gaps: у семи прибалтийско-финских народов ordinary-пулы ниже порога; нет селектора по социальному положению; пул прозвищ и отчеств — будущий;
  - период XI–XIV вв. у части имён — с оговоркой, как у прежних кандидатов;
  - ключ уникальности `(pool, form, sex, people)` требует замены `09.sql:235` в DDL B2.

## Независимая проверка C016: части имён (Claude Opus 5.5, круги 1–4)

Проверено: Claude Opus 5.5 — независимый проход WR §21.1 (D35), 2026-09-28, до коммита ветки `data/game-base-v1-m2c-names2`.

- personal_names/README.md, personal_names/name-component-source.json, personal_names/name-component-army-additions.json, personal_names/name_component_pools.csv, personal_names/name_component_entries.csv, personal_names/name_component_rules.csv, personal_names/name_component_candidate_decisions.csv, personal_names/name-component-report.json, scripts/build-name-components.mjs, scripts/validate-name-components.mjs, sources/book_evidence_m2c_name_components.csv, sources/book_evidence_name_components_army.csv, sources/book_evidence_name_component_direct.csv — approve_with_limits
- personal_names/b2-name-pool-source.json, personal_names/name-pool-report.json — approve

**Ход проверки.**
- Круг 1: 44 формы (27 отчеств, 12 прозвищ, 5 демонимов) — узко для D38/D40; возврат на добор из выписок армии, C013b и индекса книг.
- Круг 2: три блокера — класс выбора по форме (`ordinary | dynastic | significant`: княжеские отчества — dynastic, прозвания одного лица — significant), правило «Х сынъ Y» по прямым цитатам, добор найденных форм и повторный скрининг журнала армии.
- Круг 3: блокеры закрыты; узкий rework — форма обязана стоять в опоре (Захаринич, Юрьевич), `c1230` только при датированной опоре 1201–1260 (чудь, Петрович, Домажирович), смысловой перескрининг 460 отказов, Красный → significant, примечание к Нездылову.
- Круг 4: все пять пунктов закрыты. Захаринич и новый Иванин опираются на `book:572528 §398` (1176), Юрьевич — на `book:458146 §461` (1238). Чудь, Петрович, Домажирович — `medieval_general`. Перескрининг вернул 10 строк и 16 компонентов: Несдич; Герасимов, Глебов, Перфильев; Оря, Стоивор, Игоча, Жидята; шунжане, толвуяне, кузарандцы, вымоченцы, новгородцы и др. Период XIV в. — `medieval_general`, XV в. — новый `late_medieval`. Красный и Жидята — significant. Примечание `ncr_pat_parent_before_son` называет отца Нездыло.

**Итог.** 3 пула, 206 записей (отчества 83, прозвища 31, демонимы 92), 9 правил. Классы: ordinary 182, dynastic 12, significant 12. Журнал армии: 1059 строк, 55 взято, 1004 отклонено по причинам. Снимок прямых опор — 85 абзацев; все выдержки сверены скриптом с `index.sqlite`, расхождений нет.

**Проверки круга 4.** Обе самопроверки — PASS (`validate-name-components.mjs`: 3/206/9/1059; `validate-b2-name-pool.mjs`: 179 записей, 27 проб). Пересборка компонентов и пула B2 во временной копии побайтна. Отрицательные пробы: старая опора Захаринича (`220871 §227`) отклоняется. Выборка из 437 оставшихся отказов: 12 случайных строк и 46 строк, найденных скриптом по суффиксам, «прозвищем» и демонимам. Все цели этой секции в `build-status.mjs` разрешаются.

**Ограничения.**
- Проверка «форма в опоре» читает всю строку выписки, включая авторские поля `entity_ru`, `value` и `note`, а не только `quote` или `text_excerpt`. Проба: Юрьевич на прежней `army_0918` проходит. Девять записей держатся только на этих полях: Софейский, Прибыша, Нежек, Прожневич, Хрушка, немцы, Боголюбский, Мономах, Посеня. Их я сверил вручную: в цитате или абзаце стоит косвенная или орфографическая форма того же слова. Нормализация снимает все ъ/ь, а не только конечные.
- `army_0684` (грамота 1470–80-х гг., весь): притяжательные Идуев и Адкин того же типа, что Герасимов и Глебов, остались в отказе с причиной `screened_no_supported_component`. В том же абзаце есть Кондратьев и Тимошкин.
- `nce_nick_pkt` (Пъкт) помечен `c1230`, хотя девять других форм из списка павших 1200 г. (`301521 §2794`) стоят как `medieval_general`.
- Иванин: носитель из того же перечня «мужей во главе общины» 1176 г., что и Захаринич, но `attested_bearer_class=ordinary`, а не elite. Класс — тенденция, не фильтр.
- 10 отказов с косвенными формами уже взятых компонентов (Матвеевичу, Всеволодовича, Ярославича и др.) помечены как отказы без компонента, а не `duplicate_of_included_form`.
- Runtime/DDL-импорт частей имён не утверждён (`gap_name_components_runtime_import`).

## Независимая проверка D46: архивные личные имена и части имён (Claude Opus 5.5, круги 1–2)

Проверено: Claude Opus 5.5 — независимый проход WR §21.1 (D35), 2026-09-29, до коммита; рабочее дерево `imp-names` от main `44caf7b7`.

- README.md, personal_names/README.md, personal_names/d46-name-additions.json, personal_names/name_pool_entries.csv, personal_names/name_component_entries.csv, personal_names/name-component-army-additions.json, personal_names/name-component-report.json, scripts/validate-b2-name-pool.mjs, scripts/build-name-components.mjs, scripts/validate-name-components.mjs — approve_with_limits
- personal_names/name-pool-report.json, sources/d46-onomastic-catalog-1230-1250.md, sources/d46-regional-name-pools.json, scripts/build-b2-name-pool.mjs — approve

**Ход проверки.** Круг 1: 221 строка архива учтена ровно по разу, формы в опоре, пол верен, княжеских основ в ordinary нет, иноземные формы привязаны к происхождению; возврат на шесть правок — Василиса, Дарья, Матрёна, Прасковья стояли ordinary вопреки каталогу §5.3 и §18 (Ольга и Елена — только пониженный вес); `Hæil(h)vatr` дублировал «Хейльватр»; 16 имён договора 1229 г. латиницей; четыре тюркские формы отклонены (по D40 это пробел селектора); `army_0094`, `army_0954`, `army_0955` ложно стали дублями; Гюрьги, Кузма, Сёмюн дублировали записи после нормализации. Круг 2: всё закрыто, проверено скриптом ревьюера по данным.

**Что проверено во втором круге.** Шести форм (Василиса, Дарья, Матрёна, Прасковья, Ольга, Елена) нет в выбираемых записях; первые четыре — typed gap `default_1230_1250_requires_new_evidence`, Ольга и Елена — `lower_weight_required`; валидатор держит закрытый список 10 пробелов с пробами. `Hæil(h)vatr` — `source_form_variant` к «Хейльватр». 16 договорных имён — `name_form` кириллицей по каталогу §9.2, латиница в `source_forms`, `pp_fg002`, `c1230`, `sourced`, B. Гюлопа, Ильдята, Кыяс, Сандус — `people_ref_unresolved`, не выбираются (путь закрытия — #190). `army_0094`, `army_0954`, `army_0955` снова `non_personal_name_form`. Гюрьги, Кузма, Сёмюн — `normalized_variant` к прежним записям. Два снимка в `sources/` побайтно равны архивным файлам (sha256 закреплены), все 442 `archive_ref` ведут в них, абсолютных путей нет.

**Итог.** 205 решений на 221 строку: 158 имён, 19 вариантов, 10 typed gaps, 13 новых частей имён, 5 связей с прежними; отказов нет. Пул B2 — 337 записей (179 прежних без изменений + 158 новых); классы: ordinary 285, significant 27, monastic 18, dynastic 7. Части имён — 219 записей и 9 правил.

**Проверки.** `validate-b2-name-pool.mjs --self-test` PASS (337, 33 пробы); `validate-name-components.mjs --self-test` PASS (3/219/9/1059); двойная сборка побайтна; `build-status.test.mjs` 4/4; 11 мутационных проб ревьюера отклоняются.

**Ограничения.** Ольга и Елена вернутся в выбор, когда в B2 появится вес; четыре формы §5.3 — только с новым свидетельством; тюркские формы — после #190. Общей проверки «`name_form` только кириллицей» нет (латиницу закрывают карта договорных чтений и проба на `Hæil(h)vatr`). `crosswalk_ref` — пути относительно архива. У 10 из 13 новых частей имён `support_texts` — сжатая выписка, формы в снимке дословно. Региональный пул 07 — черновик, кандидаты из него — `analogy`, C. Runtime- и DDL-импорт не утверждён.

## Независимая проверка обновления #189 (Claude Opus 5.5, 2026-09-29)

- **Кто:** независимый проверяющий Claude Opus 5.5, не автор. Пересборку после слияния main сделал Codex (задача `region-ids`, #189); коммит ревьюера 88555d24 поверх merge 2674ac2e. Прогоны шли на копии `git archive`.
- **Что изменено в группе:**
  - снимок `sources/d46-regional-name-pools.json` — только `metadata.region_id` (`novgorod_land` → `region_novgorod_land`) и `region_id_aliases` (`[region_novgorod_land]` → `[novgorod_land]`). Остальное при сравнении JSON равно архиву `tools/rus13-novgorod-regional-templates/novgorod_npc_name_pools_v1.json`;
  - в `personal_names/d46-name-additions.json` обновлён только pin `regional_name_pools.sha256`.
- **Отклонение от круга 2.** Снимок больше не побайтно равен архиву: у архива sha256 3d3adc…, у снимка ffcda1…. Фраза выше «два снимка в `sources/` побайтно равны архивным файлам» относится к состоянию до #189. Группа history решила ту же задачу иначе: там байт-копия сохранена, а alias перенесён в сборщик.
- **Проверено скриптами:**
  - пересборка частей имён (3 пула, 219 записей) и пула B2 (337 записей) побайтно равна коммиту;
  - `validate-b2-name-pool.mjs --self-test` — PASS, 33 пробы; `validate-name-components.mjs --self-test` — PASS;
  - `novgorod_land_document` не переименован: 606 вхождений до и после;
  - ссылки `archive_ref` не затронуты.

### Вердикты по файлам обновления #189

- sources/d46-regional-name-pools.json — approve_with_limits: снимок отличается от архива двумя полями региона (см. выше).
- personal_names/d46-name-additions.json — approve_with_limits

## Opus data approval — per-people personal-name pools (D51 p.2), 2026-09-30

- **Verdict:** APPROVE_WITH_LIMITS.
- **Approver:** Claude Opus 5.5 (claude-opus-5-5), independent data approver, Claude Code.
- **approved_commit:** 5834b89501d8d7ab3a85b7f3afb6a6c2ef53edc6.
- **Author:** Codex (gpt-6-luna), fleet task names-foreign.

**Scope.** The game-base-v1/names-peoples/personal_names B2 draft projection:
- 7 per-people pools, region of use `region_novgorod_land`, 1230–1250;
- 337 entries, including 26 rows moved unchanged (reviewer script: only `name_pool_id` differs);
- `nov_name_korela_valit_v1`: Валит, male, pp_korela, significant, medieval_general, attested 1337/38;
- Igoland as typed gap `people_ref_unresolved`;
- 48 typed gaps;
- builder/validator multi-pool changes.

No runtime bindings and no approved row status are implied.

**Checked.**
- The full diff.
- The Валит source in the book index (book:318333 §485, §558–574; FTS «Валит» over all books).
- DDL 09.sql/29.sql, table requirements, the b2 contract and the README.
- Counts per pool/people/sex/class against the gaps.
- Builder and validator checks are not weakened.

**Limits.**
- **L1 — fixed before merge (reviewer checked):** the Валит gap text and README now state the 1337/38 date (book:318333 §573, Sofia chronicle).
- **L2 — Валит:** significant/medieval_general only, attested 1337/38. It does not attest presence in 1230–1250 and is not promoted to ordinary; it may be a title (book:849577 §312).
- **L3 — Igoland:** stays a typed gap until a source names the people. No pool for the mixed group pp_fg005 (D51: one pool per people).
- **L4:** all rows stay draft. Runtime bindings and approval per (pool, people) are a separate step.
- **L5 — procedurally selectable (ordinary) names:** korela 0, izhora 1, Gotland 1, chud 0, smolyane 0. NPCs of these peoples without an authored name stay unnamed; there is no fallback by design.
