# households_kinship — двор, семья, родство (candidate)

Все таблицы генерирует `../scripts/build.py`, проверяет `../scripts/check.py`. Руками не править.

## household_composition_profiles.csv — 139 строк (rework 2026-09-26)

По одной строке на каждую запись `novgorod_occupations_v1_enriched.tsv` (68) и
`novgorod_social_roles_v1_enriched.tsv` (71) в `data/novgorod-region/`, у которой
непусто хотя бы одно из полей `family_pattern` / `household_pattern` /
`typical_dependents`. `family_pattern_ru` / `household_pattern_ru` — исходный
текст TSV без изменений, но помечен в `note` как шаблонный (одинаковый почти
на всех строках TSV) и **не используется** как сигнал состава двора.

`wealth_band` — единая закрытая шкала {`elite`,`high`,`middle`,`low`,
`dependent`,`outcast`,`variable`}, полученная маппингом `typical_status_range`
(occupations) или `social_rank` (roles) той же строки (было: смешение двух
разных шкал в одном поле, 12 разных значений без закрытого словаря).
`confidence` = confidence исходной строки TSV, перенесённый по правилу
high/medium\*→B, low→C (`build.py:norm_conf`); **потолок B** — TSV сама
помечена как «региональная социальная реконструкция», а не первичный/
археологический источник, поэтому она больше не может дать A (было: 14 строк
неверно получали A по правилу «TSV confidence high → A»).

`members_estimate_min/max/basis` — числовая оценка состава двора по
`wealth_band`, на книжной evidence этой группы (book:622242 §519, «Новгород и
Новгородская земля», археологическое обследование дворов): рядовой
новгородский двор — в среднем 6 человек (диапазон 4–8), боярская усадьба в
2,5–4 раза больше (диапазон 10–24); для `dependent`/`outcast`/`variable` —
`unspecified`, источника нет.

**Гэп (осталось).** Поля брифа `members[relation, sex, age_band]`,
численный `servants_dependants` и построчная связка `kinship_terms`/
`customs_refs` не выводятся ни из TSV, ни из доступной книжной evidence —
оставлены как явные указатели/gap-поля (`servants_dependants_ref`,
`kinship_terms_ref`, `customs_refs`), не выдуманы. v6 g3
`household_estimate`/`household_mix` и rus13tpl `household_wealth_profiles`
всё ещё не скопированы в `sources/` для этой группы.

## marriage_inheritance_rules.csv — 8 строк, confidence B 8 (не переработан)

Все 8 claims WK `family-social-context.json` (домен `social_law_economy`,
review_status=approved), включая три статьи расширенной Русской Правды
(ст. 93, 96 — уход за малолетними детьми при повторном браке матери,
возврат детского имущества опекуном) и записи о берестяных грамотах
(жалоба на обращение мужа, письмо от подводского о «почьстьи» и т.д.).
`confidence` = WK `qualifiers.confidence` (high/medium/low → A/B/C).
`evidence_refs` сохранены как есть (id внутри WK, не разыменованы).

**Гэп.** Семейство marriage-kinship в WK помечено в брифе как missing
(partial) — 8 claims покрывают только имущество/опеку, не сам брак,
приданое и вдовство как таковые.

## kinship_terms.csv — 32 строки (rework 2026-09-26), confidence A 9 / B 17 / C 6

Закрытый словарь древнерусских/новгородских терминов родства. **Была снята**
неверная общая строка `source_refs` («Зализняк... kinship-term chapter;
Русская Правда... articles on inheritance/dowry terms») — такой главы у
Зализняка нет, и большинство терминов в статьях РП о наследстве не
встречаются; теперь у каждого термина свой `source_refs`, книжный (с §/¶) там,
где нашлась per-row evidence этой группы, либо явно помеченный как общая
историко-лингвистическая реконструкция без per-row attestation (гэп).

Исправления по сути (не только атрибуция), по book:499410 (Колесов,
«Древняя Русь: наследие в слове», 2000, verified evidence):
- «дядя / уй» разделено на **стрый** (дядя по отцу) и **уй** (дядя по матери)
  — общего слова «дядя» до конца XIV в. не было, старая форма была
  анахронизмом для ~1230;
- глосс «баба» исправлен с «grandmother» на «пожилая, опытная в домашних
  делах женщина / повитуха» — «баба» в это время не значило «бабушка»;
- добавлены термины свойства **золовка**, **ятровь**, **шурин** (сверены по
  evidence), плюс **деверь**, **сноха**, **зять** (зять — по evidence
  book:641352; деверь/сноха — стандартная реконструкция, C, гэп);
- испорченный id `kt_pri_` (латиница+кириллица в ключе) исправлен на
  `kt_pridanoe`; «приданое» теперь со ссылкой на конкретную грамоту
  (book:641351 §2974: «что дал отец и родичи»), а не на неподтверждённую
  общую ссылку.

**Гэп (осталось):** отец/мати/сын/дъчи/дѣдъ/вънукъ/отрокъ/тьща/свекръ/тётка/
пасынокъ/мачеха/вѣно не имеют per-row book-evidence attestation в этой
группе — общее историко-лингвистическое знание, помечено в `source_refs`
каждой такой строки, не выдумано.

## Источники

- `data/novgorod-region/novgorod_occupations_v1_enriched.tsv` (68 строк)
- `data/novgorod-region/novgorod_social_roles_v1_enriched.tsv` (71 строка)
- `data/world-catalogs/novgorod/world-knowledge/production-v1/family-social-context.json` (8 claims, approved)
- `servak:/srv/novgorod-work/data/books/evidence/households-psychology-speech.csv` (верифицированная книжная evidence, домен households_kinship, 130 строк) — использована per-row в kinship_terms.csv и household_composition_profiles.csv с 2026-09-26
- Русская Правда, Пространная редакция — библиографическая ссылка (для терминов без per-row evidence)

## Известные ограничения (сверх отмеченных выше)

- v6 g3 `household_estimate`/`household_mix` и rus13tpl `household_wealth_profiles`
  всё ещё не найдены/скопированы в `sources/` для этой группы — численный
  состав двора теперь частично закрыт book evidence (см. выше), но не этими
  источниками.
- audit `status_rules` (draft) не использован для этого домена.
- marriage_inheritance_rules.csv не входил в объём переработки 2026-09-26
  (verdict verifier'а — `approve_with_limits`, не `rework`); его собственные
  ограничения без изменений, см. VERIFICATION.md.
