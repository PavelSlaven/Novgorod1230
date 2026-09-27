# workshops — мастерские (candidate)

## Что здесь

`workshops.csv` — 21 мастерская. Каждая мастерская = семейство места (`pf_id`) + инструменты + запасы + отходы-следы + звуки и запахи + занятия + цепочки.

Поля: `ws_id, name_ru, pf_id, bt_id_proposed, tools, stocks, waste_traces, ambience_sound_ru, ambience_smell_ru, light_fire_ru, occupations, process_refs, work_location, master_workshop_ref, matcult_scene_ref, region_id, source_refs, confidence, status, note`.

- `pf_id` — id семейства места WK (`smithy`, `ordinary_workshop`, `town_courtyard`, `riverbank`, `fishing_camp`, `forest_edge`, `dwelling_interior`, `peasant_homestead`, `monastery_yard`, `churchyard`). В place_families его сопоставляют через `wk_family_ref`.
- `bt_id_proposed` — предлагаемый тип постройки (`bt_smithy_proposed`, `bt_tannery_proposed`, `bt_urban_workshop_proposed`). Окончательный id задаёт домен buildings_structures; у дворовых, лесных и береговых мест поле пустое.
- `work_location`: indoor | yard | waterside | forest | outdoor_field.
- `waste_traces` — следы, по которым мастерская узнаётся и без мастера: окалина, литники, слои шерсти с золой, обрезки кожи, черепки брака, отпилы рога. Это материал для рассказчика и для WK claim:work-waste-context: следы не называют автора и не раскрывают скрытый результат.
- `master_workshop_ref`, `matcult_scene_ref` — связь с кандидатами MASTER workshop_profiles и сценами material-culture (SCN010–SCN029).

## Источники и метод

Состав выведен из цепочек (`process_refs`) и инструментов домена craft_tools_gear. Свидетельства: WK (кузница: claim:reconstructed-place-work-smithy…), Изюмова (кожевня и сапожная), ИА РАН Десятинный раскоп (литейная), Рыбина 2015 (берег с сетями), Колчин 1957 (токари, бондари). Звуки и запахи — редакторская реконструкция по процессу (C на уровне прозы). Уверенность: A 5, B 11, C 5.

## Приёмка (validate.cjs)

- Все инструменты, запасы и цепочки резолвятся.
- 16 из 16 занятий групп «ремесло» и «промысел» имеют мастерскую или явную пометку о месте работы (`work_location_note_ru` в `occupation_tools.csv`, например «работает на покосе»).

## Пробелы

- 4 из 20 профилей MASTER не сопоставлены: urban_yard_general, street_pavement_repair, cart_repair_yard, scrap_sorting_corner. Это рабочие места общего двора и улицы, а не мастерские.
- Мастерские литейщика, костореза, токаря и стекольщика не связаны с занятиями: этих занятий нет в списке 68.
- Специализированная красильня и известковая печь для Новгорода 1230 г. не выписаны (C).
- Частоты мастерских по месту (presence_rules, scope=workshop) здесь не задаются.
