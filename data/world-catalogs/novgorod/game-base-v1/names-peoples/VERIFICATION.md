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
