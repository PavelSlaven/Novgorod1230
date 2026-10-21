> status: REFERENCE / DOMAIN GUIDE. Описывает устройство мира, его карту и историческую рамку в игре на CDDA. Норм не создаёт: при конфликте действуют AGENTS.md, CONTRACT_INDEX и профильные контракты. Состояние на 2026-10-21: main 181548e8; работа в неслитых ветках — по доске распорядителя на эту дату.

# 02. Мир, карта и историческая рамка

## Замысел

Игрок начинает в Руси 1230 года и исследует самостоятельный причинный мир. Новгородская земля — начальная область, а не край вселенной. Действие ограничено местом, временем, знаниями, восприятием и материальной культурой эпохи ([PRODUCT_CONSTITUTION.md:175–234](../../governance/PRODUCT_CONSTITUTION.md)).

1. Игрок начинает в Вихтуе → идёт по улице → видит соседние дворы → CDDA даёт движение и mapgen (**полное** покрытие, но старт выбирается по типу местности, не координате; [areas/06-movement-world-map.md:17,38](../../context/cdda-native-map/areas/06-movement-world-map.md)) → наш слой связывает старт с утверждёнными историческими данными, а не выводит факты только из процедурной карты ([Native_Earth_Map_Discussion_2026-10-18.md:71–82](../../plans/Novgorod1230_Cataclysm_Native_Earth_Map_Discussion_2026-10-18.md)).
2. Игрок идёт в соседнее поселение → исследует известный маршрут → видит пройденное место и путь → CDDA даёт `ACT_TRAVELLING` (**полное** в радиусе 4 overmap) и путь по известным клеткам (**частичное** покрытие для границы знания; [areas/06-movement-world-map.md:19–20](../../context/cdda-native-map/areas/06-movement-world-map.md)) → наш слой хранит историческую идентичность и связь знания с географией.
3. Игрок отправляется за пределы Новгородской земли → продолжает путь между регионами → ожидает связную географию → CDDA даёт плоскую overmap-сетку и региональные настройки (**частичное** покрытие: нет сферы, ±180° и полюсов; [areas/06-movement-world-map.md:31](../../context/cdda-native-map/areas/06-movement-world-map.md)) → Novgorod1230 задаёт историческую привязку; сопряжение Земли с native координатами пока не решено.

Историческое место сохраняет identity, источник и точность привязки; его физическое размещение остаётся в геометрии CDDA ([Native_Earth_Map_Discussion_2026-10-18.md:14–20,71–82](../../plans/Novgorod1230_Cataclysm_Native_Earth_Map_Discussion_2026-10-18.md)). Код задаёт категории и региональные разрешения, экземпляры остаются открытыми ([PRODUCT_CONSTITUTION.md:236–248](../../governance/PRODUCT_CONSTITUTION.md)).

## Что может игрок

- **02.01.** Начать игру в Вихтуе и обойти его улицы и дворы.
- **02.02.** Исследовать места Новгородской земли за пределами первого среза.
- **02.03.** Отправиться из Новгородской земли в другие земли мира.

## Родное CDDA

Оценки ниже относятся к закреплённому upstream `0d8843f1c500052c3e026e3da6f8edaf5e00b626`, без патчей Новгорода.

| Нужда | Native CDDA и покрытие | Ограничение карты |
|---|---|---|
| Локальное движение и стартовая локация | `avatar_action::move`, `game::walk_move`; `start_location` и mapgen. **Полное.** ([areas/06-movement-world-map.md:17,38](../../context/cdda-native-map/areas/06-movement-world-map.md)) | Старт выбирается по типу местности, не координате; движение для аватара. |
| Дальнее путешествие и знание маршрута | `ACT_TRAVELLING` — **полное** в радиусе 4 overmap; `only_known_by_player` — **частичное**. ([areas/06-movement-world-map.md:19–20](../../context/cdda-native-map/areas/06-movement-world-map.md)) | Путь ограничен радиусом; путь NPC не учитывает его знание. |
| Региональная генерация и вся Земля | `region_settings`, `dimension`, layouts; **полное** для JSON-регионов, **частичное** для Земли. ([areas/06-movement-world-map.md:31–34](../../context/cdda-native-map/areas/06-movement-world-map.md)) | Сетка плоская; LATITUDE/LONGITUDE не раскладывают карту, нет сферы, полюсов и шва ±180°. |
| Исторические места и сохранённый мир | `overmap_special` — **частичное**; reality bubble/map buffers — **полное** в native-модели. ([areas/06-movement-world-map.md:30,35](../../context/cdda-native-map/areas/06-movement-world-map.md)) | JSON special размещается случайно; дальние существа симулируются грубо, полноценная автономная жизнь не доказана. |

## Наш слой и владелец

