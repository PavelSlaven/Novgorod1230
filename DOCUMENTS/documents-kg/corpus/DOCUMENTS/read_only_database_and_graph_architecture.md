# Ручная read-only база и универсальная графовая карта проекта

Статус: рабочая архитектурная спецификация  
Дата: 2026-06-30  
Назначение: собрать в одном документе структуру ручной базы проекта, разделение read-only и party-базы, схему вложенной графовой карты и универсальную единицу пути `GU`.

**Справочник полей PostgreSQL (типы, ограничения, пояснения):** [world_base_schema_reference.md](./world_base_schema_reference.md) — генерируется из `infra/world-base/schema.sql` командой `npm run world-db:schema-doc`.

---

## 0. Главное архитектурное правило

Код не создаёт смысловые сущности мира. Мир, персонажей, причины, связи, предметы, исторические смыслы и последствия создаёт LLM в рамках утверждённой процедуры. Код только хранит, читает, передаёт, валидирует структуру, фиксирует утверждённые данные, защищает состояние от противоречий и выдаёт случайные числа по запросу LLM при бросках.

Из этого следует разделение баз данных:

```text
ручная проектная база = read-only справочник и канонический граф мира
party-база = изменяемое состояние конкретной партии
```

Ручная база не должна хранить состояние конкретной игры. В ней не должно быть открытых игроком маршрутов, текущих положений NPC, повреждённых дорог, последствий действий, скрытого состояния партии или карты знаний персонажа.

Для каждой новой партии создаётся отдельная база данных, куда пишется всё изменяемое.

---

# Часть I. Универсальная графовая карта

## 1. Главное решение

Базовую единицу карты нельзя делать как “расстояние между регионами”.

Причина: список регионов RUS13 покрывает почти весь мир: от Новгородской земли и русских земель до Европы, Ближнего Востока, Индии, Китая, Африки, Америк, Океании и технических proxy-регионов. Эти регионы несопоставимы по размеру, плотности дорог, ландшафту и исторической связности. Поэтому правило вида `1 регион = N километров` даст ложную точность и сломает дальнее перемещение.

Правильная модель:

```text
каждый регион G0 = крупная историко-географическая рамка
внутри региона G0 = сетка дневных G1-ячеек
каждая G1-ячейка = квадрат карты, пересекаемый примерно за один ходовой день
внутри каждой G1-ячейки = вложенные подграфы G2-G5
реки, дороги, города, крепости и лесные зоны = якоря, коридоры и подграфы, проходящие через ячейки
```

Единая мера должна описывать не размер региона и не абстрактное расстояние между регионами, а дорожный шаг по ребру графа и базовый размер дневной ячейки.

---

## 2. Разделение баз данных

В проекте должны существовать два разных слоя хранения.

### 2.0. Импорт из пакета БАЗА

Каноническая загрузка `world_base` выполняется через утверждённый Python importer из внешнего пакета `БАЗА`.

Порядок:

```bash
npm run world-db:prepare-staging
npm run world-db:import:dry-run
npm run world-db:fk-audit:staged
npm run world-db:import:apply
npm run world-db:fk-audit:db
node scripts/seed-world-base.js --check
```

`prepare-staging` только копирует исходные CSV/XLSX/JSON/TSV и распаковывает nested zip в пути manifest. Он не создаёт смысловые сущности мира. Если manifest path отсутствует, import останавливается и показывает missing list.

Оставшиеся Новгородские runtime templates грузятся отдельным importer:

```bash
npm run world-db:import:novgorod-regional:dry-run
npm run world-db:import:novgorod-regional:apply
```

Он переносит утверждённые `rumor_templates`, `conflict_templates`, `price_bands`, `seasonal_rules`, `weather_profiles`, `historical_events`, `item_templates`, `region_place_generation_rules`, `place_generation_limits` и G5 context pack. G5 templates пока хранятся в `llm_context_packs`, потому schema v2 не имеет отдельной таблицы для них.

`world-db:seed` применяет DDL через `DROP SCHEMA world_base CASCADE`; после import его нельзя запускать без повторного import.

### 2.1. Ручная проектная база

Ручная база заполняется человеком и используется только для чтения.

Она содержит:

1. утверждённые регионы;
2. исторические и географические якоря;
3. канонические узлы графа;
4. канонические связи графа;
5. правила сезонности, риска, доступа и модификаторов пути;
6. источники и статус достоверности;
7. шаблоны мест, ролей, профессий, предметов, конфликтов и событий.

Ручная база не должна хранить изменяемое состояние конкретной партии.

В ней не должно быть игровой таблицы `routes` как изменяемого маршрута партии.

Вместо этого в ручной базе используются:

```text
graph_nodes = канонические узлы мира
graph_edges = канонические связи мира
```

### 2.2. База конкретной партии

Для каждой партии создаётся отдельная база данных.

В неё пишется всё изменяемое:

1. текущая позиция персонажа;
2. материализованные места;
3. созданные NPC;
4. созданные предметы;
5. открытые маршруты;
6. фактическое состояние дорог;
7. что персонаж знает о карте;
8. что игрок уже видел;
9. последствия действий;
10. изменения мест после времени;
11. заблокированные, опасные или изменённые пути;
12. журнал перемещений;
13. скрытое состояние мира партии.

В базе партии могут быть свои таблицы маршрутов, но они не являются ручной канонической базой. Это уже состояние конкретной игры.

Рекомендуемое разделение:

```text
read-only project DB:
  regions
  landscape_templates
  region_landscape_templates
  water_body_templates
  region_water_body_templates
  route_templates
  land_use_templates
  region_land_use_templates
  place_templates
  region_place_templates
  graph_nodes
  graph_edges
  graph_scale_rules
  graph_edge_modifiers
  historical_anchors
  source_records

party DB:
  party_state
  party_current_position
  party_graph_nodes
  party_graph_edges
  party_map_knowledge
  party_route_journal
  party_places
  party_locations
  party_minilocations
  party_scene_anchors
  party_npcs
  party_items
  party_events
```

Правило:

```text
ручная база описывает, что в мире допустимо и канонически существует;
база партии описывает, что уже материализовано, изменено, известно персонажу и произошло в этой партии.
```

---

## 3. Базовая единица GU

Вводится универсальная дорожная единица:

```text
1 GU = 1 graph unit = 1 час обычного пешего пути = примерно 4 км по проходимой сухой дороге без тяжёлого груза
```

Это не “физический километр карты”, а базовая дорожная единица ребра графа.

Все реальные условия меняют не саму единицу, а итоговое время прохождения ребра.

Базовые формулы:

```text
base_distance_km = base_gu × 4
base_time_hours = base_gu × 1
```

Итоговое время:

```text
final_time_hours = base_gu × terrain_modifier × season_modifier × load_modifier × access_modifier
```

Упрощённая формула:

```text
итоговое время = base_gu × 1 час × модификаторы
```

Пример:

```text
5 GU = около 20 км
base_time = 5 часов пешком по нормальной дороге

грязь или снег: ×1.5
лес, болото или поиск пути: ×2
метель, опасный брод, тяжёлая ноша или раненый спутник: ×3
```

Так единица остаётся универсальной для всего мира, но Новгородская земля, пустыня, горы, степь, море, лес, городские улицы и речные пути получают разные условия прохождения.

---

## 4. День пути

Для дальних маршрутов вводится производная единица:

```text
1 travel_day = 8 GU = 32 км = один обычный ходовой день пешком по нормальной дороге
```

Это не означает, что персонаж всегда проходит 32 км. Это только базовый расчёт для нормальных условий.

Фактический день пути зависит от:

1. дороги;
2. сезона;
3. погоды;
4. груза;
5. здоровья;
6. сытости;
7. бодрости;
8. наличия лошади, саней, лодки или повозки;
9. знания пути;
10. риска;
11. необходимости скрываться;
12. остановок, торга, ожидания, переправ и ночлега.

---

## 5. Масштабы графа

Карта строится как вложенный граф из шести уровней.

Исправленная трактовка масштаба:

```text
G0 — world_region_graph: регион из world_regions
G1 — region_cell_grid: дневные квадратные ячейки региона
G2 — cell_subgraph: внутренний подграф G1-ячейки
G3 — place_graph: конкретное место внутри ячейки
G4 — location_graph: локации внутри места
G5 — scene_graph: точные точки сцены
```

Главное изменение: G1 не является “крупным смысловым узлом” вроде Новгорода, Волхова или Ильменя. G1 — это пространственная дневная ячейка карты.

Крупные смысловые объекты региона — город, озеро, река, торговый путь, военное направление, монастырь, пограничная зона — хранятся как исторические якоря, географические якоря, коридоры или подграфы, которые могут занимать одну или несколько G1-ячеек.

---

## 6. G0 — мировой граф регионов

Одна вершина G0 = один регион из `world_regions.txt`.

Примеры:

```text
Новгородская земля
Псковская земля
Ладожско-Ижорская земля
Карельская земля
Заволочье
Белозерье
```

На этом уровне не нужно считать точные километры между центрами регионов.

Здесь нужна не геометрия, а связность:

```text
region A → region B
есть ли переход
через какие пограничные G1-ячейки или border_transition
какой тип связи
какое историческое давление
какие маршруты возможны
какие условия доступа
какие группы людей знают этот переход
```

На G0 `graph_edges.edge_type` описывает **физический тип перехода** (`border_transition`, при необходимости `corridor_segment`). Политика, торговля и культурные связи между регионами — в **`region_neighbors`** (`political_relation`, `trade_connection`, `connection_type`), не в `edge_type`.

Пример G0 (две записи):

```text
# graph_edges (scale_level G0)
from: <G0-node Новгородская земля>
to: <G0-node Псковская земля>
edge_type: border_transition
base_time_days: calculated_from_g1_route_chain
known_to_commoners: roughly
known_to_traders: yes
risk_level: medium

# region_neighbors (отдельная запись)
region_id: Новгородская земля
neighbor_region_id: Псковская земля
connection_type: land_border
political_relation: сосед / союз / давление
trade_connection: торговые связи
route_connection_summary: Шелонское направление; юго-западные G1-ячейки; пограничные переходы
```

G0 нужен для ответа на вопрос:

```text
какие регионы соприкасаются и куда вообще можно выйти
```

---

## 7. G1 — дневная ячейка региона

Одна вершина G1 = один квадрат карты внутри региона.

Базовое правило:

