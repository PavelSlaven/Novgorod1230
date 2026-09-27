# social_norms_honour_hospitality — честь, гостеприимство, дар (candidate, priority M3)

Таблицу генерирует `../scripts/build.py`, проверяет `../scripts/check.py`.

## norms.csv — 19 строк (rework 2026-09-26), confidence A 5 / B 12 / C 2

- 8 строк — все claims WK `family-social-context.json`. **Исправлено:** id
  теперь с префиксом `sn_wk_` (было: те же голые `claim:*` id, что и в
  `households_kinship/marriage_inheritance_rules.csv` — межфайловое
  дублирование одной и той же сущности под одним id). `norm_kind` и прочее
  содержание этих 8 строк не менялось. `confidence` = WK
  `qualifiers.confidence` → A/B/C.
- 5 строк (`sn_rp_beard`, `sn_rp_blunt_sword`, `sn_rp_bare_sword`,
  `sn_rp_push_slap`, `sn_rp_slave_insult`) — оскорбление действием, Русская
  Правда, Пространная редакция. **Исправлено:** убран посторонний CJK-символ
  «較» (мусор генерации) из `sn_rp_beard.legal_weight_ref`; исправлен
  `repair_options` — 12 гривен за бороду и за удар батогом/чашей/рогом — это
  **продажа (штраф князю)**, а не выплата потерпевшему (было неверно);
  добавлены `sn_rp_bare_sword` (1 гривна за обнажение меча без удара) и
  `sn_rp_push_slap` (3 гривны за толчок/пощёчину при двух свидетелях) —
  соседние по evidence нормы с другим правовым весом. Все 4 теперь со ссылкой
  на конкретный параграф книжной evidence этой группы
  (`servak:/srv/novgorod-work/data/books/evidence/households-psychology-speech.csv`,
  book:641351, §2775/§2776/§2782/§2821), `confidence=B`. `sn_rp_slave_insult`
  — номер статьи не подтверждён per-row в доступной evidence; `confidence`
  понижен B→C, гэп зафиксирован явно в `source_refs`, а не выдан за
  подтверждённый.
- 6 новых строк (`sn_hospitality_guest`, `sn_gender_age_elders`,
  `sn_gender_age_youth_conduct`, `sn_mutual_aid_kin_liability`,
  `sn_taboo_oath_causes_drought`, `sn_taboo_witch_trial_water`) — из
  книжной evidence этой группы, впервые использованной здесь: закрывают 4
  из 5 ранее пустых `norm_kind` (`hospitality`, `gender_age_conduct` ×2,
  `mutual_aid`, `taboo` ×2). `sn_taboo_witch_trial_water` — period в evidence
  указан `medieval_general` (аналогия), поэтому `confidence` снижен до C по
  правилу проекта, хотя в самой книге строка помечена A.

## Гэпы (существенные, осталось)

- `gift` (дарение) — единственный `norm_kind` из брифа, всё ещё 0 строк;
  в этой группы evidence прямой пример дарообмена не найден построчно.
- `sn_rp_slave_insult` — конкретная статья (номер, Троицкий список или иное
  академическое издание) не подтверждена; см. её `source_refs`.
- WK `foundations-mind-society.json` (46 claims, психология) прочитан для
  ориентации, но **не** включён в `norms.csv` — он про восприятие/эмоции,
  а не про нормы.
- sqlite `novgorod_1230` law (20 строк, A/B/C), rus13tpl
  `npc_reaction_rules` (2) и `nov_region_audit/novgorod_status_rules_v1.json`
  (draft) — всё ещё не прочитаны в этом проходе (вне разрешённых read-only
  путей / не открыты).
- `reaction_by_role` — пустой список во всех строках (закрытых значений
  реакции NPC не определено); прямой gap, который бриф называет целью
  домена.

## Источники

- `data/world-catalogs/novgorod/world-knowledge/production-v1/family-social-context.json`
- `servak:/srv/novgorod-work/data/books/evidence/households-psychology-speech.csv`
  (верифицированная книжная evidence, использована с 2026-09-26 для
  `sn_rp_*` и `sn_hospitality_*`/`sn_gender_age_*`/`sn_mutual_aid_*`/`sn_taboo_*`)
- Русская Правда, Пространная редакция — библиографическая ссылка (только
  там, где нет per-row book evidence, см. `sn_rp_slave_insult`)
