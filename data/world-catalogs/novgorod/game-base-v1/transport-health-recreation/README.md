# transport-health-recreation (candidate, collector pass)

Группа брифа `transport-health-recreation` (транспорт и путь; здоровье и тело; досуг). Три домена, каждый со своим `README.md`, `scripts/build.cjs` и выходными CSV. Общий парсер и утилиты — `scripts/lib.cjs`.

## Домены

- `transport_travel/` — суда, сани, телеги, упряжь, переправы, дорожное право, гостеприимство в пути. 63 сущности + 16 видов пути региона.
- `health_body/` — роли лечения, народная практика (помечена как историческая, не медицинский совет), баня и роды, болезни, травмы, эпидемии/голод 1230–31, детство и демография. 54 сущности.
- `recreation_culture/` — настольные игры, игрушки, музыкальные инструменты, скоморохи, пиры и календарные праздники, с denylist анахронизмов. 66 сущностей.

## Общий источник

Главный источник этого прохода — верифицированная книжная доказательная база `sources/book_evidence_transport_health_recreation.csv` (256 фактов, независимая верификация на удалённой машине; `rejected.csv` пуст — ни одна строка не отклонена). Каждая строка несёт `book_id`, авторов, `title`, `year`, `section_path`, `para_no`, цитату ≤1 предложения, `confidence` (A/B/C), `period`, `note`. Копия `VERIFICATION.md` лежит рядом.

Дополнительно: `novgorod_region_route_guidance.tsv` (черновой региональный источник, уже был в `data/world-catalogs/novgorod/sources/nov-region-audit-v1/`) — единственный существующий носитель видов пути для `route_modes.csv`.

## Что НЕ сделано в этом проходе (ограничение бюджета и read-only зоны)

- world_db (route_templates 21, spatial_v3, rus13tpl route_season_modifiers 29) не читался — Docker-контейнер `world-base-postgres-1` не проверялся/не запускался в этой сессии.
- WK production-v1 файлы (biology-physiology.json, category-cartography.json и др.) не сверялись построчно по claim id — только подтверждено наличие файлов.
- MASTER archive профессионально-инструментальные связи (occupation_tools, profession_item_links) не привязывались к персональным вещам путника — вне периметра этой группы (принадлежит `crafts-tools-processes`/`items-*`).
- Структурные поля брифа (`speed_band_by_season`, `hospitality_rules`, `course_stages`, `occasions`, `pf_ids` и т.п.) не заполнены построчно — это требует авторского суждения и сверки id с другими доменами репозитория (уже готовыми, read-only для этого сборщика), оставлено как явный пробел в READMEs доменов.

Все данные — `status: candidate`. Утверждение — отдельный проход (не этим агентом).
