# occupations/carried_inventories.csv

**Что.** 26 строк носимых наборов (`ci_*`), выведенных детерминированным скриптом из уже одобренного-как-источник `master-archive-v1` `inventory_profiles.csv` (26 профилей: домашний швейный свёрток, рыбацкий ремонтный набор, набор для письма на бересте и т.п.). `owner="actor"` во всех строках, как требует бриф.

**Статус.** `status` не проставлен как поле — весь файл является `candidate`-выводом (README фиксирует это явно); confidence=B на каждой строке (мастер-архив — scholarly-secondary reconstruction, не первичная археология по каждому конкретному сочетанию предметов).

**Метод (чистая экстракция, без авторства).** `scripts/build_carried_inventories.py` построчно копирует поля `inventory_profiles.csv` (`inventory_profile_id`, `owner_context`, `canonical_existing_item_ids`, `common_new_item_ids`, `contextual_new_item_ids`, `max_items`, `selection_rule`, `quantity_rule`, `forbidden_rules`, `notes`) в целевую схему брифа (`ci_id`, `role_or_occupation_ref`, `entries`, `owner`, `source_refs`). Никакие числа/веса не придуманы — они взяты как есть из источника.

**Счёт (по скрипту).** 26 строк написано (совпадает с `inventory_profiles.csv`).

## Известные разрывы (gaps) — не закрыты в этом проходе

- **Поля `season` и `circumstance` в источнике отсутствуют.** `season` заполнен плейсхолдером `unspecified_all_season` (не выдумано конкретное значение), `circumstance` временно = `name_ru` источника (описательное имя профиля, не структурированная категория дорога/работа/торг из брифа). Разбить по сезону и обстоятельству — отдельная содержательная задача, которая должна свериться с `typical_*` полями occupations TSV и с `profession_resource_profiles`/`occupation_item_profiles` (см. ниже), не выполнена здесь из-за бюджета.
- **`rus13tpl occupation_item_profiles` (68, draft) не использован.** Файл не найден среди скопированных `sources/*` этого коллектора (не в `sources_copied` брифа) и не подтверждён доступным в read-only зонах, перечисленных в задаче (main checkout, PR#98 worktree, распакованные zip). Нужен отдельный запрос владельцу/аудитору о его фактическом местоположении, прежде чем расширять этот файл.
- **`profession_resource_profiles` (упомянут как кандидат в брифе) не найден** в скопированных источниках этого коллектора; вероятно лежит в другой части master-archive или в другом датасете, не входящем в `sources_copied` для этой группы — нужен доступ/копирование координатором.
- **Связь с новыми occupation-строками (`occupations_additions.csv`) не проведена.** Ни один `ci_*` не привязан к 18 новым занятиям (`occ_jeweler_caster` и т.д.) — их `typical_tools`/`typical_containers` поля можно механически развернуть в наборы того же формата отдельным скриптом-джойном, это не сделано в этом проходе.
- **Проверка "масса набора ≤ лимита переноса"** (acceptance-критерий брифа) не выполнена — в `inventory_profiles.csv` нет массы предметов по `item_id`, а `master_archive` `material_items.csv`/`item_location_links.csv` с массами не сверялись в этом проходе. Скрипт-проверку нужно писать вместе с этим join.

## Источники

- `data/world-catalogs/novgorod/sources/master-archive-v1/data/normalized_source_tables/material_entities/inventory_profiles.csv` (26 профилей, confidence не проставлен в источнике — принято B по умолчанию как scholarly-secondary reconstruction).