| Механизм | Отношение к CDDA | Владелец и граница |
|---|---|---|
| Физическая карта | **Используем** CDDA cells, overmap, mapgen и reality bubble ([areas/06-movement-world-map.md:11,30,37](../../context/cdda-native-map/areas/06-movement-world-map.md)). | CDDA fork — физический owner; параллельной карты нет ([Native_Earth_Map_Discussion_2026-10-18.md:14–20](../../plans/Novgorod1230_Cataclysm_Native_Earth_Map_Discussion_2026-10-18.md)). |
| Исторические места и знание | **Расширяем** specials: их покрытие частичное и не включает identity/provenance ([areas/06-movement-world-map.md:35](../../context/cdda-native-map/areas/06-movement-world-map.md)). | `@rus/space-map` — пространственные сущности ([space-map/MODULE.md](../../../packages/space-map/MODULE.md)); `@rus/visibility-knowledge-memory` — player-safe знание ([visibility-knowledge-memory/MODULE.md:3–18](../../../packages/visibility-knowledge-memory/MODULE.md)). |
| Категории и региональная допустимость | **Расширяем** region settings утверждёнными историческими данными ([areas/06-movement-world-map.md:31–35](../../context/cdda-native-map/areas/06-movement-world-map.md)). | Категории и разрешения живут в approved world data; `@rus/world-base` даёт read-only доступ к canonical базе, но не владеет её авторингом ([world-base/MODULE.md:3–17](../../../packages/world-base/MODULE.md)). `@rus/world-knowledge` отвечает за factual slice, не за категории и механику ([world-knowledge/MODULE.md:3–39](../../../packages/world-knowledge/MODULE.md)). |
| Глобальная география ↔ native координаты | Открытое исследование, не новая принятая система: плоская native-сетка не покрывает Землю без швов, а два направления остаются гипотезами ([areas/06-movement-world-map.md:31](../../context/cdda-native-map/areas/06-movement-world-map.md)). | CR должен сравнить минимальную модификацию CDDA и локальные карты со стыками; заранее выбирать S2/cube-sphere/новую иерархию нельзя ([Native_Earth_Map_Discussion_2026-10-18.md:52–69](../../plans/Novgorod1230_Cataclysm_Native_Earth_Map_Discussion_2026-10-18.md)). |

Кандидат для географии уже проверен: плоская overmap, `dimension_region_layout`, `region_settings` и LATITUDE/LONGITUDE. Региональная генерация покрыта, но планетарная непрерывность нет ([areas/06-movement-world-map.md:31–34](../../context/cdda-native-map/areas/06-movement-world-map.md)). Поэтому собственная физическая карта не вводится: CR сравнит варианты минимального расширения CDDA ([Native_Earth_Map_Discussion_2026-10-18.md:52–69](../../plans/Novgorod1230_Cataclysm_Native_Earth_Map_Discussion_2026-10-18.md)).

## Решения владельца

- **Запись решений владельца в #133 от 2026-09-25** ([комментарий 5836830425](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5836830425)). Модель мира общемировая: универсальные категории дополняются региональными разрешениями; `novgorod_world` заполняется максимально полно. Это запись решений, сделанная по решению владельца, а не его прямая цитата.
- **D271, 2026-10-21**: дизайн-документ остаётся справочным до отдельного решения на P7. Эта глава описывает замысел и проверенные направления переноса, но не устанавливает норматив или подтверждённую production-архитектуру.

## Расхождения и открытые вопросы

- **Плоская native-сетка и вся Земля.** Требуются связные моря, шов ±180° и полюса, но покрытие native карты частичное ([Native_Earth_Map_Discussion_2026-10-18.md:14–20,52–69](../../plans/Novgorod1230_Cataclysm_Native_Earth_Map_Discussion_2026-10-18.md); [areas/06-movement-world-map.md:31](../../context/cdda-native-map/areas/06-movement-world-map.md)). CR должен выбрать вариант и критерии проверки непрерывности, сохранения, pathfinding и ориентации.
- **Историческая привязка.** Native special размещается случайно, а точная OMT-координата требует C++ ([areas/06-movement-world-map.md:35](../../context/cdda-native-map/areas/06-movement-world-map.md)); исторические места требуют source-backed identity и явной неопределённости ([Native_Earth_Map_Discussion_2026-10-18.md:71–82](../../plans/Novgorod1230_Cataclysm_Native_Earth_Map_Discussion_2026-10-18.md)). Достаточно ли источников для привязки Вихтуя и других мест, ещё предстоит установить.
- **Знание и дальняя симуляция.** Native путь игрока по известным клеткам частичный для NPC, а за reality bubble дальние существа представлены грубо ([areas/06-movement-world-map.md:19–20,30](../../context/cdda-native-map/areas/06-movement-world-map.md)). Граница между физической симуляцией и укрупнёнными пространственными, временными и NPC-процессами требует решения владельцев.

## Источники

- [PRODUCT_CONSTITUTION.md](../../governance/PRODUCT_CONSTITUTION.md) — самостоятельный причинный мир, границы знания и историческая материальная рамка.
- [Novgorod1230_Cataclysm_Native_Earth_Map_Discussion_2026-10-18.md](../../plans/Novgorod1230_Cataclysm_Native_Earth_Map_Discussion_2026-10-18.md) — целевое направление физического мира и оставленные открытыми варианты географии Земли.
- [Novgorod1230_Cataclysm_Mechanics_Reuse_Strategy_2026-10-18.md](../../plans/Novgorod1230_Cataclysm_Mechanics_Reuse_Strategy_2026-10-18.md) — порядок повторного использования native CDDA и разделение владельцев.
- [areas/06-movement-world-map.md](../../context/cdda-native-map/areas/06-movement-world-map.md) — проверенные механизмы карты, локального движения, путешествия, регионов и их ограничения.

## Этап

Срез начинается в Вихтуе; более дальняя география подключается при расширении мира. Общие категории и региональные разрешения действуют для всех регионов. 02.01–02.03 идут от части 5 к поздним этапам; статусы ведутся только в хабе.