```text
1 G1-cell = 1 дневная ячейка региона
размер G1-cell = примерно 32 × 32 км
пересечение G1-cell в нормальных условиях = примерно 1 travel_day
1 travel_day = 8 GU = 32 км = 8 часов обычного пешего пути
```

G1-ячейка не обязана содержать поселение. В ней может быть:

```text
лес с дорогой
лес без дороги
болото
река и брод
участок озера
город или часть городской округи
крепость
монастырь
погост
деревни
зимник
волок
пограничная зона
пустая или слабо известная местность
```

Важно: “один день пересечения” — это базовая норма для нормальной дороги и обычной нагрузки. Реальное время внутри ячейки считается по ребру графа с учётом дороги, сезона, погоды, груза, состояния персонажа, транспорта, риска и знания пути.

Примеры:

```text
G1-cell с хорошей дорогой: пересечение около 8 часов
G1-cell с лесом и поиском пути: 12–16 часов или больше
G1-cell с болотом и распутицей: 2–3 дня или путь невозможен без проводника
G1-cell по зимнику: зимой быстрее, в оттепель опасно или закрыто
G1-cell по реке: летом лодка, зимой лёд, весной опасная вода
```

Поля G1-ячейки должны позволять хранить не только координату, но и смысловое наполнение:

```text
grid_x
grid_y
grid_z
region_cell_code
cell_shape
region_cell_status
cell_size_km
crossing_base_gu
crossing_base_time_hours
terrain_profile
water_profile
road_profile
settlement_density
dominant_content
known_landmarks
canonical_corridors
neighbor_node_ids
```

`neighbor_node_ids` — кеш соседних узлов для редактора; источник истины о связях — `graph_edges`, не это поле.

Для `node_type = region_cell` на G1 обязательны: `grid_x`, `grid_y`, `grid_z`, `cell_size_km`, `crossing_base_gu`, `crossing_base_time_hours`, `region_cell_status` (CHECK в DDL). Уникальность ячейки в регионе: частичный уникальный индекс по `(region_id, grid_x, grid_y, grid_z)` при `scale_level = G1` и `node_type = region_cell`.

Переход между соседними G1-ячейками без формальной дороги оформляется ребром `edge_type = offroad_crossing` (см. §13.2), а не отдельной «магической» связью по координатам.

Крупные объекты не заменяют G1-ячейки, а накладываются на них.

Пример:

```text
Волховский путь = corridor_volkhov_route
проходит через несколько G1-cell
в каждой ячейке создаёт свои G2-узлы: берег, пристань, брод, лодочный путь, опасный участок, поселение
```

---

## 8. G2 — внутренний подграф G1-ячейки

G2 — это граф внутри одной дневной G1-ячейки.

Он отвечает на вопрос:

```text
что именно находится внутри этой дневной клетки и как через неё пройти
```

Одна G1-ячейка может иметь пустой, простой или сложный G2-подграф.

Примеры G2-узлов:

```text
участок дороги
лесная развилка
погост
село
деревня
брод
переправа
берег реки
монастырская слобода
лесной стан
зимовье
участок болота
участок озера
дорожная застава
след старого пути
```

Ориентиры GU для G2:

```text
1 GU = соседний хозяйственный участок / час пути
2–3 GU = близкая деревня, брод, погостовая округа
4–8 GU = переход между малыми местами внутри ячейки
8 GU = пересечение G1-ячейки по нормальному ходу
8–16 GU = трудное пересечение ячейки, обход или путь через сложную среду
```

G2 не обязан заранее заполняться полностью. В read-only базе можно хранить канонические G2-узлы для известных дорог, рек, городов, монастырей и крупных якорей. Остальное материализуется в party-базе только когда персонаж, слух, NPC, дорога или событие действительно касается этой ячейки.

---

## 9. G3 — граф конкретного места

G3 — граф внутри конкретного места: города, села, монастыря, торга, двора, пристани, крепости или большого хозяйственного узла.

Одна вершина G3 = часть места.

Для Новгорода примеры:

```text
ворота
конец города
торг
Софийская сторона
княжий двор
архиепископский двор
пристань
улица
мост
двор
церковь
мастерская
```

На этом уровне километры почти не нужны.

Используется время в минутах:

```text
scale: inside_place
base_time_minutes: 15–60
```

---

## 10. G4 — граф локаций

G4 — граф локаций внутри конкретного места.

Одна вершина G4 = зона внутри места.

Примеры:

```text
двор
сени
изба
амбар
пристань
церковный двор
ворота
навес
конюшня
берег
мастерская
склад
```

Типичное время:

```text
base_time_minutes: 1–15
```

---

## 11. G5 — сценический граф

G5 — точный сценический граф.

Одна вершина G5 = точка сцены.

Примеры:

```text
у двери
у печи
за телегой
возле сундука
под навесом
у лодки
у костра
у ворот
у колодца
возле лавки
в тени стены
```

Типичное время:

```text
base_time_minutes: 0–5
```

G5 нужен не для мировой карты, а для честной обработки:

1. видимости;
2. доступа;
3. скрытности;
4. кражи;
5. боя;
6. разговора;
7. предметов;
8. свидетелей;
9. расстояния внутри сцены;
10. занятых рук и быстрых действий.

---

## 12. Таблица масштабов

| scale_level | name | unit | typical_edge | use |
|---|---|---|---|---|
| G0 | world_region | route_chain | 3–30 travel_days и больше | Связь регионов, дальние пути, политическое и торговое давление. |
| G1 | region_cell | travel_day / GU | 1 клетка = 8 GU = 32 × 32 км; пересечение около 1 дня | Базовое покрытие региона дневными квадратами. |
| G2 | cell_subgraph | GU | 1–8 GU внутри клетки | Путь внутри G1-ячейки: дорога, лес, брод, деревня, берег, зимник. |
| G3 | place | minutes / local hours | 15–60 минут | Движение внутри города, села, монастыря, торга. |
| G4 | location | minutes | 1–15 минут | Двор → изба, ворота → пристань, улица → рынок. |
| G5 | scene | moments | 0–5 минут | У двери, за телегой, возле сундука, у печи. |

Для дальнего перемещения важна не только клетка, но и ребро внутри неё. Персонаж не “телепортируется из клетки в клетку”; он проходит через известный или найденный маршрут, а G1 задаёт масштаб и контейнер пространства.

---

---

## 12.5. Слоистая модель карты

Карта состоит не из одного типа «местности», а из **пяти слоёв**. Их нельзя смешивать в одной таблице `landscape_templates`.

```text
1. базовая природно-географическая среда     → landscape_templates + region_landscape_templates
2. водные объекты                             → water_body_templates + region_water_body_templates
3. инфраструктура движения                    → route_templates (+ graph_edges.route_template_id)
4. поселения и места                          → place_templates + region_place_templates
5. хозяйственное использование среды          → land_use_templates + region_land_use_templates
```

**Базовая среда** — природно-географическая основа узла: лес, болото, холмы, пойма, луг, степь. Отвечает на вопрос «какая природная среда лежит в основе», а не «есть ли дорога/деревня/пашня». **Береговая зона не является базовой средой G1.**

**Берег ≠ landscape.** Понятия `riverbank`, `lake_shore`, `coast` **запрещены** в `landscape_group` и как `primary_landscape_template_id` на G1. Берег — локальный узел G2–G5 (`location`, `scene_anchor`, `place_locations.location_type = riverbank|pier|ford`) или пояснение в `hydrology_notes`; допустим только при наличии `water_body_template` у узла или соседа.

**Канонические примеры G1 (лес + вода):**

```text
1. Лес + озеро:
   primary_landscape_template_id = lt_forest_mixed
   primary_water_body_template_id = wb_small_fresh_lake
   hydrology_notes = «лес покрывает большую часть ячейки; озеро — северо-западный сектор»

2. Лес + река:
   primary_landscape_template_id = lt_forest_mixed
   primary_water_body_template_id = wb_medium_fresh_river
   hydrology_notes = «река пересекает ячейку; лес по обоим берегам (берег — на G2)»

3. Лес + болото:
   primary_landscape_template_id = lt_forest_mixed
   primary_water_body_template_id = wb_bog_pool
   hydrology_notes = «лес на возвышенностях; болото — центральная низина»
```

**Итоговое правило заполнения G1:** `primary_landscape_template_id` = доминирующая **суша**; `primary_water_body_template_id` = доминирующий **водный объект** (если есть); `hydrology_notes` обязателен при воде; берег — только на G2–G5.

**Вода** — отдельный гидрологический слой: река, ручей, озеро, море, залив, протока; солёность, течение, глубина, питьевая пригодность, лёд, риски переправы. Водная поверхность **не** задаётся как `landscape_group = water`.

**Инфраструктура** — дороги, тропы, зимники, волоки, мосты, броды, переправы, речные пути. В канонической карте — `graph_edges`; шаблоны типов — `route_templates`.

**Поселения и места** — деревня, село, погост, город, монастырь, лесной стан, зимовье. Существуют **поверх** среды, не являются ландшафтом. Региональные правила генерации — `region_place_generation_rules` (бывш. fat `region_place_templates`).

**Хозяйственное использование** — пашня, покос, выгон, вырубка, бортный лес, охотничий участок. След человеческой деятельности поверх среды, не базовый ландшафт.

Формула узла и ребра:

```text
graph_node =
  базовая среда (primary/secondary landscape)
  + водный слой, если есть (primary/secondary water_body)
  + хозяйственное использование, если есть (land_use_template_ids)
  + место/поселение, если есть (place_template_id)
  + редакторские summary-поля (terrain_profile, water_profile, …)

graph_edge =
  тип движения (route_template_id)
  + среда прохождения (landscape_template_id)
  + водный слой, если путь связан с водой (water_body_template_id)
  + сезонность, доступ, риск
```

Пример «деревня в лесу»:

```text
лес           = landscape_template
деревня       = place_template / place / graph_node node_type=place
дорога        = graph_edge + route_template
пашня рядом   = land_use_template
```

**Смешанная среда** не является отдельным `landscape_group`. Смесь задаётся только через `primary_landscape_template_id`, `secondary_landscape_template_ids`, `landscape_mix_notes`. Значения `mixed`, `water`, `road`, `winter_road`, `settlement`, `urban`, `field` (пашня) **запрещены** в `landscape_group`.

LLM выбирает шаблоны только через региональные JOIN:

```text
regions → region_landscape_templates → landscape_templates
regions → region_water_body_templates → water_body_templates
regions → region_land_use_templates → land_use_templates
regions → region_place_templates → place_templates
```

