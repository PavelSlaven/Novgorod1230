# Общая очередь `needs_check`

`scripts/check-needs-check.mjs` собирает активные очереди в versioned snapshot `needs_check_blockers.v2.json`. Каждая строка малой очереди и archive-строка с вопросом о существовании предмета явно задаёт `doubt_kind`: `anachronism` или `regional_presence`; пустое поле в такой строке останавливает сборку. Только `anachronism` получает `block_by=name`, `block_region=region_novgorod_land`, `block_period=1230-1250`. Matcher блокирует имя в указанном регионе; отсутствующий или неизвестный регион проверяется по всем name-записям, другой известный регион пропускается. `block_period` фиксирует временную границу записи; дата кандидата пока не учитывается, game-base относится к 1230 г. `regional_presence` получает `block_by=none`: запись видна в отчёте, но не запрещает редкое, привозное или единичное присутствие.

Для archive-очередей блок выбора определяется явно: запись `reason_code=unresolved` с запросом источника в `note` или `source_request` (`запросить`, `требуется источник`, `source request`) относится к проверке имени; остальные маршрутные и идентификационные строки получают `block_by=archive_id`. Archive ID глобально уникален и блокирует только включение сущности в каталог через entity registry и сборщики archive inclusion BIC/crafts, независимо от региона. Ссылки на этот ID в item-bearing таблицах остаются информационными. Name-блок archive-записи дополнительно исключает её ID при включении сущности.

Блок по имени проверяет entity registry и item-bearing таблицы: `items-household-personal/items/{item_place_frequency,item_context_relations,item_place_trace_relations}.csv`, `occupations-activities/carried_inventories/carried_inventories.csv`, `buildings-interiors-containers/interiors/scene_items.csv`, `places-binding/presence/{presence_rules,environment_presence_authoring}.csv`, `clothing-appearance/garments/costume_disposition.csv`, `time-calendar-church/religion/church_practice.csv`, `items-weapons-armour/items/weapon_source_crosswalk.csv`. Archive ID вне включения в каталог выводится отдельной информационной метрикой и не блокирует эти ссылки. Совпадение анахронизма со сгенерированной строкой исключается владельцем таблицы с явным gap, содержащим queue ID, причину и строку.

Снять блок можно после проверки и решения по D38: утвердить запись в каталоге либо перенести позднюю форму в denylist, затем убрать соответствующую строку из очереди и пересобрать snapshot командой `node scripts/check-needs-check.mjs --write`. Если один анахронизм ограничивает несколько регионов, для каждого региона нужна своя строка с уникальным `check_id`. Если archive ID встречается в двух ledgers, решение и снятие записи должны быть согласованы в обоих. Изменение confidence само по себе блок не снимает. Не выводить анахронизм из отсутствия источника.

Сборщики владельцев и `--check` используют общий matcher из `@rus/runtime-catalog/needs-check-blocker`; очереди читает game-base CLI. `--check` падает на совпадении блокирующей строки, незаполненных полях, неизвестном типе сомнения, повреждённом digest или устаревшем snapshot. Runtime применит тот же контракт после этапа 1 и отдельной работы на PR #98.

## Утверждение разметки (Opus, 2026-09-30)

Утверждающий — Claude Opus 5.5 (high), отдельный проход, не автор разметки. Вердикт — **APPROVE_WITH_LIMITS** по 37 строкам с вопросом о существовании предмета (правило владельца: блокирует только сомнение-анахронизм для региона и периода; региональное присутствие не блокирует).

- Переклассифицированы: `crafts_trip_hammer` → anachronism (вододействующие молоты на Руси — XVII в., book:381740 §19); `flora_lagenaria` → regional_presence (старосветская горлянка известна в Европе, book:708172 §1351–1353; американская Cucurbita уже в denylist `dn_cucurbita`).
- Решены: HRS0021 (дуга; book:709382 §459, book:624953 §1294–1295), WTR0015 (кормовой руль; book:463659 §71, §76), `crafts_byaz` (book:773473 §1395) — regional_presence.
- Итог: anachronism 8, regional_presence 29, без `doubt_kind` 0. Проверка каталога: 0 блокирующих совпадений на 24 106 записях.

Ограничения:
- `clothing_sarafan_form`: анахронизм сохранён; есть контрдовод (Вернадский, book:426144 §1117), записан в `reason`.
- `clothing_lapti_frequency`: regional_presence; редкость в городе обеспечивают `runtime_daily_eligible=false` и исключение из нарядов.
- HRS0021: возможное соответствие `transport_entities.csv#trv_030` — отдельное решение, в этой разметке не сделано.
- Блок по archive ID не зависит от региона; CRF0057 в BIC — regional_presence, а в crafts `review_finding` продолжает блокировать ID по правилу archive-ID.
