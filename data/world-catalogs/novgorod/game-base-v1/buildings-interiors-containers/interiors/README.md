# interiors — сцены-интерьеры, мебель, свет, дым, запах (candidate)

Домен: `interiors_scenes`.

## Файлы и счёт (scripts/build.py)

| Файл | Строк | Что |
|---|---|---|
| `scenes.csv` | 69 | все 66 сцен matcult (перенос 1:1) + 3 авторские (`sc_x001_bathhouse`, `sc_x002_ovin`, `sc_x003_podklet_cold_store`); привязка к `pf_ids` и `bt_ids`, обязательное/допустимое/запрещённое, количества, расстановка, состояние, сезоны, мебель, свет/дым/запах/звук |
| `scene_items.csv` | 795 | каждая ссылка сцены на предмет: required 320, allowed 231, forbidden 244; `resolves_to` (все разрешены: matcult_item или anti_pattern), класс частоты и вес |
| `furniture_fixtures_light.csv` | 75 | импорт всех FUR* (26) и INT* (49) matcult: мебель, печи, свет, полы, двери, окна + заметки датировки |
| `anti_patterns_ref.csv` | 53 | анти-паттерны matcult (AP###), на которые ссылаются forbidden |
| `matcult_item_refs.csv` | 458 | снимок всех предметов matcult, упомянутых в группе (для офлайн-проверки) |

Виды сцен: interior 27, exterior 31, activity 5, vehicle 3, character_kit 3 (снаряжение воина — не место, pf пуст).

## Метод

1. `scenes.csv` импортирован скриптом из `sources/material-culture-scenes-v1/data/scenes.csv`; тексты не переписывались.
2. Привязка `pf_ids`/`bt_ids` — авторская таблица `scripts/src/scenes_map.py` по `scene_type` и `location_scope`.
3. Ссылки на предметы — это id каталога matcult (1137 записей). Crosswalk на будущий домен items идёт через `matcult_item_refs.csv` и `containers/item_to_container_crosswalk.csv`; id GM/SCN/OMI в сценах не встречаются.
4. Частота в сцене: required → ubiquitous (8); allowed → contextual (2) — по правилу matcult «допустимые используются выборочно».
5. Свет, дым, запах, звук — по `scene_type` из claims WK (`reconstructed-place-interiors-v1`, `reconstructed-practical-world-v1`) и предметов matcult (INT0006 курная топка, INT0035 лучина).
6. **Красный угол (проверено)**: термин и диагональная схема «печь — красный угол» — поздняя этнография. Для 1230 г. допустима только домашняя молельная зона (INT0005, C) у стены/на полке; в `furniture_fixtures_light.csv` это записано в `dating_note`. Киот и божница XIX в. — анахронизм.
7. Мебель 1230 г.: встроенные лавки вдоль стен, настил для сна, полки, столы на козлах/рамные, сундуки и лари; кровать и кресло со спинкой — C и только элита.

## Приёмка (validate.py)

- все 66 сцен перенесены; каждая ссылка на предмет разрешается (0 UNRESOLVED);
- required ∩ forbidden = ∅;
- у каждого интерьерного семейства мест (dwelling_interior, church_interior, ordinary_workshop, cellar_granary, bathhouse, smithy, outbuildings, threshing_barn, grain_drying_shed_ovin, mill) ≥1 сцена;
- все pf/bt существуют; denylist анахронизмов.

## Известные пробелы

- Бани, овина и подклета в matcult нет — добавлены 3 авторские сцены C.
- Аномалии источника перенесены без правки: в SCN020 (мельница) и SCN035 (гумно) обязательным указано «ведро для доения» AGR0001 — вероятно ошибка генератора matcult; нужна проверка утверждающим.
- `research_only` (D) предметов среди обязательных нет; 42 ссылки на `reference_required` требуют конкретного референса для генерации изображений.
- Нет привязки к v17 spatial_v3_scene_templates и G5 minilocation (нужен CR на носитель); rus13tpl g5_scene_templates (198, draft) не импортированы — это шаблоны G4-типов графа v6, а не интерьеры.