**Hard validation (§13.7, seed в `llm_validation_rules`):**

```text
LLM не может создать новый landscape slug.
LLM не может использовать mixed/water/road/winter_road/settlement/urban/field как landscape_group.
LLM не может использовать riverbank/lake_shore/coast как landscape_group или primary_landscape на G1.
LLM не может использовать пашню как landscape_template — только land_use_templates.
LLM выбирает ландшафт только из region_landscape_templates JOIN.
LLM выбирает водный тип только из region_water_body_templates JOIN.
LLM выбирает тип места только из region_place_templates JOIN.
LLM выбирает хозяйство только из region_land_use_templates JOIN.
При primary_water_body_template_id на G1 — заполнить hydrology_notes (warning).
Река/озеро/болото/ручей — water_body_templates, не landscape.
secondary_landscape_template_ids / secondary_water_body_template_ids / land_use_template_ids:
  все id должны существовать в справочнике и быть разрешены для region_id (trigger validate_template_region_link).
```

Seed правил: `npm run world-db:seed-llm-validation-landscape` (6 правил: val_no_shore_landscape_g1, val_g1_landscape_dominance, val_g1_water_layer, val_shore_local_only, val_hydrology_notes, val_water_examples).

---

## 13. Канонические таблицы read-only базы

### 13.1. `graph_nodes`

`graph_nodes` хранит канонические узлы карты. Для G1 это дневные квадратные ячейки региона; для G2-G5 — вложенные узлы внутри ячейки, места, локации и точки сцены.

```text
id
slug
title
node_type
scale_level
parent_node_id
region_id
place_id

grid_x
grid_y
grid_z
region_cell_code
cell_shape
region_cell_status
cell_size_km
crossing_base_gu
crossing_base_time_hours

primary_landscape_template_id
secondary_landscape_template_ids
landscape_mix_notes

primary_water_body_template_id
secondary_water_body_template_ids
hydrology_notes

land_use_template_ids
place_template_id

terrain_profile
water_profile
road_profile
settlement_density
dominant_content
known_landmarks
canonical_corridors
neighbor_node_ids

historical_status
is_known_to_player_default
is_known_to_character_default
summary
status
confidence
sources
audit_notes
created_at
updated_at
```

Поля `grid_x`, `grid_y`, `grid_z`, `region_cell_code`, `cell_shape`, `region_cell_status`, `cell_size_km`, `crossing_base_gu`, `crossing_base_time_hours`, `primary_landscape_template_id`, `terrain_profile`, `water_profile`, `road_profile`, `settlement_density`, `dominant_content`, `known_landmarks`, `canonical_corridors` обязательны для `node_type = region_cell` на G1 (часть — через CHECK в DDL). Для G3–G5 координатные и ячеечные поля могут быть пустыми.

**Источник истины слоёв:** FK и JSON-ссылки на шаблоны (см. §12.5). Поля `terrain_profile`, `water_profile`, `road_profile`, `settlement_density`, `dominant_content` — **legacy/editor hint**, не источник истины.

**Ландшафт:** `primary_landscape_template_id` (FK → `landscape_templates`). `secondary_landscape_template_ids` — JSON дополнительных **природных** сред; смесь **не** через `landscape_group = mixed`.

**Вода:** `primary_water_body_template_id`, `secondary_water_body_template_ids` (FK/JSON → `water_body_templates`).

**Хозяйство:** `land_use_template_ids` (JSON → `land_use_templates`).

**Место:** `place_template_id` (FK → `place_templates`, не `region_place_generation_rules`).

Для G1 `region_cell` поле `primary_landscape_template_id` обязательно (CHECK). Значение должно существовать в `region_landscape_templates` для `region_id` узла — composite FK и trigger `validate_template_region_link`.

`neighbor_node_ids` — JSON-кеш id соседних `graph_nodes` для удобства редактора; **не** источник истины. Канонические связи между узлами хранятся только в `graph_edges`.

`node_type`:

```text
world_region
region_cell
cell_subgraph
map_corridor
geographic_landmark
historical_landmark
subregion
place
location
minilocation
scene_anchor
route_junction
river_junction
ford
ferry
gate
road_segment
water_segment
border_crossing
sea_crossing
mountain_pass
desert_oasis
steppe_camp
```

---

### 13.2. `graph_edges`

`graph_edges` хранит канонические связи карты.

```text
id
from_node_id
to_node_id
reverse_edge_id
scale_level
edge_type

base_gu
base_distance_km
base_time_minutes
base_time_hours
base_time_days

route_template_id
landscape_template_id
water_body_template_id
terrain_type
route_surface
seasonal_rule
access_rule
risk_level
known_to_commoners
known_to_traders
known_to_elites
known_to_clergy
known_to_character_default

requires_guide
requires_boat
requires_horse
requires_sled
requires_permission
requires_orientation_check
orientation_difficulty
movement_risk_profile
failure_consequences

historical_status
status
confidence
sources
audit_notes
created_at
updated_at
```

`edge_type`:

```text
road
path
river
lake_route
sea_route
winter_road
ford
ferry
bridge
gate
street
door
yard_passage
forest_track
offroad_crossing
mountain_pass
desert_route
steppe_route
border_transition
corridor_segment
portage
```

Семантика новых типов:

```text
offroad_crossing — переход между соседними G1-ячейками без формальной дороги; базовое время по GU, но с риском ориентирования (requires_orientation_check, orientation_difficulty, movement_risk_profile, failure_consequences)
corridor_segment — участок крупного коридора (торговый путь, речной маршрут, зимник), проходящего через одну или несколько G1-ячеек; не заменяет G1-ячейку, а накладывается на сетку
portage — волок: перенос груза/транспорта в обход непроходимого участка (брод, порог, болото, перевал) между двумя проходимыми сегментами
```

Поля ориентирования и риска пути:

```text
requires_orientation_check — нужна ли проверка поиска направления (типично для offroad_crossing)
orientation_difficulty — none, easy, ordinary, hard, dangerous, extreme
movement_risk_profile — JSON: риски пути (lost_time, getting_lost, fatigue, wild_animals, …)
failure_consequences — JSON: последствия провала (lose_1d4_hours, exit_to_wrong_neighbor_cell, …)
```

Для `edge_type = offroad_crossing` поле `landscape_template_id` **обязательно** (CHECK).

Для `edge_type IN (river, lake_route, sea_route, ford, ferry, bridge)` поле `water_body_template_id` **обязательно** (CHECK).

Для `edge_type IN (road, path, forest_track, winter_road, portage, corridor_segment)` поле `route_template_id` **обязательно** (CHECK).

`landscape_template_id` проверяется trigger `validate_template_region_link` по региону `from_node_id`. Поля `terrain_type`, `route_surface` — legacy-текст.

### 13.3. `graph_scale_rules`

`graph_scale_rules` фиксирует правила масштаба.

```text
id
scale_level
title
unit
typical_edge_min
typical_edge_max
time_unit
uses_gu
uses_minutes
summary
game_use
limits
status
confidence
sources
audit_notes
created_at
updated_at
```

Для G1 базовое правило в `graph_scale_rules` (метрики ячейки — на узлах `graph_nodes`, см. §7 и §13.1):

```text
scale_level: G1
unit: region_cell
typical_edge_min: 8
typical_edge_max: 8
time_unit: GU
uses_gu: true
summary: дневная квадратная ячейка региона; пересечение в нормальных условиях занимает около одного ходового дня
```

Рекомендуемые значения для узлов `graph_nodes` с `node_type = region_cell` (не колонки `graph_scale_rules`):

```text
cell_size_km: 32
crossing_base_gu: 8
crossing_base_time_hours: 8
```

---

### 13.4. `graph_edge_modifiers`

`graph_edge_modifiers` фиксирует модификаторы пути.

```text
id
title
modifier_type
applies_to_edge_type
applies_to_terrain_type
applies_to_season
landscape_template_id
multiplier
summary
example
game_use
limits
status
confidence
sources
audit_notes
created_at
updated_at
```

`modifier_type`:

```text
terrain
season
weather
load
access
visibility
stealth
injury
transport
risk
```

Примеры seed-записей для `offroad_crossing` (см. `scripts/seed-graph-edge-modifiers.js`):

```text
mod_offroad_forest — лес без дороги, ×2
mod_offroad_swamp — болото, ×3
mod_offroad_snow — зимний снег вне дороги, ×1.5
mod_offroad_rasputitsa — распутица вне дороги, ×2
```

Для terrain-модификаторов рекомендуется заполнять `landscape_template_id` (см. seed: `mod_offroad_forest` → `forest_mixed`, `mod_offroad_swamp` → `swamp`). Поле `applies_to_terrain_type` сохраняется для совместимости.

---

### 13.5. `landscape_templates`

Справочник **базовой природно-географической среды** (суша / поверхность). Не описывает дороги, воду, поселения, пашню, **берег**.

```text
id
slug
title NOT NULL
parent_landscape_template_id
landscape_group
base_environment NOT NULL
dominant_vegetation
forest_type
moisture_level
relief_type
soil_ground_type
openness
seasonal_stability
summary
base_movement_multiplier
default_orientation_difficulty
base_risk_level
game_use
limits
status
confidence
sources
audit_notes
created_at
updated_at
```

`landscape_group` (только природные группы **суши**): `forest`, `swamp`, `meadow`, `floodplain`, `hill`, `ravine`, `steppe`, `marsh`, `bog`, `mountain`, `desert`. **Запрещены:** `mixed`, `water`, `road`, `winter_road`, `settlement`, `urban`, `field`, **`riverbank`, `lake_shore`, `coast`** (берег — G2–G5 или hydrology_notes).

Seed: 27 шаблонов — `npm run world-db:seed-landscapes` (без lt_riverbank_*, lt_lake_shore_*, lt_coast_*).

Смешение сред — только через `primary_landscape_template_id` + `secondary_landscape_template_ids` на `graph_nodes`.

**`game_use` / `limits`:** у всех 27 строк seed одинаковый `game_use` — базовая природная среда для `primary_landscape_template_id`, `secondary_landscape_template_ids` и `offroad_crossing`; общий `limits` запрещает использовать запись как дорогу, поселение, пашню, воду или берег. Дополнения: `lt_bog_dominant`, `lt_swamp_dominant`, `lt_marsh_dominant` — только когда болото/топь доминирует в G1; `lt_floodplain`, `lt_floodplain_wooded` — не как обычный берег реки, берег/брод/пристань только G2–G5.

