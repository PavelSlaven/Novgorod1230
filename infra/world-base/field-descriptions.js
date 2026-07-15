/** Русские пояснения полей для SCHEMA_REFERENCE.md (приоритет над эвристикой). */

export const STATUS_VALUES =
  'draft, usable_with_caution, approved, needs_review, conflict, rejected';

export const CONFIDENCE_VALUES =
  'unknown, low, medium_low, medium, medium_high, high';

export const TABLE_GROUPS = [
  {
    title: 'Граф (каноническая карта)',
    tables: [
      'graph_scale_rules',
      'graph_edge_modifiers',
      'graph_nodes',
      'graph_edges',
      'graph_edge_knowledge_rules'
    ]
  },
  {
    title: 'Ландшафт (базовая среда)',
    tables: ['landscape_templates', 'region_landscape_templates']
  },
  {
    title: 'Вода',
    tables: ['water_body_templates', 'region_water_body_templates']
  },
  {
    title: 'Инфраструктура',
    tables: ['route_templates']
  },
  {
    title: 'Хозяйство',
    tables: ['land_use_templates', 'region_land_use_templates']
  },
  {
    title: 'Места',
    tables: [
      'place_templates',
      'region_place_templates',
      'region_place_generation_rules',
      'place_generation_limits',
      'places',
      'place_locations',
      'place_minilocations',
      'scene_anchors',
      'place_buildings'
    ]
  },
  {
    title: 'Универсальный социальный слой',
    tables: [
      'social_classes',
      'social_role_archetypes',
      'legal_status_archetypes',
      'dependency_archetypes',
      'mobility_archetypes',
      'social_position_archetypes',
      'class_role_rules',
      'occupation_archetypes',
      'skill_catalog',
      'occupation_skill_defaults',
      'role_occupation_rules',
      'universal_archetype_proposals'
    ]
  },
  {
    title: 'Региональная рамка',
    tables: [
      'regions',
      'region_neighbors',
      'region_laws',
      'region_economy',
      'region_social_roles',
      'region_occupations',
      'region_material_culture',
      'region_risks',
      'conflict_templates',
      'rumor_templates',
      'price_bands',
      'seasonal_rules',
      'weather_profiles',
      'religious_context',
      'region_npc_knowledge',
      'region_npc_generation_rules',
      'region_gaps'
    ]
  },
  {
    title: 'История',
    tables: [
      'historical_anchors',
      'historical_events',
      'historical_event_phases',
      'historical_figures'
    ]
  },
  {
    title: 'Шаблоны и правила генерации',
    tables: ['item_templates', 'building_templates', 'location_object_rules']
  },
  {
    title: 'Мета, источники, LLM',
    tables: [
      'source_records',
      'record_sources',
      'audit_log',
      'llm_context_packs',
      'llm_validation_rules'
    ]
  },
  {
    title: 'Materialization v2: категории и ревизии',
    tables: ['world_revisions', 'classification_schemes', 'universal_categories', 'category_labels', 'category_scheme_mappings', 'universal_category_relations', 'universal_parameter_definitions', 'region_category_options']
  },
  {
    title: 'Materialization v2: NPC-профили',
    tables: ['region_npc_archetypes', 'region_demographic_profiles', 'region_name_pools', 'region_name_pool_entries', 'region_appearance_profiles', 'region_clothing_profiles', 'region_equipment_profiles', 'region_equipment_profile_entries', 'region_knowledge_profiles', 'region_behavior_profiles', 'region_relationship_profiles', 'region_activity_profiles', 'region_schedule_profiles', 'region_npc_profile_sets']
  },
  {
    title: 'Materialization v2: G4 и G5',
    tables: ['room_templates', 'building_layout_templates', 'building_layout_nodes', 'building_layout_edges', 'g5_minilocation_templates', 'g5_anchor_templates', 'g5_edge_templates', 'g4_materialization_profiles', 'g4_materialization_bindings', 'materialization_slot_rules', 'g4_npc_materialization_rules', 'g4_item_materialization_rules', 'g4_container_materialization_rules']
  },
  {
    title: 'Materialization v2: предметы и имущество',
    tables: ['container_templates', 'item_profile_sets', 'item_profile_entries', 'container_content_profiles', 'container_content_profile_entries', 'item_template_category_bindings', 'item_template_inventory_profiles', 'container_template_inventory_profiles', 'container_template_facet_bindings', 'container_content_category_relations', 'item_classification_migration_inventory', 'property_profiles', 'property_profile_rules', 'transport_templates']
  },
  {
    title: 'Materialization v2: решения и импорт',
    tables: ['decision_command_catalog', 'decision_policy_profiles', 'decision_policy_options', 'catalog_imports', 'catalog_import_tables']
  },
  {
    title: 'PR8: ориентиры, сигналы и следы среды',
    tables: ['environment_landmark_templates', 'environment_landmark_profiles', 'environment_landmark_profile_entries', 'environment_landmark_rules', 'environment_landmark_rule_g1_classes', 'environment_landmark_rule_node_types', 'environment_landmark_rule_landscapes', 'environment_landmark_rule_hydrology', 'environment_landmark_rule_land_use', 'environment_landmark_rule_routes', 'environment_cue_templates', 'environment_emission_rules', 'environment_trace_templates', 'environment_decay_profiles', 'environment_trace_creation_rules', 'environment_trace_rule_landscapes', 'environment_trace_rule_hydrology']
  }
];

