# households_kinship — двор, семья, родство (candidate)

Все таблицы генерирует `../scripts/build.py`, проверяет `../scripts/check.py`. Руками не править.

## relationship_rules.csv — кандидаты связей

Родство, супруги, вервь, зависимость и совместная работа, а также точные пробелы для потенциальных пар стартовых G5-сцен. Пары выводятся из presence и пересекающихся фаз `on_site`/`nearby` распорядков на основном и вторичных PF одного узла в одном сезоне; `joint_work` требует общего PF. Актуальное число есть в `scripts/build_report.json`. `materialization_guard` запрещает выводить связь лишь из роли или общей сцены: нужны конкретные участники и соответствующая запись о семье, службе, членстве в верви или совместном задании. Правила родства и супругов действуют и для двора смерда. Guard зависимости слуги перенесён на точную пару слуга–смерд: требуется названный слуга и его названный хозяин в материализованном дворе. Соседство привязано к `pf_village_lane`, не к отдельному двору. Существование верви подтверждено `book:641351 §2754`; сила и направление отношений соседей остаются `no_source`.

Редакционный реестр C: `editorial_joint_work_acquaintance_c` — только знакомство названных работников, назначенных в одно место и время. Это правило не утверждает родство, долг, вражду или силу отношения; код проверки допускает его только для `joint_work` с confidence C. Присутствие в одном PF/G5 само по себе не доказывает даже совместного задания.

Пробелы по природным и дорожным парам: сверены `sources/books-evidence-v1/{households-psychology-speech,occupations-activities,transport-health-recreation,fauna-fish-invertebrates-livestock}.csv`, `world-knowledge/production-v1/{reconstructed-public-world-v1,residual-language-education-v1}.json` и `sources/master-archive-v1/data/normalized_source_tables/occupations/{professions,activities,economic_links}.csv`. Эти материалы описывают занятия, роли или общую вежливость, но не устанавливают индивидуальную связь каждой пары. Дополнительные формы и пробелы см. в `speech_address/README.md`.

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

`members_estimate_min/max/basis` — только условная оценка для боярского двора:
15–24, уровень самой оценки C. В главе А. В. Кузы книги «Древняя Русь. Город,
замок, село» (book:622242 §Глава третья Древнерусские поселения >
Древнерусские города А.В. Куза ¶519) около шести человек — общая оценка для
средневековых Европы, Руси и Востока (`medieval_general`), не результат обмера
новгородских дворов. Новгородские сведения в том же абзаце — одна семья на
усадьбу и площадь боярской усадьбы в 2,5–4 раза больше рядовой. Умножение
шести на отношение площадей — условный вывод сборщика, не цитата Кузы.
У остальных 138 строк численность `unspecified`, в том числе у зависимых,
монастырских, гостевых и живущих в чужом доме ролей. Типовые поля TSV не дают
численности слуг или зависимых и помечены как шаблон.

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