---

### 13.6. `region_landscape_templates`

Связь региона с допустимыми **базовыми природными** средами. Не содержит дорог, зимников, поселений, пашен, общих водных поверхностей.

```text
id
region_id
landscape_template_id

is_allowed
is_common
is_dominant
is_rare
generation_weight

allowed_scale_levels
allowed_node_types
regional_limits

game_use
limits
status
confidence
sources
audit_notes
created_at
updated_at
```

`UNIQUE (region_id, landscape_template_id)`. Для Новгородской земли (`reg_novgorod_land`) — seed 14 связей после ручного создания региона: `npm run world-db:seed-region-landscapes`.

Пример ограничения: `urban_zone` → `allowed_scale_levels: ["G2","G3"]`, `allowed_node_types: ["place","location"]`, note в `regional_limits`.

**LLM validation landscape** — правила в §12.5 и seed `llm_validation_rules`: `npm run world-db:seed-llm-validation-landscape`.

---

### 13.7. `water_body_templates` и `region_water_body_templates`

Типы водных объектов (не конкретная река/озеро). Поля: `water_body_type`, `salinity`, `flow_type`, `typical_depth`, `supports_boat/ford/ferry/bridge`, `freeze_pattern`, `flood_risk`, …

**Seed-каталог (34 типа, Северо-Запад / RUS13):** `npm run world-db:export-water-bodies && npm run world-db:seed-water-bodies`

Канон: `infra/world-base/water_body_templates_final.xlsx` → `water_body_templates.seed.json`.

```text
Источники/ручьи: wb_spring, wb_stream, wb_forest_stream, wb_small_river, wb_medium_fresh_river,
  wb_large_river, wb_river_rapid, wb_mountain_stream, wb_protoka, wb_river_meander, wb_river_ford_zone
Пойма/разлив:    wb_backwater, wb_oxbow, wb_flood_channel, wb_seasonal_pool
Озёра/пруды:     wb_small_fresh_lake, wb_medium_fresh_lake, wb_large_fresh_lake, wb_ilmen_scale_lake,
  wb_ladoga_scale_lake, wb_forest_lake, wb_floodplain_lake, wb_peat_lake, wb_pond
Болота/каналы:   wb_bog_pool, wb_marsh_channel, wb_delta_channel
Море/заливы:     wb_estuary, wb_brackish_lagoon, wb_gulf, wb_strait, wb_sea_coast_water, wb_open_sea, wb_salt_lake
```

Вода на G1 — через `primary_water_body_template_id`, не через `landscape_group`. Берег — G2–G5.

`region_water_body_templates`: `UNIQUE(region_id, water_body_template_id)`, `generation_weight >= 0`.

### 13.8. `route_templates`

Шаблоны типов движения (`route_kind`, `default_edge_type`, `supports_pedestrian/horse/cart/sled/boat`, …). Не заменяет `graph_edges`.

**Seed-каталог (18 типов):** `npm run world-db:export-routes && npm run world-db:seed-routes`

Канон: `infra/world-base/route_templates_clean.tsv` → `route_templates.seed.json`.

```text
Сухопутные:      rt_major_road, rt_local_road, rt_path, rt_forest_track, rt_offroad_crossing, rt_winter_road
Водные переходы: rt_ford, rt_ferry, rt_bridge
Водные ходы:     rt_river_route, rt_lake_route, rt_sea_route
Спец.:           rt_portage, rt_mountain_pass, rt_steppe_route, rt_desert_route
Мета:            rt_border_transition, rt_corridor_segment
```

`requires_water_body_template=true` только у ford/ferry/bridge/river/lake/sea. `requires_landscape_template=false` у водных переходов/ходов, border/corridor; у portage — `true`.

### 13.9. `land_use_templates` и `region_land_use_templates`

Хозяйственное использование среды (пашня, покос, …). `region_land_use_templates`: `UNIQUE(region_id, land_use_template_id)`.

**Seed-каталог (50 типов, Северо-Запад / RUS13):** `npm run world-db:export-land-uses && npm run world-db:seed-land-uses`

Канон: `infra/world-base/land_use_templates_expanded_v2.xlsx` → `land_use_templates.seed.json`.

```text
Пашня/огород:  lu_rainfed_arable, lu_fallow_field, lu_slash_burn_cultivation, lu_kitchen_garden,
  lu_market_garden, lu_irrigated_field, lu_terraced_field, lu_rice_paddy, lu_oasis_cultivation,
  lu_orchard, lu_vineyard, lu_olive_grove, lu_date_palm_grove, lu_sugarcane_field, lu_cotton_field,
  lu_hemp_flax_plot, lu_dye_crop_plot, lu_mulberry_sericulture, lu_tea_garden
Сенокос/пастбище: lu_hay_meadow, lu_floodplain_haymaking, lu_common_pasture, lu_wood_pasture,
  lu_pannage, lu_steppe_grazing, lu_mountain_pasture, lu_leaf_fodder_cutting
Лес/промысел:  lu_timber_harvesting, lu_fuelwood_gathering, lu_coppice_management, lu_pollarding,
  lu_charcoal_burning, lu_pitch_tar_working, lu_bark_bast_harvesting, lu_bort_beekeeping,
  lu_wild_gathering, lu_hunting, lu_fur_trapping
Вода/рыба:     lu_fishing, lu_fish_weir, lu_fishpond_aquaculture, lu_reed_cutting
Добыча:        lu_peat_cutting, lu_salt_working, lu_shore_working, lu_clay_extraction,
  lu_stone_quarrying, lu_sand_gravel_extraction, lu_bog_iron_ore_extraction, lu_ore_mining
```

Пашня — `land_use_templates`, не `landscape_templates`. Региональные связки — вручную в NocoDB (`region_land_use_templates`).

### 13.10. `place_templates` и `region_place_templates`

Глобальный справочник типов мест (`place_kind`, `compatible_*_template_ids`, …). Тонкая связка `region_place_templates`: какие типы мест разрешены в регионе.

**Seed-каталог (57 типов, Северо-Запад / RUS13):** `npm run world-db:export-places && npm run world-db:seed-places`

Канон: `infra/world-base/place_templates_final.xlsx` → `place_templates.seed.json`.

```text
Поселения:          pt_isolated_farmstead, pt_hamlet, pt_village, pt_large_church_village,
  pt_manor_estate, pt_market_town, pt_town, pt_fortified_town, pt_posad_suburb, pt_port_city,
  pt_desert_oasis
Религиозные:        pt_pogost_center, pt_rural_churchyard, pt_monastic_grange, pt_monastery,
  pt_abbey_priory, pt_convent_nunnery, pt_khanqah_zawiya, pt_hermitage_skete, pt_ribat,
  pt_pilgrimage_shrine
Хозяйство/промысел: pt_seasonal_pastoral_camp, pt_wintering_hut, pt_nomad_camp, pt_steppe_camp,
  pt_forest_camp, pt_hunting_camp, pt_fishing_station, pt_fish_weir_site, pt_market_place,
  pt_periodic_fairground, pt_watermill_site, pt_windmill_site, pt_saltworks, pt_mine, pt_quarry,
  pt_clay_pit_pottery_site, pt_iron_smelting_site, pt_shipyard_boatyard
Оборона/власть/дорога: pt_river_landing, pt_sea_harbor, pt_boat_landing, pt_ford_place,
  pt_ferry_place, pt_bridge_place, pt_portage_place, pt_crossroads, pt_roadside_inn,
  pt_caravanserai_khan, pt_relay_station, pt_toll_customs_post, pt_border_outpost,
  pt_watchtower_outpost, pt_fortress_castle, pt_hillfort_gorodishche, pt_military_camp,
  pt_administrative_court
```

Региональные связки — вручную в NocoDB (`region_place_templates`). `region_place_generation_rules` — отдельно (§13.11).

### 13.11. `region_place_generation_rules`

Региональные **правила генерации** мест (бывш. fat `region_place_templates`): `template_type`, `layout_rules`, `npc_generation_rules`, … FK из `places.template_id`, `place_generation_limits`, `location_object_rules`.

---

## 14. Изменяемые таблицы базы партии

### 14.1. `party_graph_nodes`

Хранит узлы, которые были материализованы или изменены в партии.

```text
id
canonical_node_id
party_id
slug
title
node_type
scale_level
parent_node_id
region_id
place_id
is_materialized
is_known_to_character
is_known_to_player
visible_name
hidden_state
current_state
created_by_llm_step
created_at_game_time
updated_at_game_time
```

### 14.2. `party_graph_edges`

Хранит маршруты и связи, которые существуют в конкретной партии.

```text
id
canonical_edge_id
party_id
from_party_node_id
to_party_node_id
reverse_party_edge_id
scale_level
edge_type

base_gu
current_time_minutes
current_time_hours
current_access
current_conditions
current_risk
current_seasonal_state
is_known_to_character
is_known_to_player
is_blocked
block_reason
last_used_at_game_time
created_by_llm_step
updated_at_game_time
```

### 14.3. `party_map_knowledge`

Хранит не фактическую карту, а карту знаний персонажа.

```text
id
party_id
character_id
node_id
edge_id
knowledge_type
knowledge_accuracy
source_of_knowledge
first_learned_at
last_confirmed_at
visible_description
false_or_outdated_notes
```

`knowledge_type`:

```text
known_exact
known_rough
heard_rumor
seen_from_distance
inferred
unknown
false_belief
```

### 14.4. `party_route_journal`

Хранит историю перемещений.

```text
id
party_id
character_id
from_node_id
to_node_id
edge_id
started_at_game_time
ended_at_game_time
travel_time_minutes
conditions
risk_result
state_cost
visible_result
hidden_result
notes
```

---

## 15. Применение к Новгородской земле

Новгородская земля в этой модели — один G0-регион. Внутри него создаётся не один “смысловой” G1-граф из крупных направлений, а сетка дневных G1-ячеек.

Базовая практическая модель:

```text
Новгородская земля = G0-регион
G1 = дневная квадратная ячейка региона
размер G1 = 32 × 32 км
пересечение G1 = около 1 travel_day в нормальных условиях
G2 = внутренний подграф конкретной G1-ячейки
G3-G5 = место, локация, точка сцены
```

Для грубой размерной модели Новгородского региона можно использовать современную Новгородскую область как технический proxy, но не как точную историческую границу XIII века. Если брать площадь около 54,5 тыс. км² и G1-клетку 32 × 32 км, получается:

```text
площадь G1-клетки = 32 × 32 = 1024 км²
54500 / 1024 ≈ 53 активные клетки
```

Из-за неровной формы региона, водных пространств, лесов, болот, пограничных зон и неточности исторической границы рабочий диапазон лучше задавать не одним числом, а нормой покрытия:

```text
Новгородская земля:
  координатная рамка: примерно 12 × 9 G1-клеток
  всего клеток в рамке: около 108
  активных клеток региона: примерно 55–70
  внешних, пустых, спорных или пограничных клеток рамки: примерно 35–50
```

Это отражает реальный размер: регион не становится маленьким набором из 10–15 узлов, но и не требует сразу вручную расписывать каждую деревню.

Крупные реальные и смысловые объекты Новгородской земли накладываются поверх G1-сетки:

```text
Великий Новгород = place / historical_landmark внутри одной или нескольких G1-клеток
озеро Ильмень = geographic_landmark / water_area, занимающий несколько G1-клеток
Волховский путь = map_corridor / water_corridor через цепочку G1-клеток
Мстинское направление = map_corridor через цепочку G1-клеток
Ловатское направление = map_corridor через цепочку G1-клеток
Шелонское направление = map_corridor через цепочку G1-клеток
Торжокское направление = road_corridor через цепочку G1-клеток
Псковское пограничье = border_zone на краю G1-сетки
лесные и болотные зоны = terrain_profile нескольких G1-клеток
```

Пример записи G1-ячейки:

```text
id: g1_nov_06_04
region_id: reg_novgorod_land
scale_level: G1
node_type: region_cell
grid_x: 6
grid_y: 4
grid_z: 0
region_cell_code: nov_06_04
region_cell_status: active
cell_size_km: 32
crossing_base_gu: 8
crossing_base_time_hours: 8
terrain_profile: forest_river_mixed
water_profile: small_rivers_and_wetlands
road_profile: local_road_or_winter_path
settlement_density: low_to_medium
dominant_content: road_and_forest
known_landmarks: null / linked ids
canonical_corridors: corridor_volkhov_route / corridor_msta_route / etc.
status: usable_with_caution
```

Пример внутреннего G2-подграфа одной G1-ячейки:

```text
G1-cell: g1_nov_06_04
G2-узлы внутри:
  участок дороги
  лесная развилка
  брод
  деревня
  берег реки
  зимняя тропа
```

Пустая или слабонаселённая ячейка тоже допустима:

```text
G1-cell: g1_nov_02_07
внутри:
  лес
  болото
  зимняя тропа
  один охотничий стан
  нет постоянного поселения
```

То есть между регионами нет “пустого пространства”. Есть G1-ячейки, пограничные переходы, дороги, речные пути, переправы, волоки, зоны влияния, промежуточные узлы, спорные территории, сезонные пути и области, известные только по слуху.

Каждый такой элемент принадлежит одному из типов:

```text
region_cell
cell_subgraph
map_corridor
geographic_landmark
historical_landmark
border_transition
water_segment
road_segment
seasonal_route
```

---

## 16. Практическое правило для LLM

Для LLM и базы фиксируется правило:

```text
Карта мира строится как вложенный граф.
G0-регионы берутся из world_regions.
Внутри каждого G0-региона создаётся G1-сетка дневных квадратных ячеек.
1 G1-ячейка = примерно 32 × 32 км.
Пересечение G1-ячейки в нормальных условиях = 1 travel_day = 8 GU = 32 км.
1 GU = 4 км = 1 час обычного пешего пути по нормальной дороге.
Реальное время пути считается не по прямой и не по названию региона, а по ребру графа с модификаторами дороги, сезона, груза, риска, доступа, состояния персонажа и транспорта.
Крупные объекты вроде города, озера, реки, торгового пути или пограничья не являются G1-сеткой сами по себе. Они накладываются на G1-сетку как места, исторические якоря, географические якоря, коридоры и подграфы.
Короткие перемещения внутри места считаются минутами, а не GU.
Ручная база только читается.
Все изменения, открытия, блокировки и состояния маршрутов пишутся в базу конкретной партии.
```

Запрет для LLM:

```text
Не трактовать G1 как “Новгород”, “Волхов”, “Ильмень” или “Торжокское направление”.
G1 — это дневная ячейка пространства.
Новгород, Волхов, Ильмень и направления — это содержимое, якоря или коридоры, проходящие через G1-ячейки.
```

---

## 17. Правила валидации

Перед добавлением канонического узла в read-only базу нужно проверить:

1. узел относится к допустимому региону RUS13;
2. узел имеет `scale_level`;
3. узел имеет `parent_node_id`, если это не G0;
4. если это G1-ячейка (`node_type = region_cell`), у неё есть `grid_x`, `grid_y`, `grid_z`, `cell_size_km`, `crossing_base_gu`, `crossing_base_time_hours`, `region_cell_status`, `primary_landscape_template_id`, `terrain_profile` и `dominant_content`; координаты уникальны в регионе; `primary_landscape_template_id` из `region_landscape_templates` региона;
5. если это крупный город, река, озеро, дорога или направление, он не записан как G1-ячейка, а оформлен как место, якорь, коридор или G2/G3-подграф;
6. узел не дублирует уже существующий узел;
7. у узла есть причинное основание;
8. исторический статус помечен явно;
9. спорные сведения имеют статус `draft`, `usable_with_caution` или `needs_review`.
10. **берег (`riverbank`, `lake_shore`, `coast`) не используется как `primary_landscape_template_id` на G1** — только `water_body_templates` + `hydrology_notes`; берег оформляется на G2–G5 при наличии водного слоя;
11. при `primary_water_body_template_id` на G1 заполнен `hydrology_notes`.

Перед добавлением канонического ребра нужно проверить:

1. оба узла существуют;
2. масштаб ребра соответствует масштабу узлов;
3. есть `edge_type`;
4. для `offroad_crossing` есть `landscape_template_id` из `region_landscape_templates` региона `from_node_id`;
5. есть `base_gu` или минутное время для G3–G5;
6. есть правило сезонности или явно указано, что путь круглогодичный;
7. есть правило доступа;
8. есть риск;
9. есть обратное ребро или причина, почему путь односторонний;
10. есть источники или пометка о допустимом допущении.

Перед записью маршрута в базу партии нужно проверить:

1. персонаж знает путь или имеет способ его искать;
2. путь физически возможен;
3. условия не делают путь невозможным;
4. учтено время;
5. учтён риск;
6. обновлены состояние тела, NPC, место и события;
7. обновлена карта знаний персонажа;
8. скрытая карта не раскрыта игроку без основания.

---

## 18. Короткая формула всей системы

```text
read-only база:
  регионы + G1-сетки + канонические графы + источники + правила

G1:
  дневная квадратная ячейка региона, а не город, река или направление

партия:
  материализованные узлы + изменённые ребра + знания персонажа + последствия

путь:
  G1-клетка / ребро графа + GU/минуты + условия + доступ + риск + время + состояние

карта игрока:
  не фактический мир, а знание персонажа
```

---

## 19. Итог

Система GU даёт универсальность без фальшивой точности.

Мир можно покрыть целиком через графы, но игра будет детализировать только те подграфы, до которых дошёл персонаж, слух, NPC, историческое событие или последствия партии.

Ручная база остаётся чистым источником истины и не загрязняется игровыми изменениями. Каждая партия получает собственную базу, где фиксируется всё изменяемое состояние.

---

# Справочная ручная база проекта

Этот раздел описывает таблицы ручной базы, которую человек заполняет в NocoDB/PostgreSQL. Эта база используется только для чтения игровым кодом и LLM-пайплайном.

Смысловая база не является художественной прозой и не является состоянием партии. Это справочный слой: регионы, источники, правила, типовые шаблоны, исторические якоря, профессии, социальные роли, предметы, риски, сезонность и канонический граф.

Секция `routes` из старого варианта заменена на графовые таблицы. В ручной базе используются `graph_nodes` и `graph_edges`. В party-базе используются `party_graph_edges`, `party_map_knowledge` и `party_route_journal`.

**Терминология:** в read-only схеме слова `route` / `routes` в именах полей (`trade_graph_edges`, `route_knowledge`, `road_modifiers` и т.п.) означают **канонический коридор графа** (`graph_edge`), а не удалённую таблицу `routes` и не изменяемый маршрут партии.

## 0. Общие поля почти для всех справочных таблиц

Эти поля можно добавлять почти в каждую таблицу:

```text
id
region_id
title
slug
summary
game_use
limits
status
confidence
sources
audit_notes
created_at
updated_at
```

`status` и `confidence` — **разные** поля с разными enum; не смешивать.

`status` — рабочий процесс утверждения записи:

```text
draft
usable_with_caution
approved
needs_review
conflict
rejected
```

`confidence` — эпистемическая уверенность в достоверности содержимого (по умолчанию `unknown`):

```text
unknown
low
medium_low
medium
medium_high
high
```

Каждая запись должна иметь `status`, `confidence`, источник и возможность последующей проверки. Базовая карточка также содержит название, тип, регион, период, summary, game_use, limits, sources, created_at и audit_notes.

**50 read-only таблиц** в схеме `world_base` (слой карты: +7 таблиц шаблонов/связок, rename `region_place_templates` → `region_place_generation_rules`); party-таблицы описаны в §14 и **не входят** в `world_base`.

---

# 1. `regions`

Главная таблица регионов.

```text
id
slug
canonical_name
display_name
alt_names
region_type
parent_region_id
period_start_year
period_end_year

summary
geographic_scope
natural_landscape
climate_summary
seasonal_rules
waterways_summary
roads_summary
settlement_logic_summary

political_summary
ruling_power
administrative_structure
law_summary
custom_summary
religion_summary
social_order_summary
economy_summary
military_pressure_summary
historical_context_summary

neighbor_regions
external_pressure_summary
common_risks_summary
npc_common_knowledge_summary

llm_generation_rules
llm_forbidden_assumptions
llm_context_summary
validation_notes

status
confidence
sources
audit_notes
created_at
updated_at
```

---

# 2. `region_neighbors`

Связи между регионами.

```text
id
region_id
neighbor_region_id
direction
border_type
connection_type

trade_connection
military_pressure
political_relation
cultural_relation
religious_relation
route_connection_summary

known_to_commoners
known_to_traders
known_to_elites
known_to_clergy

game_use
limits
status
confidence
sources
audit_notes
created_at
updated_at
```

---

# 3. `region_laws`