/** Назначение таблицы, если architecture md не распарсился. */
export const TABLE_PURPOSE_FALLBACK = {
  graph_scale_rules:
    'Правила масштаба графа G0–G5: единицы пути, типичные длины рёбер. Метрики G1-ячейки (32 км, 8 GU) — на graph_nodes, не здесь.',
  graph_edge_modifiers: 'Множители времени/риска пути по местности, сезону, погоде и др.',
  landscape_templates:
    'Справочник базовой природно-географической среды (лес, болото, пойма, …); не дороги, не вода, не поселения, не хозяйство.',
  water_body_templates:
    'Типы водных объектов и водной среды: солёность, течение, глубина, судоходность, бродимость, лёд.',
  route_templates:
    'Шаблоны типов движения и инфраструктуры (дорога, тропа, зимник, волок); не заменяет graph_edges.',
  land_use_templates:
    'Хозяйственное использование среды: пашня, покос, выгон, вырубка и т.п.; не базовый ландшафт.',
  place_templates:
    'Глобальный справочник типов устойчивых мест и поселений (деревня, погост, …); не ландшафт.',
  region_landscape_templates:
    'Какие базовые природные среды допустимы в регионе: is_allowed, веса генерации.',
  region_water_body_templates:
    'Какие типы водных объектов допустимы в регионе.',
  region_land_use_templates:
    'Какие типы хозяйственного использования допустимы в регионе.',
  region_place_templates:
    'Тонкая связка region ↔ place_templates: какие типы мест разрешены в регионе.',
  region_place_generation_rules:
    'Региональные правила генерации мест (template_type, layout_rules, npc_generation_rules, …); не путать с place_templates.',
  graph_nodes: 'Канонические узлы карты; G1 — дневные ячейки региона (region_cell), G2–G5 — вложенные уровни.',
  graph_edges: 'Канонические связи между узлами графа; offroad_crossing — переход между G1-клетками без дороги; landscape_template_id обязателен для offroad_crossing.',
  graph_edge_knowledge_rules: 'Кто из ролей/профессий какие рёбра графа знает и насколько точно.',
  regions: 'Главная карточка региона RUS13: рамка климата, власти, экономики, истории.',
  region_neighbors: 'Связи между соседними регионами: граница, торговля, давление, знание пути.',
  region_laws: 'Право, обычай, запреты и наказания в регионе.',
  region_economy: 'Экономика, ресурсы, промыслы и товары региона.',
  social_classes: 'Универсальные социальные классы (10 канонических id).',
  social_role_archetypes: 'Универсальные архетипы социальной роли (16 id).',
  legal_status_archetypes: 'Архетипы правового статуса (free, dependent, unfree, …).',
  dependency_archetypes: 'Архетипы зависимости (долг, двор, монастырь, …).',
  mobility_archetypes: 'Архетипы мобильности (local_bound, road_mobile, …).',
  social_position_archetypes: 'Канонические социальные позиции — главный якорь нормализации.',
  class_role_rules: 'Матрица допустимости класс ↔ роль.',
  occupation_archetypes: 'Универсальные архетипы занятий (15 id).',
  skill_catalog: 'Канонический каталог механических навыков (12 id).',
  occupation_skill_defaults: 'Дефолтные primary/secondary навыки по занятию.',
  role_occupation_rules: 'Матрица допустимости роль ↔ занятие.',
  universal_archetype_proposals: 'Заявки на новые универсальные архетипы при нехватке покрытия.',
  region_social_roles: 'Региональные социальные роли — локальные термины, FK на social_position_archetypes.',
  region_occupations: 'Профессии и занятия, привязанные к региону.',
  region_place_generation_rules: 'Региональные правила генерации типовых мест (fat table).',
  places: 'Конкретные утверждённые места: исторические и сгенерированные.',
  place_locations: 'Локации внутри места (двор, улица, пристань, …).',
  place_minilocations: 'Точные сценические зоны внутри локации.',
  scene_anchors: 'Точки сцены: дверь, сундук, колодец, костёр.',
  place_buildings: 'Постройки внутри места.',
  historical_anchors: 'Исторические и географические якоря региона.',
  historical_events: 'Исторические события и региональное давление.',
  historical_event_phases: 'Фазы жизненного цикла события.',
  historical_figures: 'Исторические личности и их влияние.',
  source_records: 'Библиография и проектные источники; основа для record_sources.',
  record_sources: 'Связь источника с любой записью справочника (полиморфная).',
  audit_log: 'Журнал ручных правок и утверждений (полиморфная цель).',
  world_revisions: 'Неизменяемые утверждённые ревизии каталогов мира и их общий digest.',
  classification_schemes: 'Локально зафиксированные версии внешних классификационных схем без runtime live-запросов.',
  universal_categories: 'Универсальные категории, которые код вправе использовать, но не создавать.',
  category_labels: 'Нормализованные preferred, alternative, historical и deprecated labels категорий.',
  category_scheme_mappings: 'Справочные mappings проектных категорий к pinned внешним схемам; не являются regional permission или rule.',
  universal_category_relations: 'Нормализованные отношения между универсальными категориями.',
  universal_parameter_definitions: 'Типизированные определения параметров категорий.',
  region_category_options: 'Разрешение категории для региона, периода и ревизии с весом выбора.',
  decision_command_catalog: 'Закрытый каталог команд bounded decision и зарегистрированных code handlers.',
  decision_policy_profiles: 'Политики, определяющие контексты формального запроса решения.',
  decision_policy_options: 'Допустимые команды, preconditions, costs и risk metadata политики.',
  region_npc_archetypes: 'Региональные NPC templates без конкретной identity и биографии.',
  region_demographic_profiles: 'Региональные демографические варианты и ограничения.',
  region_name_pools: 'Региональные пулы имён для периода и ревизии.',
  region_name_pool_entries: 'Конкретные утверждённые формы имён и веса.',
  region_appearance_profiles: 'Региональные варианты внешности из разрешённых категорий.',
  region_clothing_profiles: 'Региональные garment slots и ограничения одежды.',
  region_equipment_profiles: 'Профили снаряжения для ролей и занятий.',
  region_equipment_profile_entries: 'Нормализованные required/optional варианты снаряжения.',
  region_knowledge_profiles: 'Разрешённые категории и ссылки знаний NPC.',
  region_behavior_profiles: 'Поведенческие варианты и привязанная decision policy.',
  region_relationship_profiles: 'Типы и ограничения отношений NPC.',
  region_activity_profiles: 'Причины присутствия, действия и опорные узлы NPC.',
  region_schedule_profiles: 'Расписания NPC с явными place/route/fallback ссылками.',
  region_npc_profile_sets: 'Совместимые композиции компонентных NPC-профилей.',
  room_templates: 'Шаблоны функций помещений или зон.',
  building_layout_templates: 'Региональные профили планировки здания для периода.',
  building_layout_nodes: 'Нормализованные slots помещений в планировке.',
  building_layout_edges: 'Нормализованные проходы между slots планировки.',
  g5_minilocation_templates: 'Шаблоны party G5-минилокаций и их policies.',
  g5_anchor_templates: 'Шаблоны anchors с capacities и interaction capabilities.',
  g5_edge_templates: 'Шаблоны G5-проходов с access/visibility policies.',
  g4_materialization_profiles: 'Главные профили материализации G4 в party G5.',
  g4_materialization_bindings: 'Приоритетные правила выбора G4 materialization profile.',
  materialization_slot_rules: 'Required/optional slots и количественные границы materializer.',
  container_templates: 'Шаблоны контейнеров с capacity и access policy.',
  item_profile_sets: 'Профили комплектов предметов для контекста.',
  item_profile_entries: 'Нормализованные варианты предметов и quantity limits.',
  container_content_profiles: 'Профили содержимого контейнеров.',
  container_content_profile_entries: 'Нормализованные варианты содержимого и количества.',
  item_template_category_bindings: 'Нормализованные фасетные связи шаблона предмета с утверждёнными категориями.',
  item_template_inventory_profiles: 'Строго типизированные mass и carrying параметры шаблона предмета; не историческое подтверждение без source record.',
  container_template_inventory_profiles: 'Строго типизированные mass, carrying и quick/primary role параметры шаблона контейнера.',
  container_template_facet_bindings: 'Нормализованные фасеты шаблона контейнера.',
  container_content_category_relations: 'Разрешённые и запрещённые пары категорий контейнера и содержимого.',
  item_classification_migration_inventory: 'Явный отчёт перехода legacy-полей предметов и контейнеров без guessed mapping.',
  property_profiles: 'Региональные модели имущества и доступа.',
  property_profile_rules: 'Условия owner/holder/controller/access/claim.',
  transport_templates: 'Шаблоны транспорта с маршрутными и equipment requirements.',
  g4_npc_materialization_rules: 'G4-specific правила количества и причин присутствия NPC.',
  g4_item_materialization_rules: 'G4-specific правила предметов, имущества и economic basis.',
  g4_container_materialization_rules: 'G4-specific правила контейнеров, содержимого и доступа.',
  catalog_imports: 'Проверяемые импорты versioned authoring manifest.',
  catalog_import_tables: 'Digests, counts и dependency order таблиц одного импорта.',
  environment_landmark_templates: 'Approved templates постоянных природных ориентиров; не party instances и не G0–G4 nodes.',
  environment_landmark_profiles: 'Региональные совместимые наборы landmark templates и закрытая policy.',
  environment_landmark_profile_entries: 'Нормализованные template choices landmark profile с weight и exclusivity.',
  environment_landmark_rules: 'Правила применения landmark profile в G1 scope и количественные пределы.',
  environment_landmark_rule_g1_classes: 'Допустимые классы G1 landmark rule.',
  environment_landmark_rule_node_types: 'Допустимые типы graph placement nodes landmark rule.',
  environment_landmark_rule_landscapes: 'Нормализованная совместимость landmark rule с landscape template.',
  environment_landmark_rule_hydrology: 'Нормализованная совместимость landmark rule с water template.',
  environment_landmark_rule_land_use: 'Нормализованная совместимость landmark rule с land-use template.',
  environment_landmark_rule_routes: 'Нормализованная совместимость landmark rule с route template.',
  environment_cue_templates: 'Templates временных зрительных, звуковых и запаховых signals с propagation/visibility policy.',
  environment_emission_rules: 'Approved causal rule emitter → cue template; отсутствие emitter блокирует cue.',
  environment_trace_templates: 'Templates наблюдаемых следов деятельности.',
  environment_decay_profiles: 'Versioned policy постепенного ослабления trace strength.',
  environment_trace_creation_rules: 'Approved causal rule emission → trace template и decay profile.',
  environment_trace_rule_landscapes: 'Нормализованная совместимость trace rule с landscape template.',
  environment_trace_rule_hydrology: 'Нормализованная совместимость trace rule с water template.'
};

export const common = {
  id: 'Уникальный идентификатор записи (TEXT, первичный ключ).',
  slug: 'Короткий машиночитаемый ключ для ссылок и LLM.',
  title: 'Человекочитаемое название записи.',
  summary: 'Краткое содержание: что это и зачем в игре.',
  game_use: 'Как игровой код и LLM должны использовать эту запись.',
  limits: 'Ограничения применения; что нельзя выводить из записи.',
  status: `Статус утверждения записи. Допустимо: ${STATUS_VALUES}.`,
  confidence: `Уверенность в достоверности. Допустимо: ${CONFIDENCE_VALUES}.`,
  sources: 'JSON-массив id из source_records и/или заметок об источнике.',
  audit_notes: 'Заметки редактора: споры, TODO, ссылки на проверку.',
  created_at: 'Время создания записи (UTC).',
  updated_at: 'Время последнего изменения (обновляется триггером).',
  region_id: 'FK → regions(id): регион, к которому относится запись.',
  place_id: 'FK → places(id): конкретное место, если применимо.',
  location_id: 'FK → place_locations(id): локация внутри места.',
  minilocation_id: 'FK → place_minilocations(id): сценическая зона.',
  event_id: 'FK → historical_events(id): родительское событие.',
  template_id: 'FK → region_place_generation_rules(id): правило генерации типа места.',
  source_id: 'FK → source_records(id): подтверждающий источник.',
  graph_edge_id: 'FK → graph_edges(id): каноническое ребро графа.',
  social_role_id: 'FK → region_social_roles(id): социальная роль.',
  occupation_id: 'FK → region_occupations(id): профессия/занятие.',
  material_culture_id: 'FK → region_material_culture(id): слой материальной культуры.',
  seasonal_rule_id: 'FK → seasonal_rules(id): сезонное правило региона.',
  place_template_id:
    'FK: на region_place_generation_rules(id) в place_generation_limits/location_object_rules; на place_templates(id) в graph_nodes.',
  route_template_id: 'FK → route_templates(id): тип движения/инфраструктуры ребра.',
  water_body_template_id: 'FK → water_body_templates(id): водная среда ребра (река, брод, переправа, …).',
  primary_water_body_template_id:
    'FK → water_body_templates(id): главный водный шаблон узла.',
  secondary_water_body_template_ids:
    'JSON: id дополнительных water_body_templates; trigger проверяет region_water_body_templates.',
  hydrology_notes: 'Пояснение водной ситуации узла: расположение воды в ячейке, сезонность, переправы. Обязателен при primary_water_body_template_id на G1. Берег описывается здесь или на G2–G5, не в landscape_group.',
  land_use_template_ids:
    'JSON: id land_use_templates на узле; trigger проверяет region_land_use_templates.',
  item_template_id: 'FK → item_templates(id): шаблон предмета.',
  neighbor_region_id: 'FK → regions(id): соседний регион.',
  parent_region_id: 'FK → regions(id): родительский регион в иерархии.',
  parent_node_id: 'FK → graph_nodes(id): родительский узел графа.',
  from_node_id: 'FK → graph_nodes(id): узел начала ребра.',
  to_node_id: 'FK → graph_nodes(id): узел конца ребра.',
  reverse_edge_id: 'FK → graph_edges(id): обратное ребро, если путь двусторонний.',
  landscape_template_id: 'FK → landscape_templates(id): канонический ландшафт ребра (обязателен для offroad_crossing).',
  primary_landscape_template_id:
    'FK → landscape_templates(id): основной ландшафт узла; для G1 region_cell обязателен; должен быть в region_landscape_templates региона.',
  secondary_landscape_template_ids:
    'JSON: id дополнительных landscape_templates для смешанного ландшафта.',
  landscape_mix_notes: 'Пояснение смеси primary и secondary ландшафтов (не замена FK).',
  target_table: 'Имя таблицы цели (полиморфная ссылка, без FK в DDL).',
  target_record_id: 'id записи в target_table (полиморфная ссылка).'
};