Право, обычай, запреты, наказания.

```text
id
region_id
title
slug
law_type

applies_to_statuses
applies_to_roles
applies_to_places
period_start_year
period_end_year

summary
rule_text
custom_basis
authority_enforcing
punishment_or_consequence
dispute_resolution
property_effect
violence_effect
weapon_effect
travel_effect
trade_effect
religious_effect

who_knows_this
npc_behavior_effect
player_risk
game_use
limits

status
confidence
sources
audit_notes
created_at
updated_at
```

`law_type`:

```text
property
violence
weapon
travel
hospitality
debt
trade
religious
status
punishment
court
tax
custom
```

---

# 4. `region_economy`

Экономика, ресурсы, промыслы, товары.

```text
id
region_id
title
slug
economy_type

resource_or_activity
production_method
seasonality
required_landscape
required_settlement_type
required_tools
required_roles
labor_intensity
wealth_level
risk_level

goods_produced
goods_consumed
goods_imported
goods_exported
trade_graph_edges
market_access
storage_requirements
spoilage_or_loss_risk

who_controls_it
tax_or_duty
social_status_link
conflict_potential

game_use
limits
status
confidence
sources
audit_notes
created_at
updated_at
```

`economy_type`:

```text
farming
fishing
hunting
fur
beekeeping
logging
charcoal
tar
iron
salt
livestock
craft
trade
transport
monastery_economy
military_supply
```

---

# 5. `region_social_roles`

Социальные роли и статусы.

```text
id
region_id
title
slug
role_group

status_level
free_status
dependency_type
wealth_level
legal_capacity
mobility_level
social_respect
vulnerability_level

allowed_occupations
forbidden_occupations
allowed_weapons
forbidden_weapons
allowed_places
restricted_places
property_rights
travel_rights
trade_rights
court_rights
tax_obligations
service_obligations

typical_clothing
typical_equipment
typical_knowledge
typical_speech_register
typical_fears
typical_goals

who_commands_them
who_protects_them
who_can_punish_them
relation_to_church
relation_to_power

npc_generation_rules
player_character_rules
game_use
limits

status
confidence
sources
audit_notes
created_at
updated_at
```

`role_group`:

```text
elite
clergy
warrior
merchant
craftsman
peasant
dependent
slave
servant
outsider
marginal
official
```

---

# 6. `region_occupations`

Профессии и занятия.

```text
id
region_id
title
slug
occupation_group

summary
allowed_social_roles
forbidden_social_roles
typical_status
typical_wealth
typical_gender_age_rules

required_location_types
required_economy_types
required_tools
required_materials
produced_goods
services_provided
seasonality
work_rhythm
income_logic

typical_skills
typical_attributes
typical_clothing
typical_equipment
typical_risks
typical_knowledge
typical_contacts

settlement_generation_weight
npc_generation_weight
rarity
is_historical_fact
is_generated_allowed

game_use
limits
status
confidence
sources
audit_notes
created_at
updated_at
```

`occupation_group`:

```text
agriculture
fishing
forest
craft
trade
transport
military
religious
service
administration
criminal
healing
hospitality
```

---

# 7. `region_place_generation_rules`

Региональные правила генерации типовых мест (fat table; бывш. `region_place_templates`).

```text
id
region_id
title
slug
template_type

summary
generation_allowed
max_instances_per_region
min_distance_from_major_place
required_landscape
required_economy
required_route_access
required_water_access
seasonal_availability

typical_population_band
typical_household_count
typical_wealth_level
typical_authority
typical_social_roles
typical_occupations
typical_buildings
typical_animals
typical_tools
typical_goods
typical_food_sources
typical_risks
typical_conflicts

layout_rules
naming_rules
access_rules
law_rules
religion_rules
trade_rules
defense_rules

npc_generation_rules
item_generation_rules
route_generation_rules
historical_plausibility_rules

game_use
limits
status
confidence
sources
audit_notes
created_at
updated_at
```

`template_type`:

```text
village
fishing_village
forest_camp
charcoal_burner_camp
logging_camp
winter_hut
pogost
ferry
ford
roadside_inn
market_site
monastery_dependency
watch_post
hunting_camp
beekeeping_site
```

---

# 8. `places`

Конкретные места: исторические и утверждённые сгенерированные.

```text
id
region_id
template_id
slug
canonical_name
display_name
alt_names

place_type
historical_status
is_fixed_historical_place
is_generated_place
generation_source

period_start_year
period_end_year
summary
function_in_region
economic_basis
political_control
religious_control
legal_status
owner_or_holder
population_band
wealth_level

landscape
water_access
road_access
defense_level
market_level
craft_level
food_supply_level
risk_level

known_to_commoners
known_to_traders
known_to_elites
known_to_clergy
known_to_outsiders

visible_description
hidden_notes
map_notes
llm_generation_rules
llm_forbidden_changes

game_use
limits
status
confidence
sources
audit_notes
created_at
updated_at
```

`place_type`:

```text
city
posad
village
selo
pogost
monastery
fortress
yard
inn
ferry
ford
pier
market
road_segment
forest_camp
winter_hut
watch_post
border_zone
```

---

# 9. `place_locations`

Локации внутри места.

```text
id
region_id
place_id
slug
title
location_type

summary
function
access_rules
visibility_rules
who_controls_access
typical_npc_roles
typical_objects
typical_buildings
typical_sounds
typical_smells
typical_risks
social_rules
law_risks

connected_location_ids
entry_points
closed_zones
public_private_level
crowd_level
light_level
weather_exposure

llm_generation_rules
item_generation_rules
npc_generation_rules
game_use
limits

status
confidence
sources
audit_notes
created_at
updated_at
```

`location_type`:

```text
gate
street
market
yard
churchyard
riverbank
pier
house
hall
barn
stable
workshop
storehouse
forest_edge
road_approach
monastery_yard
fortification_wall
```

---

# 10. `place_minilocations`

Точные сценические зоны.

```text
id
region_id
place_id
location_id
slug
title
minilocation_type

summary
position_description
access_rules
visibility
cover_or_hiding
noise_level
light_level
weather_exposure
nearby_objects
nearby_npc_roles
possible_actions
movement_cost
risk_notes

connected_minilocation_ids
anchor_ids
game_use
limits

status
confidence
sources
audit_notes
created_at
updated_at
```

`minilocation_type`:

```text
near_door
near_hearth
under_shed
behind_cart
near_gate
near_table
near_chest
near_boat
near_well
at_threshold
in_shadow
beside_fire
```

---

# 11. `scene_anchors`

Точки сцены: дверь, сундук, колодец, костёр, повозка.

```text
id
region_id
place_id
location_id
minilocation_id
slug
title
anchor_type

summary
physical_description
is_fixed
is_movable
is_container
is_passage
is_obstacle
is_light_source
is_cover
is_dangerous

access_rules
visibility_rules
ownership_status
controller
condition
interaction_rules
risk_notes
linked_item_ids
linked_graph_edge_ids

game_use
limits
status
confidence
sources
audit_notes
created_at
updated_at
```

---

# 12. `place_buildings`

Постройки внутри места.

```text
id
region_id
place_id
location_id
slug
title
building_type

summary
function
owner_or_holder
controller
public_private_level
access_rules
legal_status
religious_status
wealth_level
condition
materials
size_band
floors_or_sections

typical_rooms
typical_objects
typical_npc_roles
typical_activities
storage_logic
locked_areas
hidden_area_policy
fire_risk
theft_risk
social_risk

game_use
limits
status
confidence
sources
audit_notes
created_at
updated_at
```

`building_type`:

```text
house
hut
barn
stable
storehouse
workshop
church
monastery_cell
gatehouse
tower
wall
bathhouse
mill
inn
warehouse
boathouse
smithy
```

---

# 13. `routes` — удалена из ручной базы

Эта таблица не используется в ручной read-only базе.

Причина: каноническая карта проекта хранится в `graph_nodes` и `graph_edges`, а изменяемые маршруты, открытые пути, состояние дорог, журнал движения и карта знаний персонажа пишутся только в базу конкретной партии.

Старое назначение `routes` распределено так:

```text
read-only база проекта:
  graph_nodes
  graph_edges
  graph_scale_rules
  graph_edge_modifiers

party-база конкретной игры:
  party_graph_nodes
  party_graph_edges
  party_map_knowledge
  party_route_journal
```

---

# 14. `historical_anchors`

Исторические якоря: города, монастыри, крепости, торги, крупные реки.

```text
id
region_id
place_id
slug
canonical_name
display_name
anchor_type

summary
historical_status
period_start_year
period_end_year
approximate_bearing
distance_band
zone_of_influence
access_graph_edges
visible_signs
economic_influence
political_influence
religious_influence
military_influence
trade_influence

character_knowledge_common
character_knowledge_trader
character_knowledge_elite
character_knowledge_clergy
character_knowledge_outsider

discovery_conditions
llm_use_rules
llm_forbidden_changes

game_use
limits
status
confidence
sources
audit_notes
created_at
updated_at
```

`anchor_type`:

```text
city
fortress
monastery
market
river
ford
ferry
road
winter_road
border
battle_site
princely_court
bishopric
```

---

# 15. `historical_events`

Исторические события и региональное давление.

```text
id
region_id
title
slug
event_type

period_start_year
period_end_year
approximate_date
date_confidence
historical_status

summary
cause
participants
affected_regions
affected_places
current_phase
phase_logic
local_signs
economic_effect
road_effect
law_effect
social_effect
military_effect
religious_effect
npc_knowledge_effect
rumor_effect

what_commoners_know
what_traders_know
what_elites_know
what_clergy_know
what_outsiders_know
hidden_truth_policy
future_knowledge_forbidden

game_use
limits
status
confidence
sources
audit_notes
created_at
updated_at
```

---

# 16. `historical_event_phases`

Фазы событий.

```text
id
event_id
region_id
phase_name
phase_order

date_start
date_end
date_confidence
trigger_condition

summary
visible_signs
hidden_processes
affected_places
affected_graph_edges
affected_roles
affected_goods
npc_behavior_changes
price_changes
security_changes
law_changes
rumor_templates

delayed_event_rules
what_character_can_know
what_character_cannot_know

game_use
limits
status
confidence
sources
audit_notes
created_at
updated_at
```

`phase_name`:

```text
background
omens
escalation
impact
aftermath
```

---

# 17. `historical_figures`

Исторические личности.

```text
id
region_id
title
slug
canonical_name
alt_names

figure_type
social_status
political_role
religious_role
military_role
period_start_year
period_end_year

summary
region_of_influence
linked_events
linked_places
current_location_policy
direct_encounter_policy
influence_method
orders_or_effects
reputation
what_commoners_know
what_traders_know
what_elites_know
what_clergy_know
what_outsiders_know

can_appear_directly
appearance_conditions
forbidden_uses
game_use
limits

status
confidence
sources
audit_notes
created_at
updated_at
```

---

# 18. `region_npc_knowledge`

Что знает NPC в зависимости от роли.

```text
id
region_id
social_role_id
occupation_id
knowledge_type

title
summary
knows_as_fact
knows_as_rumor
common_mistakes
cannot_know
taboo_topics
dangerous_to_say
who_they_trust
who_they_fear

regional_knowledge
local_place_knowledge
law_knowledge
economy_knowledge
religion_knowledge
historical_knowledge
route_knowledge
social_order_knowledge
price_knowledge

speech_style_notes
behavior_effect
game_use
limits

status
confidence
sources
audit_notes
created_at
updated_at
```

`knowledge_type`:

```text
common
role_based
occupation_based
elite
clergy
trader
outsider
local
rumor
false_belief
```

---

# 19. `region_npc_generation_rules`

Правила генерации NPC по региону.

```text
id
region_id
title
slug
npc_profile_type

applies_to_place_types
applies_to_location_types
allowed_social_roles
allowed_occupations
forbidden_roles
rarity_rules

name_rules
age_rules
gender_rules
status_rules
wealth_rules
clothing_rules
equipment_rules
speech_rules
knowledge_rules
fear_rules
goal_rules
authority_rules
reaction_to_strangers
reaction_to_violence
reaction_to_theft
reaction_to_trade
reaction_to_law

background_npc_minimum
scene_npc_minimum
key_npc_minimum

game_use
limits
status
confidence
sources
audit_notes
created_at
updated_at
```

`npc_profile_type`:

```text
background
scene
key
group
```

---

# 20. `region_material_culture`

Материальная культура региона.

```text
id
region_id
title
slug
material_category

summary
commonness
status_level
allowed_social_roles
restricted_social_roles
typical_places
typical_owners
typical_holders
typical_materials
typical_condition
typical_quality
typical_value_band
typical_marks
legal_status
social_risk
theft_risk
trade_risk

seasonality
economic_source
import_or_local
game_use
limits

status
confidence
sources
audit_notes
created_at
updated_at
```

`material_category`:

```text
clothing
tool
weapon
armor
food
livestock
container
transport
religious_item
trade_good
household_item
craft_material
luxury
document_or_mark
```

---

# 21. `item_templates`

Шаблоны предметов.

```text
id
region_id
material_culture_id
title
slug
item_type

summary
function
typical_material
weight_band
size_band
durability
quality_band
value_band
rarity
legal_status
social_status_signal

typical_owner_roles
typical_holder_roles
typical_locations
typical_containers
visibility_default
access_default
marking_default
risk_default

skill_use
attribute_use
possible_modifiers
failure_risks
damage_or_wear_rules

game_use
limits
status
confidence
sources
audit_notes
created_at
updated_at
```

---

# 22. `building_templates`

Шаблоны построек.

```text
id
region_id
title
slug
building_type

summary
allowed_place_types
allowed_location_types
required_economy
required_social_order
typical_owner
typical_controller
typical_users

materials
size_band
wealth_level
condition_band
layout_rules
room_templates
storage_rules
access_rules
locked_area_rules
hidden_area_rules
fire_risk
theft_risk
social_risk

typical_objects
typical_npc_roles
typical_activities
game_use
limits

status
confidence
sources
audit_notes
created_at
updated_at
```

---

# 23. `location_object_rules`

Правила появления объектов в локациях.

```text
id
region_id
place_template_id
place_id
location_type
building_type

object_category
item_template_id
probability_band
required_reason
required_owner
required_holder
visibility_default
access_default
legal_risk
social_risk
economic_justification

can_be_generated
must_be_pregenerated
forbidden_without_reason
container_policy
hidden_policy

game_use
limits
status
confidence
sources
audit_notes
created_at
updated_at
```

---

# 24. `region_risks`

Риски региона.

```text
id
region_id
title
slug
risk_type

summary
applies_to_places
applies_to_graph_edges
applies_to_roles
applies_to_occupations
seasonality
trigger_conditions
visible_signs
hidden_causes
possible_consequences

risk_level
frequency
avoidance_methods
mitigation_methods
npc_reactions
law_consequences
economic_consequences
body_state_consequences
item_consequences

game_use
limits
status
confidence
sources
audit_notes
created_at
updated_at
```

`risk_type`:

```text
road
weather
law
violence
theft
hunger
disease
wild_animals
social
religious
economic
war
fire
water
cold
```

---

# 25. `conflict_templates`

Типовые конфликты.

```text
id
region_id
title
slug
conflict_type

summary
applies_to_place_types
applies_to_roles
applies_to_occupations
trigger_conditions
participants
stakes
visible_signs
hidden_layers
possible_escalation
possible_resolution
law_involvement
authority_involvement
rumor_effect
relationship_effect
economic_effect

game_use
limits
status
confidence
sources
audit_notes
created_at
updated_at
```

`conflict_type`:

```text
debt
property
trade
family
labor
status
religious
road
theft
violence
tax
duty
stranger
resource
```

---

# 26. `rumor_templates`

Шаблоны слухов.

```text
id
region_id
title
slug
rumor_type

summary
source_role
spread_places
spread_graph_edges
affected_roles
linked_event_id
linked_place_id
linked_risk_id

truth_status
distortion_level
what_is_visible
what_is_hidden
who_believes_it
who_denies_it
danger_of_repeating
possible_effects
expiration_or_update_rule

game_use
limits
status
confidence
sources
audit_notes
created_at
updated_at
```

`truth_status`:

```text
true
false
distorted
unknown
mixed
```

---

# 27. `price_bands`

Цены и относительная ценность.

```text
id
region_id
title
slug
item_or_service_type

value_band
normal_price_description
cheap_condition
expensive_condition
scarcity_factors
seasonal_modifiers
war_modifiers
road_modifiers
status_modifiers
trade_place_modifiers

who_can_afford
who_can_sell
who_controls_supply
barter_options
tax_or_duty
risk_of_fraud

game_use
limits
status
confidence
sources
audit_notes
created_at
updated_at
```

---

# 28. `seasonal_rules`

Сезонные правила региона.

```text
id
region_id
season
title
slug

weather_profile
daylight_profile
road_effects
river_effects
forest_effects
field_effects
food_effects
work_effects
trade_effects
war_effects
disease_effects
clothing_requirements
shelter_requirements

available_occupations
restricted_occupations
available_graph_edges
restricted_graph_edges
common_risks
common_scenes

game_use
limits
status
confidence
sources
audit_notes
created_at
updated_at
```

`season`:

```text
winter
spring
summer
autumn
rasputitsa
early_winter
late_winter
```

---

# 29. `weather_profiles`

Погодные профили.

```text
id
region_id
seasonal_rule_id
title
slug
weather_type

summary
temperature_band
precipitation
wind
visibility
ground_condition
water_condition
road_modifier
movement_modifier
body_state_risk
npc_activity_effect
trade_effect
combat_effect
stealth_effect
fire_effect

visible_description
sound_description
smell_description
game_use
limits

status
confidence
sources
audit_notes
created_at
updated_at
```

---

# 30. `religious_context`

Религиозные нормы, институты и объекты.

```text
id
region_id
title
slug
religion_type

summary
dominant_religion
minority_religions
religious_authority
sacred_places
monastery_presence
church_presence
ritual_calendar
taboos
oath_rules
burial_rules
hospitality_rules
charity_rules
conflict_rules

role_effects
law_effects
npc_knowledge
player_risks
game_use
limits

status
confidence
sources
audit_notes
created_at
updated_at
```

---

# 31. `graph_edge_knowledge_rules`

Кто какие пути знает.

```text
id
region_id
graph_edge_id
social_role_id
occupation_id

knowledge_level
knowledge_source
accuracy
common_mistakes
seasonal_limitations
danger_awareness
landmarks_known
places_known_on_graph_edge
can_guide_others
will_share_for_free
will_share_for_payment
will_hide_or_lie

game_use
limits
status
confidence
sources
audit_notes
created_at
updated_at
```

`knowledge_level`:

```text
knows_exact
knows_roughly
heard_rumor
does_not_know
false_belief
```

---

# 32. `place_generation_limits`

Лимиты генерации мест по региону.

```text
id
region_id
place_template_id

max_total
max_per_subregion
min_total_if_region_active
economic_basis_required
route_basis_required
water_basis_required
authority_basis_required
historical_anchor_basis_required

allowed_near_place_types
forbidden_near_place_types
minimum_distance_band
maximum_distance_band
density_logic
naming_policy
duplication_policy

game_use
limits
status
confidence
sources
audit_notes
created_at
updated_at
```

---

# 33. `source_records`

Источники.

```text
id
title
slug
source_type

author
publication_year
period_covered
region_covered
url
file_reference
page_or_section
quote_short
summary

reliability_level
bias_notes
usefulness
limitations
checked_by
checked_at

status
confidence
audit_notes
created_at
updated_at
```

`source_type`:

```text
book
article
chronicle
academic_database
museum
map
archaeology
web
project_note
llm_draft
manual_entry
```

---

# 34. `record_sources`

Связующая таблица: какие источники подтверждают какую запись.

```text
id
source_id
target_table
target_record_id

support_type
summary
page_or_section
confidence
contradiction_notes
created_at
updated_at
```

`support_type`:

```text
supports
contradicts
partial
background
uncertain
```

---

# 35. `audit_log`

История ручных правок.

```text
id
target_table
target_record_id

action_type
old_value
new_value
reason
changed_by
changed_at
review_status
notes
```

`action_type`:

```text
created
updated
approved
rejected
marked_conflict
merged
split
needs_review
```

---

# 36. `llm_context_packs`

Готовые компактные пакеты контекста для LLM.

```text
id
region_id
title
slug
context_type

summary
included_tables
included_record_ids
prompt_text
hard_constraints
forbidden_assumptions
known_gaps
use_when
do_not_use_when
max_tokens_estimate

status
confidence
sources
audit_notes
created_at
updated_at
```

`context_type`:

```text
region_start
new_place_generation
npc_generation
route_generation
historical_check
scene_context
repair_context
```