/** Поля по таблицам — только там, где нужно уточнение сверх common. */
export const fields = {
  item_templates: {
    category_id: 'FK → universal_categories(id): object-type category template; legacy item_type не является вторым классификатором.',
    world_revision_id: 'FK → world_revisions(id): pinned revision для нового нормализованного authoring template.',
    source_id: 'FK → source_records(id): provenance template; для legacy строк может быть NULL до reviewed migration.'
  },
  item_template_category_bindings: {
    item_template_id: 'FK → item_templates(id): классифицируемый шаблон предмета.',
    category_id: 'FK → universal_categories(id): утверждённая категория фасета.',
    binding_kind: 'Независимый фасет: object_type, function, material, technique, condition и др.',
    packing_slot_cost: 'Только size_band: положительное число packing slots за один bundle; не является массой или объёмом.',
    packing_bundle_size: 'Только size_band: положительное количество одинаковых template/state items в одном packing bundle.',
    exclusivity_group: 'Только primary_function либо NULL; запрещает неформальные группы совместимости.',
    requires_regional_permission: 'Требует approved regional/period permission в той же world revision до импорта.'
  },
  item_template_inventory_profiles: {
    item_template_id: 'FK → item_templates(id): шаблон предмета, для которого утверждены физические inventory parameters.',
    world_revision_id: 'FK → world_revisions(id): pinned ревизия authoring-каталога.',
    source_id: 'FK → source_records(id): provenance параметров; отсутствие не допускает historical approval.',
    mass_grams: 'Неотрицательная масса одного экземпляра в граммах; не выводится из packing slots и не имеет fallback.',
    carry_form: 'Closed carrying form: compact, regular, long или bulky.',
    external_hand_cost: 'Closed внешний hand cost 0, 1 или 2; не является use_hand_cost.',
    status: 'draft, approved или deprecated; для template допустим только один approved profile.'
  },
  item_template_source_bindings: {
    item_template_id: 'FK → item_templates(id): template, к которому относится одно ограниченное evidence claim.',
    source_id: 'FK → source_records(id): конкретный источник доказательства; project policy не заменяет historical source.',
    world_revision_id: 'FK → world_revisions(id): revision, в котором рассматривается evidence binding.',
    evidence_class: 'Закрытый класс evidence: direct_novgorod, direct_novgorod_or_rus_period, rus_period_with_novgorod_context или comparative_period.',
    claim_scope: 'Точно ограниченное утверждение: historical_presence, material, construction, physical_parameter, social_access или commonness.',
    confidence: 'Оценка уверенности в конкретном claim, не историческая частотность.',
    review_status: 'needs_review, reviewed или rejected; только reviewed historical_presence может участвовать в promotion readiness.',
    notes: 'Необязательная граница доказательного утверждения; не является queryable категорией.',
    status: 'draft, approved или deprecated; approved binding не создаёт regional permission.'
  },
  quantity_unit_definitions: {
    dimension: 'Измеряемое измерение: count, mass, volume или length.',
    canonical_unit: 'Каноническая единица внутри данного dimension; не свободный игровой текст.',
    conversion_policy: 'Versioned closed policy преобразования единицы; runtime не запрашивает внешние справочники.',
    status: 'draft, approved или deprecated; draft definition не создаёт runtime quantity candidate.'
  },
  item_template_quantity_profiles: {
    item_template_id: 'FK → item_templates(id): bulk template с явной quantity semantics.',
    world_revision_id: 'FK → world_revisions(id): pinned authoring revision quantity profile.',
    quantity_unit_id: 'FK → quantity_unit_definitions(id): нормализованная единица количества.',
    quantity_dimension: 'dimension quantity profile; должен совпадать с quantity unit definition.',
    minimum_quantity: 'Минимальное положительное количество в выбранной единице.',
    maximum_quantity: 'Необязательная верхняя граница; NULL не означает fallback quantity.',
    default_quantity_policy: 'Closed versioned policy. explicit_only требует готовое quantity от materialization rule и запрещает default.',
    mass_grams_per_unit: 'Детерминированный массовый input одной quantity unit; не является packing slots или исторической частотностью.',
    stackable: 'Разрешено ли хранить одинаковые quantity units в одной instance line.',
    partial_consumption_allowed: 'Разрешено ли уменьшение quantity конкретной party instance.',
    source_id: 'FK → source_records(id): provenance quantity policy; draft policy не подтверждает историческую меру.',
    status: 'draft, approved или deprecated; для template допустим только один approved quantity profile.'
  },
  container_template_inventory_profiles: {
    container_template_id: 'FK → container_templates(id): контейнер, для которого утверждены физические inventory parameters.',
    world_revision_id: 'FK → world_revisions(id): pinned ревизия authoring-каталога.',
    source_id: 'FK → source_records(id): provenance параметров; отсутствие не допускает historical approval.',
    mass_grams: 'Неотрицательная масса пустого контейнера в граммах; contents считаются отдельно.',
    carry_form: 'Closed carrying form: compact, regular, long или bulky.',
    external_hand_cost: 'Closed внешний hand cost 0, 1 или 2; не является use_hand_cost.',
    inventory_role: 'none, quick_container или primary_container; это authoring role, а не сохранённый derived zone.',
    status: 'draft, approved или deprecated; для template допустим только один approved profile.'
  },
  container_template_source_bindings: {
    container_template_id: 'FK → container_templates(id): container template, к которому относится одно ограниченное evidence claim.',
    source_id: 'FK → source_records(id): конкретный источник доказательства.',
    world_revision_id: 'FK → world_revisions(id): revision, в котором рассматривается evidence binding.',
    evidence_class: 'Закрытый класс evidence без неявного вывода исторической допустимости.',
    claim_scope: 'historical_presence, material, construction, physical_parameter, social_access или commonness.',
    confidence: 'Оценка уверенности в конкретном claim.',
    review_status: 'needs_review, reviewed или rejected; reviewed historical_presence является отдельным promotion gate.',
    notes: 'Необязательная граница доказательного утверждения.',
    status: 'draft, approved или deprecated; binding не создаёт региональное permission.'
  },
  container_template_facet_bindings: {
    container_template_id: 'FK → container_templates(id): классифицируемый шаблон контейнера.',
    category_id: 'FK → universal_categories(id): утверждённая категория фасета.',
    facet: 'container_form, material, capacity_band, closure_type, access_model, portability, content_compatibility или condition.',
    requires_regional_permission: 'Требует approved regional/period permission в той же world revision до импорта.'
  },
  container_templates: {
    source_id: 'FK → source_records(id): provenance container template; draft catalog не выводит историческую точность из этой ссылки.',
    capacity: 'Положительная внутренняя вместимость контейнера в packing slots; не является массой, литрами или inventory slots персонажа.',
    packing_slot_cost: 'Положительный внешний размер контейнера в packing slots при переноске или вложении.',
    capacity_policy: 'Closed policy строго {version:1,mode:packing_slots,unit:packing_slot}; runtime не интерпретирует иные единицы.'
  },
  property_profile_rules: {
    owner_kind: 'Closed vocabulary: person, household, workshop, community, institution, estate или unknown; не ID конкретного owner.',
    holder_kind: 'Closed vocabulary holder relation; не заменяет party holder relation.',
    controller_kind: 'Closed vocabulary controller relation; не заменяет party controller relation.',
    access_policy: 'Versioned policy payload для authoring access; без внешних ID и художественного текста.',
    claim_conditions: 'Versioned policy payload условий claim; без конкретных party relations.'
  },
  container_content_category_relations: {
    container_category_id: 'FK → universal_categories(id): категория контейнера.',
    content_category_id: 'FK → universal_categories(id): категория допустимого либо запрещённого содержимого.',
    compatibility: 'closed vocabulary: allowed или forbidden; не создаёт regional permission.'
  },
  item_classification_migration_inventory: {
    legacy_table_name: 'Исходная legacy-таблица без автоматической записи в неё.',
    legacy_record_id: 'ID исходной legacy-записи.',
    legacy_field_name: 'Поле, для которого требуется reviewed classification mapping.',
    legacy_value: 'Дословное legacy-значение; не интерпретируется как категория.',
    resolution_status: 'mapped, data_gap, migration_conflict или deferred.',
    resolved_category_id: 'FK → universal_categories(id); обязателен только при mapped.'
  },
  classification_schemes: {
    authority: 'Организация, отвечающая за внешнюю классификационную схему.',
    scheme_version: 'Зафиксированная версия внешней схемы.',
    release_date: 'Дата выпуска зафиксированной версии схемы.',
    canonical_reference: 'Каноническая ссылка на схему или локальный snapshot.',
    license_or_usage_note: 'Условия лицензии либо допустимого справочного использования.',
    snapshot_digest: 'SHA-256 локально проверенного snapshot; runtime не обращается к внешнему сервису.'
  },
  universal_categories: {
    stable_code: 'Уникальный стабильный машинный код одного понятия.',
    facet: 'Классификационный фасет категории в пределах domain.',
    preferred_label: 'Предпочтительная метка категории; historical labels хранятся отдельно.',
    definition: 'Нормативное определение одного классификационного понятия.',
    scope_note: 'Граница смысла и применимости понятия без утверждения региональной истории.',
    inclusion_rules: 'Явные условия включения в категорию.',
    exclusion_rules: 'Явные условия исключения из категории.',
    replaced_by_category_id: 'FK на заменяющую категорию; deprecated/replaced категория не кандидат runtime.'
  },
  category_labels: {
    category_id: 'FK на классифицируемую универсальную категорию.',
    language: 'Язык метки по принятому языковому коду проекта.',
    label: 'Текстовая метка; не самостоятельный category ID.',
    label_type: 'preferred, alternative, historical или deprecated.',
    source_id: 'FK на подтверждающий source_records, если он известен.'
  },
  category_scheme_mappings: {
    category_id: 'FK на проектную категорию.',
    classification_scheme_id: 'FK на pinned classification scheme.',
    external_concept_id: 'Стабильный ID понятия во внешней схеме.',
    mapping_type: 'exact, close, broad, narrow или related; mapping не даёт regional permission.',
    mapping_evidence: 'Основание сопоставления без подмены исторической применимости.',
    source_id: 'FK на источник evidence, если он известен.',
    review_status: 'Статус редакторского review mapping: draft, approved или rejected.'
  },
  universal_category_relations: {
    relation_type: 'broader, narrower, related, compatible, requires, excludes или equivalent_with_scope; hierarchy cycles forbidden.'
  },
  graph_nodes: {
    node_type:
      'Тип узла: world_region, region_cell, place, location, scene_anchor, ford, …',
    scale_level: 'Уровень графа: G0 (регион) … G5 (точка сцены).',
    grid_x: 'Координата X в сетке G1-ячеек региона.',
    grid_y: 'Координата Y в сетке G1-ячеек региона.',
    grid_z: 'Вертикальный/слойный индекс; для поверхности = 0.',
    region_cell_code: 'Человекочитаемый код ячейки (напр. nov_06_04).',
    cell_shape:
      'Форма ячейки: square, partial, irregular, water, border.',
    region_cell_status:
      'Статус ячейки в сетке: active, partial, border, outside_region, water_only (не путать с status записи).',
    cell_size_km: 'Размер стороны G1-ячейки в км (обычно ~32).',
    crossing_base_gu: 'Базовая стоимость пересечения ячейки в GU (1 GU ≈ 4 км, 1 ч пешком).',
    crossing_base_time_hours: 'Базовое время пересечения ячейки в часах при нормальных условиях.',
    terrain_profile: 'Legacy/editor hint: профиль местности; источник истины — FK на шаблоны слоёв.',
    water_profile: 'Legacy/editor hint: водные объекты; источник истины — water_body_template FK/JSON.',
    road_profile: 'Legacy/editor hint: дороги в узле; источник истины — graph_edges + route_templates.',
    settlement_density: 'Legacy/editor hint: плотность поселений; источник истины — place_template_id / places.',
    dominant_content: 'Legacy/editor hint: что преобладает; источник истины — FK/JSON шаблонов слоёв.',
    primary_water_body_template_id:
      'FK → water_body_templates(id): главный водный объект/среда узла.',
    secondary_water_body_template_ids:
      'JSON: дополнительные water_body_templates; смешение воды — через primary/secondary, не landscape_group.',
    hydrology_notes: 'Текстовое пояснение водной ситуации: где вода в ячейке, сезонность, брод/пристань на G2. Обязателен при primary_water_body_template_id на G1.',
    land_use_template_ids:
      'JSON: хозяйственное использование узла (пашня, покос, …); не landscape_template.',
    place_template_id:
      'FK → place_templates(id): тип места/поселения, если узел — place; проверка через region_place_templates.',
    known_landmarks: 'JSON: известные ориентиры в узле.',
    canonical_corridors: 'JSON: канонические коридоры движения через узел.',
    neighbor_node_ids:
      'JSON: id соседних graph_nodes. Не источник истины; кеш/подсказка для редактора. Истина о связях — в graph_edges.',
    is_known_to_player_default: 'Известен ли узел игроку по умолчанию (канон, не партия).',
    is_known_to_character_default: 'Известен ли узел персонажу по умолчанию.'
  },
  graph_edges: {
    edge_type:
      'Тип связи: road, path, offroad_crossing (G1 без дороги), corridor_segment (крупный коридор), portage (волок), ford, ferry, border_transition, …',
    landscape_template_id:
      'FK → landscape_templates(id): среда прохождения ребра; обязателен для offroad_crossing.',
    route_template_id:
      'FK → route_templates(id): тип движения; обязателен для road/path/forest_track/winter_road/portage/corridor_segment.',
    water_body_template_id:
      'FK → water_body_templates(id): водная среда; обязателен для river/lake_route/sea_route/ford/ferry/bridge.',
    terrain_type: 'Legacy-текст местности ребра; источник истины — landscape_template_id.',
    base_gu: 'Базовая длина ребра в graph units (1 GU ≈ 4 км пешком).',
    base_distance_km: 'Ориентировочная дистанция в км.',
    base_time_minutes: 'Базовое время для G3–G5 (минуты).',
    base_time_hours: 'Базовое время в часах.',
    base_time_days: 'Базовое время в днях (дальние G0-переходы).',
    seasonal_rule: 'Сезонная доступность или модификатор.',
    access_rule: 'Кто и при каких условиях может пройти.',
    requires_guide: 'Нужен ли проводник.',
    requires_boat: 'Нужна ли лодка.',
    requires_horse: 'Нужна ли лошадь.',
    requires_sled: 'Нужны ли сани.',
    requires_permission: 'Нужно ли разрешение власти.',
    requires_orientation_check: 'Нужна ли проверка ориентирования/поиска направления.',
    orientation_difficulty:
      'Сложность ориентирования: none, easy, ordinary, hard, dangerous, extreme.',
    movement_risk_profile:
      'JSON-массив рисков пути (lost_time, getting_lost, fatigue, wild_animals, …).',
    failure_consequences:
      'JSON-массив последствий провала (lose_1d4_hours, exit_to_wrong_neighbor_cell, …).'
  },
  graph_scale_rules: {
    scale_level: 'G0–G5: уровень вложенности графа.',
    unit: 'Единица измерения на уровне (route_chain, GU, minutes, …).',
    typical_edge_min: 'Нижняя граница типичного ребра на уровне.',
    typical_edge_max: 'Верхняя граница типичного ребра.',
    uses_gu: 'Использует ли уровень graph units.',
    uses_minutes: 'Использует ли уровень минуты.'
  },
  graph_edge_modifiers: {
    modifier_type:
      'Тип модификатора: terrain, season, weather, load, access, visibility, …',
    landscape_template_id:
      'FK → landscape_templates(id): рекомендуется для modifier_type=terrain (см. seed offroad).',
    multiplier: 'Множитель к базовому времени/риску ребра.',
    applies_to_edge_type: 'К каким edge_type применяется.',
    applies_to_terrain_type: 'К какой местности применяется.',
    applies_to_season: 'К какому сезону применяется.'
  },
  region_economy: {
    trade_graph_edges: 'JSON: id из graph_edges — торговые коридоры/пути (не legacy routes).'
  },
  region_risks: {
    applies_to_graph_edges: 'JSON: id из graph_edges, к которым применяется риск.'
  },
  rumor_templates: {
    spread_graph_edges: 'JSON: id из graph_edges — по каким путям распространяется слух.'
  },
  seasonal_rules: {
    available_graph_edges: 'JSON: id из graph_edges, доступных в сезон.',
    restricted_graph_edges: 'JSON: id из graph_edges, закрытых или ограниченных в сезон.'
  },
  historical_anchors: {
    access_graph_edges: 'JSON: id из graph_edges — пути доступа к якорю.'
  },
  scene_anchors: {
    linked_graph_edge_ids: 'JSON: id из graph_edges, связанных с точкой сцены.'
  },
  graph_edge_knowledge_rules: {
    knowledge_level:
      'knows_exact, knows_roughly, heard_rumor, does_not_know, false_belief.',
    can_guide_others: 'Может ли проводить других по этому ребру.',
    will_share_for_free: 'Расскажет ли путь бесплатно.',
    will_share_for_payment: 'Расскажет ли за плату.',
    will_hide_or_lie: 'Скроет или солжёт о пути.',
    places_known_on_graph_edge: 'JSON: места, известные по этому ребру графа.'
  },
  source_records: {
    source_type:
      'book, article, chronicle, academic_database, project_note, …',
    publication_year: 'Год публикации; NULL если ongoing/неизвестен.',
    period_covered: 'Период истории, который покрывает источник.',
    region_covered: 'География источника.',
    reliability_level: 'Оценка надёжности (произвольный текст или код).',
    checked_by: 'Кто проверил источник.',
    checked_at: 'Когда проверили.'
  },
  record_sources: {
    support_type: 'supports, contradicts, partial, background, uncertain.'
  },
  audit_log: {
    action_type:
      'created, updated, approved, rejected, marked_conflict, merged, split, needs_review.',
    old_value: 'JSON или текст старого значения.',
    new_value: 'JSON или текст нового значения.',
    changed_by: 'Кто внёс изменение.',
    review_status: 'Статус ревью правки.'
  },
  regions: {
    canonical_name: 'Каноническое имя региона (как в world_regions).',
    display_name: 'Имя для UI и прозы.',
    alt_names: 'JSON: альтернативные названия.',
    neighbor_regions: 'JSON: краткий список соседей (дубль region_neighbors).',
    llm_generation_rules: 'JSON: жёсткие правила для LLM при генерации в регионе.',
    llm_forbidden_assumptions: 'JSON: что LLM не должен додумывать.'
  },
  places: {
    place_type:
      'city, village, pogost, monastery, ford, pier, …',
    is_fixed_historical_place: 'Исторически фиксированное место (не процедурное).',
    is_generated_place: 'Место создано LLM и утверждено в справочник.',
    generation_source: 'Откуда взялось место: seed, llm, manual, …'
  },
  historical_event_phases: {
    phase_name: 'background, omens, escalation, impact, aftermath.',
    phase_order: 'Порядок фазы в жизненном цикле события.',
    affected_graph_edges: 'JSON: id из graph_edges, затронутых фазой.'
  },
  llm_context_packs: {
    context_type:
      'region_start, new_place_generation, npc_generation, route_generation, …',
    included_tables: 'JSON: какие таблицы входят в пакет.',
    included_record_ids: 'JSON: конкретные id записей.',
    prompt_text: 'Готовый текст для вставки в промпт.',
    hard_constraints: 'JSON: жёсткие ограничения для LLM.',
    max_tokens_estimate: 'Оценка размера пакета в токенах.'
  },
  llm_validation_rules: {
    validation_type: 'Тип проверки генерации.',
    severity: 'warning, error, hard_block.',
    rule_text: 'Текст правила валидации.',
    applies_to_generation_step: 'На каком шаге пайплайна проверять.'
  },
  landscape_templates: {
    parent_landscape_template_id:
      'FK → landscape_templates(id): родитель в иерархии частных вариантов среды.',
    landscape_group:
      'Природная группа суши: forest, swamp, meadow, floodplain, hill, ravine, steppe, marsh, bog, mountain, desert. Без mixed/water/road/settlement/urban/field. Без riverbank/lake_shore/coast — берег только G2–G5 или hydrology_notes.',
    base_environment:
      'Главный природный класс среды (NOT NULL); не объект, не инфраструктура, не хозяйство.',
    dominant_vegetation: 'Преобладающая растительность, если применимо.',
    forest_type: 'Тип леса для лесной среды.',
    moisture_level: 'Влажность среды: сухая, влажная, заболоченная и т.п.',
    relief_type: 'Рельеф: равнина, холмы, овраг, склон, горная зона.',
    soil_ground_type: 'Почва/грунт: движение, строительство, сезонность.',
    openness: 'Открытость для обзора, движения, засады, ориентирования.',
    seasonal_stability: 'Насколько среда меняется по сезонам.',
    base_movement_multiplier: 'Базовый множитель к нормальному пешему GU (1 = норма).',
    default_orientation_difficulty:
      'Сложность ориентирования: none, easy, ordinary, hard, dangerous, extreme.',
    base_risk_level: 'Базовый риск ландшафта: none, low, medium, high, extreme.',
    game_use:
      'Базовая природная среда для primary/secondary на graph_nodes и landscape_template_id при offroad_crossing; LLM — проходимость, ориентация, риск, сезон, наполнение сцены.',
    limits:
      'Не дорога, не поселение, не пашня, не вода, не берег, не маршрут; инфраструктура/хозяйство/вода/берег — route_templates, place_templates, land_use_templates, water_body_templates, graph. Для *_dominant болот/топей — только primary при доминировании в G1; для floodplain_* — не обычный берег реки.'
  },
  region_landscape_templates: {
    is_allowed: 'Разрешена ли базовая среда для узлов/рёбер региона (trigger + LLM).',
    is_common: 'Частая среда региона.',
    is_dominant: 'Доминирующая среда региона.',
    is_rare: 'Редкая среда региона.',
    generation_weight: 'Вес при генерации/распределении (>= 0).',
    allowed_scale_levels: 'JSON: допустимые scale_level (G1, G2, …).',
    allowed_node_types: 'JSON: допустимые node_type для этой среды в регионе.',
    regional_limits: 'Региональные ограничения.'
  },
  water_body_templates: {
    water_body_type: 'Тип водного объекта (река, озеро, море, ручей, …).',
    salinity: 'Пресная/солёная/браковая вода.',
    flow_type: 'Течение: стоячая, медленная, быстрая, …',
    drinkable_default: 'Питьевая пригодность по умолчанию.',
    supports_boat: 'Допускает или требует судно.',
    supports_ford: 'Возможен брод.',
    supports_ferry: 'Возможна переправа.',
    supports_bridge: 'Возможен мост.',
    supports_winter_crossing: 'Переход по льду/зимнику.',
    freeze_pattern: 'Паттерн замерзания по сезонам.',
    flood_risk: 'Риск паводка/подтопления.',
    base_crossing_risk: 'Базовый риск переправы.',
    navigation_use: 'Судоходность и навигация: допустимые суда, сезонность, ограничения хода.',
    water_hazard_notes: 'Типичные водные опасности: лёд, течение, топь, прилив, промоины.',
    game_use:
      'Как игровой код и LLM используют тип воды на G1 (primary/secondary water_body_template_id) и на рёбрах (water_body_template_id).',
    limits:
      'Что этот тип не заменяет: не берег, не маршрут, не конкретная река/озеро; берег — G2–G5 или hydrology_notes.'
  },
  route_templates: {
    route_kind: 'Класс инфраструктуры: дорога, тропа, зимник, волок, речной ход, …',
    default_edge_type: 'Типичный edge_type для graph_edges с этим шаблоном.',
    surface_type: 'Покрытие/поверхность пути.',
    requires_landscape_template: 'Ребро должно иметь landscape_template_id.',
    requires_water_body_template: 'Ребро должно иметь water_body_template_id.',
    default_movement_multiplier: 'Базовый множитель времени для этого типа пути.'
  },
  land_use_templates: {
    land_use_kind: 'Вид хозяйственного использования: пашня, покос, выгон, …',
    compatible_landscape_template_ids: 'JSON: совместимые базовые среды.',
    compatible_water_body_template_ids: 'JSON: совместимые водные типы.',
    requires_settlement_nearby: 'Требует близкого поселения.',
    requires_specific_landscape: 'Требует конкретную базовую среду.'
  },
  place_templates: {
    place_kind: 'Тип места: деревня, погост, монастырь, …',
    default_node_type: 'Типичный node_type graph_nodes для этого места.',
    compatible_landscape_template_ids: 'JSON: на каких средах возможно.',
    compatible_route_template_ids: 'JSON: какие типы путей нужны рядом.',
    compatible_land_use_template_ids: 'JSON: типичное хозяйство рядом.'
  },
  region_place_templates: {
    is_allowed: 'Разрешён ли тип места в регионе.',
    generation_weight: 'Вес при генерации (>= 0).'
  },
  region_place_generation_rules: {
    template_type:
      'Тип генерируемого места: village, pogost, forest_camp, …',
    generation_allowed: 'Разрешена ли LLM-генерация по этому правилу.',
    layout_rules: 'JSON: правила планировки места.',
    npc_generation_rules: 'JSON: правила NPC для места.'
  },
  environment_landmark_templates: {
    category_id: 'FK → universal_categories(id): approved landmark category.',
    public_label_key: 'Ключ функционального player-facing label; не собственное имя.',
    icon_key: 'Approved semantic icon key без generic fallback.',
    morphology_policy: 'Закрытая versioned morphology policy без внешних ID.'
  },
  environment_landmark_rules: {
    profile_id: 'FK → environment_landmark_profiles(id): применяемый regional profile.',
    min_count: 'Минимум materialized landmarks; > 0 делает пустой candidate set hard block.',
    max_count: 'Максимум deterministic materialized landmarks.',
    exclusivity_group: 'Группа взаимного исключения placement instances.'
  },
  environment_cue_templates: {
    sense: 'Канал восприятия: sight, sound или smell.',
    base_intensity: 'Явная исходная интенсивность cue; runtime не подставляет значение.',
    recognition_difficulty: 'Явная сложность распознавания cue.',
    navigation_value: 'Явная навигационная ценность распознанного cue.',
    fading_duration_minutes: 'Длительность controlled fading после прекращения emitter.',
    expiry_duration_minutes: 'Возраст, после которого cue сохраняется только в истории.',
    propagation_policy: 'Закрытая versioned policy физического распространения cue.',
    visibility_policy: 'Закрытая versioned policy физической различимости cue.'
  },
  environment_emission_rules: {
    cue_template_id: 'FK → environment_cue_templates(id): тип порождаемого сигнала.',
    emitter_category_id: 'FK → universal_categories(id): approved emitter category.',
    emission_policy: 'Закрытая versioned policy интенсивности и применимости emitter.'
  },
  environment_trace_templates: {
    category_id: 'FK → universal_categories(id): approved trace category.',
    recognition_difficulty: 'Сложность распознавания физически различимого следа.',
    navigation_value: 'Явная навигационная ценность распознанного следа.'
  },
  environment_decay_profiles: {
    readable_at_or_above: 'Порог силы, при котором trace остаётся readable.',
    faint_at_or_above: 'Порог силы, ниже которого trace остаётся только faint.',
    decay_per_minute: 'Явный базовый темп угасания trace за минуту.',
    precipitation_multiplier: 'Явный коэффициент угасания при осадках.',
    decay_policy: 'Закрытая versioned policy decay coefficients; не external references.'
  },
  environment_trace_creation_rules: {
    trace_template_id: 'FK → environment_trace_templates(id): создаваемый тип следа.',
    decay_profile_id: 'FK → environment_decay_profiles(id): policy его исчезновения.',
    source_category_id: 'FK → universal_categories(id): approved source category.',
    creation_policy: 'Закрытая versioned policy причинного создания trace.'
  }
};