---

# 37. `llm_validation_rules`

Правила проверки генерации.

```text
id
region_id
title
slug
validation_type

rule_text
applies_to_table
applies_to_generation_step
severity
failure_message
repair_instruction
examples_valid
examples_invalid

status
confidence
sources
audit_notes
created_at
updated_at
```

`severity`:

```text
warning
error
hard_block
```

---

# 38. `region_gaps`

Что ещё не заполнено или требует проверки.

```text
id
region_id
title
slug
gap_type

summary
why_needed
affected_tables
priority
risk_if_missing
suggested_sources
suggested_research_query
current_workaround
blocked_generation_steps

status
confidence
audit_notes
created_at
updated_at
```

---

# 39. `graph_scale_rules`

Правила масштаба графа G0–G5: единицы измерения, типичные рёбра, использование GU и минут.

```text
id
scale_level
title
unit
typical_edge_min
typical_edge_max
time_unit
uses_gu
uses_minutes
summary
game_use
limits
status
confidence
sources
audit_notes
created_at
updated_at
```

---

# 40. `graph_edge_modifiers`

Модификаторы времени и риска пути: сезон, погода, груз, местность, транспорт.

```text
id
title
modifier_type
applies_to_edge_type
applies_to_terrain_type
applies_to_season
landscape_template_id
multiplier
summary
example
game_use
limits
status
confidence
sources
audit_notes
created_at
updated_at
```

`modifier_type`:

```text
terrain
season
weather
load
access
visibility
stealth
injury
transport
risk
```

---

# 41. `graph_nodes`

Канонические узлы карты: G1 — дневные ячейки региона; G2–G5 — вложенные узлы, места, локации, точки сцены.

```text
id
slug
title
node_type
scale_level
parent_node_id
region_id
place_id

grid_x
grid_y
grid_z
region_cell_code
cell_shape
region_cell_status
cell_size_km
crossing_base_gu
crossing_base_time_hours

primary_landscape_template_id
secondary_landscape_template_ids
landscape_mix_notes

terrain_profile
water_profile
road_profile
settlement_density
dominant_content
known_landmarks
canonical_corridors
neighbor_node_ids

historical_status
is_known_to_player_default
is_known_to_character_default
summary
status
confidence
sources
audit_notes
created_at
updated_at
```

---

# 42. `graph_edges`

Канонические связи карты: дороги, реки, переходы между ячейками, коридоры, волоки.

```text
id
from_node_id
to_node_id
reverse_edge_id
scale_level
edge_type

base_gu
base_distance_km
base_time_minutes
base_time_hours
base_time_days

landscape_template_id
terrain_type
route_surface
seasonal_rule
access_rule
risk_level
known_to_commoners
known_to_traders
known_to_elites
known_to_clergy
known_to_character_default

requires_guide
requires_boat
requires_horse
requires_sled
requires_permission
requires_orientation_check
orientation_difficulty
movement_risk_profile
failure_consequences

historical_status
status
confidence
sources
audit_notes
created_at
updated_at
```

---

# 43. `landscape_templates`

Справочник канонических типов ландшафта: источник истины для `primary_landscape_template_id` на узлах и `landscape_template_id` на рёбрах.

```text
id
slug
title
landscape_group
summary

supports_road
supports_forest_track
supports_offroad
supports_water_crossing
supports_boat
supports_winter_route
supports_settlement
supports_cultivation
supports_hunting

base_movement_multiplier
default_orientation_difficulty
base_risk_level
terrain_profile_hint

game_use
limits
status
confidence
sources
audit_notes
created_at
updated_at
```

---

# 44. `region_landscape_templates`

Связь региона с допустимыми ландшафтами; LLM и trigger выбирают только из этой таблицы.

```text
id
region_id
landscape_template_id

is_allowed
is_common
is_dominant
is_rare
generation_weight

allowed_scale_levels
allowed_node_types
regional_limits

game_use
limits
status
confidence
sources
audit_notes
created_at
updated_at
```

---

# 45. `water_body_templates`

Справочник канонических типов водных объектов (река, озеро, болото, …): не конкретная река, а тип; источник истины для primary_water_body_template_id и secondary_water_body_template_ids на узлах.

```text
id
slug
title
summary
water_body_type
salinity
flow_type
typical_depth
typical_width
drinkable_default
supports_boat
supports_fishing
supports_ford
supports_ferry
supports_bridge
supports_winter_crossing
freeze_pattern
flood_risk
base_crossing_risk
navigation_use
water_hazard_notes
game_use
limits
status
confidence
sources
audit_notes
created_at
updated_at
```

---

# 46. `region_water_body_templates`

Связь региона с допустимыми типами водных объектов; LLM и trigger выбирают только из этой таблицы.

```text
id
region_id
water_body_template_id
is_allowed
is_common
is_dominant
is_rare
generation_weight
allowed_scale_levels
allowed_node_types
regional_limits
game_use
limits
status
confidence
sources
audit_notes
created_at
updated_at
```

---

# 47. `route_templates`

Шаблоны типов инфраструктуры движения (дорога, тропа, зимник, брод, переправа, …); не заменяет graph_edges, но задаёт route_template_id и правила проходимости.

```text
id
slug
title
summary
route_kind
default_edge_type
surface_type
requires_landscape_template
requires_water_body_template
supports_pedestrian
supports_horse
supports_cart
supports_sled
supports_boat
seasonal_availability
default_access_rule
default_orientation_difficulty
default_risk_level
default_movement_multiplier
game_use
limits
status
confidence
sources
audit_notes
created_at
updated_at
```

---

# 48. `land_use_templates`

Справочник типов хозяйственного использования среды (пашня, покос, пастбище, …); не ландшафт и не место — слой поверх среды.

```text
id
slug
title
summary
land_use_kind
requires_settlement_nearby
requires_water_nearby
requires_specific_landscape
compatible_landscape_template_ids
compatible_water_body_template_ids
seasonal_pattern
labor_intensity
economic_use
visibility_effect
movement_effect
risk_effect
game_use
limits
status
confidence
sources
audit_notes
created_at
updated_at
```

---

# 49. `region_land_use_templates`

Связь региона с допустимыми типами хозяйственного использования; LLM выбирает только из этой таблицы.

```text
id
region_id
land_use_template_id
is_allowed
is_common
is_rare
generation_weight
allowed_scale_levels
allowed_node_types
regional_limits
game_use
limits
status
confidence
sources
audit_notes
created_at
updated_at
```

---

# 50. `place_templates`

Глобальный справочник типов мест (деревня, село, погост, монастырь, …); существуют поверх среды, не являются ландшафтом.

```text
id
slug
title
summary
place_kind
default_node_type
can_exist_inside_landscape
requires_water_nearby
requires_route_nearby
requires_land_use
compatible_landscape_template_ids
compatible_water_body_template_ids
compatible_route_template_ids
compatible_land_use_template_ids
typical_scale_level
settlement_density_effect
access_logic
social_logic
economic_logic
defense_logic
game_use
limits
status
confidence
sources
audit_notes
created_at
updated_at
```

---

# 51. `region_place_templates`

Тонкая связка региона с разрешёнными типами мест; LLM выбирает тип места только из этой таблицы (отдельно от fat region_place_generation_rules).

```text
id
region_id
place_template_id
is_allowed
is_common
is_rare
generation_weight
allowed_scale_levels
allowed_node_types
regional_limits
game_use
limits
status
confidence
sources
audit_notes
created_at
updated_at
```

---

## Минимальный порядок создания в NocoDB

Создавать не всё сразу, а в таком порядке. Это порядок для ручной read-only базы проекта.

```text
1. source_records
2. regions
3. region_neighbors
4. graph_scale_rules
5. graph_edge_modifiers
6. landscape_templates
7. water_body_templates
8. route_templates
9. land_use_templates
10. place_templates
11. region_landscape_templates
12. region_water_body_templates
13. region_land_use_templates
14. region_place_templates
15. graph_nodes
16. graph_edges
17. region_laws
18. region_economy
19. region_social_roles
20. region_occupations
21. region_place_generation_rules
22. place_generation_limits
23. places
24. historical_anchors
25. historical_events
26. historical_event_phases
27. historical_figures
28. region_npc_knowledge
29. region_npc_generation_rules
30. region_material_culture
31. item_templates
32. building_templates
33. place_locations
34. place_minilocations
35. scene_anchors
36. place_buildings
37. region_risks
38. conflict_templates
39. rumor_templates
40. seasonal_rules
41. weather_profiles
42. graph_edge_knowledge_rules
43. religious_context
44. price_bands
45. location_object_rules
46. record_sources
47. audit_log
48. llm_context_packs
49. llm_validation_rules
50. region_gaps
```

## Universal social archetype layer (v1)

Regional social roles are **not** independent ontology. Every active regional role maps to exactly one `social_position_archetype_id`.

### Canonicalization policy

```text
Region-specific roles are not independent social ontology entities.
Every active regional social role must map to exactly one universal social_position_archetype.

Regional names may differ, but equivalent legal/social function shares the same social_position_archetype_id.

If no universal social_position_archetype fits:
→ create universal_archetype_proposal
→ mark role status=needs_review
→ do NOT use in generation
```

### Mapping priority (social roles)

1. explicit `social_position_archetype_id` in TSV
2. approved manual mapping table (`novgorod_role_position_map_v1.csv`)
3. high-confidence script proposal (multi-field)
4. LLM-assisted mapping with audit (never auto-active)
5. `needs_review` — not active

### Generation gate

Role is eligible for LLM/player/NPC generation only if:

```text
status IN ('approved', 'usable_with_caution')
AND social_position_archetype_id IS NOT NULL
AND social_class_id IS NOT NULL
AND role_archetype_id IS NOT NULL
AND mapping_review_status IN ('approved', 'accepted_with_caution')
```

Implemented in `src/world/social-generation-gate.js` and retrievers (`regional-context.js`).

### Universal tables (11)

`social_classes`, `social_role_archetypes`, `legal_status_archetypes`, `dependency_archetypes`, `mobility_archetypes`, `social_position_archetypes` (center), `class_role_rules`, `occupation_archetypes`, `skill_catalog`, `occupation_skill_defaults`, `role_occupation_rules`, `universal_archetype_proposals`.

`role_group` on `region_social_roles` is **legacy editor grouping only** — not used in generation pipeline.

### LLM pipeline order

```text
заявка → social_position_archetype → региональная роль → занятие → биография → навыки
```
