import pg from 'pg';
import { loadLocalEnv } from '../src/env.js';

const { Client } = pg;

await loadLocalEnv();

/** @type {Array<Record<string, unknown>>} */
export const LLM_VALIDATION_LANDSCAPE_RULES = [
  {
    id: 'val_no_shore_landscape_g1',
    slug: 'no_shore_landscape_g1',
    title: 'Запрет берега как ландшафта G1',
    validation_type: 'landscape_group',
    rule_text: 'На G1 (region_cell) запрещены landscape_group и primary_landscape_template_id со значениями riverbank, lake_shore, coast и любыми шаблонами lt_*_riverbank_*, lt_*_lake_shore_*, lt_*_coast_*. Берег — не базовая среда суши.',
    applies_to_table: 'graph_nodes',
    applies_to_generation_step: 'g1_region_cell',
    severity: 'hard_block',
    failure_message: 'Береговая зона указана как primary_landscape на G1 — это нарушение слоистой модели.',
    repair_instruction: 'Уберите берег из primary_landscape_template_id. Доминирующую сушу задайте через landscape_templates (лес, луг, пойма…). Воду — через primary_water_body_template_id. Берег оформите на G2–G5 (location, scene_anchor, place_locations.riverbank/pier) или в hydrology_notes.',
    examples_valid: [],
    examples_invalid: [
      { primary_landscape_template_id: 'lt_riverbank_sandy', scale_level: 'G1', node_type: 'region_cell' },
      { landscape_group: 'lake_shore', scale_level: 'G1' },
    ],
  },
  {
    id: 'val_g1_landscape_dominance',
    slug: 'g1_landscape_dominance',
    title: 'Доминирование суши на G1',
    validation_type: 'landscape_dominance',
    rule_text: 'primary_landscape_template_id на G1 — доминирующая природная среда суши ячейки (лес, луг, болото как среда, холмы…). secondary_landscape_template_ids — заметные, но не доминирующие среды; не дублируют primary.',
    applies_to_table: 'graph_nodes',
    applies_to_generation_step: 'g1_region_cell',
    severity: 'error',
    failure_message: 'primary_landscape не отражает доминирующую сушу ячейки или secondary дублирует primary.',
    repair_instruction: 'Выберите primary из region_landscape_templates с is_dominant=true или наибольшим generation_weight. Secondary — только для смешения (например лес + луг), без повторения primary.',
    examples_valid: [
      { primary_landscape_template_id: 'lt_forest_mixed', secondary_landscape_template_ids: ['lt_wet_meadow'], note: 'Лес доминирует, луг — вторичный' },
    ],
    examples_invalid: [
      { primary_landscape_template_id: 'lt_dry_meadow', secondary_landscape_template_ids: ['lt_forest_mixed'], note: 'Луг не может быть primary если лес доминирует' },
    ],
  },
  {
    id: 'val_g1_water_layer',
    slug: 'g1_water_layer',
    title: 'Вода — отдельный слой, не landscape',
    validation_type: 'water_layer',
    rule_text: 'Река, ручей, озеро, болото как водный объект, море, залив — задаются через primary_water_body_template_id / secondary_water_body_template_ids (water_body_templates), а не через landscape_group или landscape_templates с типом water.',
    applies_to_table: 'graph_nodes',
    applies_to_generation_step: 'g1_region_cell',
    severity: 'error',
    failure_message: 'Водный объект записан как ландшафт вместо water_body_template.',
    repair_instruction: 'Перенесите воду в primary_water_body_template_id. Для суши оставьте landscape (лес, пойма, болото как среда суши — lt_bog_dominant, lt_swamp_dominant).',
    examples_valid: [],
    examples_invalid: [
      { primary_landscape_template_id: 'lt_forest_mixed', landscape_group: 'water', note: 'water запрещён в landscape_group' },
    ],
  },
  {
    id: 'val_shore_local_only',
    slug: 'shore_local_only',
    title: 'Берег только локально (G2–G5)',
    validation_type: 'shore_local',
    rule_text: 'Понятие «берег» (riverbank, lake_shore, coast, пристань, брод) допустимо только на G2–G5: node_type place/location/scene_anchor, place_locations.location_type=riverbank|pier|ford, или текст в hydrology_notes. Только если у узла или соседа есть primary/secondary water_body_template_id.',
    applies_to_table: 'graph_nodes',
    applies_to_generation_step: 'g2_g5_local',
    severity: 'error',
    failure_message: 'Берег указан без водного слоя или на недопустимом масштабе.',
    repair_instruction: 'Добавьте water_body_template_id на G1-родителя или соседний узел. Берег оформите как location/scene_anchor, не как landscape_template.',
    examples_valid: [
      { scale_level: 'G4', node_type: 'location', location_type: 'riverbank', parent_has_water: 'wb_medium_fresh_river' },
    ],
    examples_invalid: [
      { scale_level: 'G1', primary_landscape_template_id: 'lt_coast_rocky', note: 'Берег как G1-ландшафт запрещён' },
    ],
  },
  {
    id: 'val_hydrology_notes',
    slug: 'hydrology_notes_required',
    title: 'hydrology_notes при наличии воды',
    validation_type: 'hydrology_notes',
    rule_text: 'Если у G1-узла задан primary_water_body_template_id, поле hydrology_notes должно быть заполнено: как вода расположена в ячейке, сезонность, переправы, связь с соседними узлами.',
    applies_to_table: 'graph_nodes',
    applies_to_generation_step: 'g1_region_cell',
    severity: 'warning',
    failure_message: 'primary_water_body_template_id задан, но hydrology_notes пуст.',
    repair_instruction: 'Заполните hydrology_notes: «озеро занимает северо-запад четверти ячейки», «река пересекает с востока на запад», «болото — центральная низина» и т.п.',
    examples_valid: [
      { primary_water_body_template_id: 'wb_small_fresh_lake', hydrology_notes: 'Озеро в северо-западной части ячейки; обход по южному берегу на G2.' },
    ],
    examples_invalid: [
      { primary_water_body_template_id: 'wb_medium_fresh_river', hydrology_notes: null },
    ],
  },
  {
    id: 'val_water_examples',
    slug: 'g1_water_landscape_examples',
    title: 'Эталонные примеры G1: лес + вода',
    validation_type: 'g1_examples',
    rule_text: 'Три канонических паттерна G1: (1) лес + озеро — primary lt_forest_mixed + wb_small_fresh_lake; (2) лес + река — primary lt_forest_mixed + wb_medium_fresh_river; (3) лес + болото — primary lt_forest_mixed + wb_bog_pool. Во всех случаях суша в landscape, вода в water_body.',
    applies_to_table: 'graph_nodes',
    applies_to_generation_step: 'g1_region_cell',
    severity: 'error',
    failure_message: 'G1-ячейка не соответствует каноническому паттерну «доминирующая суша + водный слой».',
    repair_instruction: 'Разделите слои: landscape = суша, water_body = вода. Берег не в landscape.',
    examples_valid: [
      {
        title: 'Лес + озеро',
        primary_landscape_template_id: 'lt_forest_mixed',
        primary_water_body_template_id: 'wb_small_fresh_lake',
        hydrology_notes: 'Лес покрывает большую часть ячейки; озеро — северо-западный сектор.',
      },
      {
        title: 'Лес + река',
        primary_landscape_template_id: 'lt_forest_mixed',
        primary_water_body_template_id: 'wb_medium_fresh_river',
        hydrology_notes: 'Река пересекает ячейку с севера на юг; лес по обоим берегам (берег — на G2).',
      },
      {
        title: 'Лес + болото',
        primary_landscape_template_id: 'lt_forest_mixed',
        primary_water_body_template_id: 'wb_bog_pool',
        hydrology_notes: 'Лес на возвышенностях; болото — центральная низина ячейки.',
      },
    ],
    examples_invalid: [
      {
        title: 'Берег как ландшафт',
        primary_landscape_template_id: 'lt_riverbank_meadow',
        primary_water_body_template_id: 'wb_medium_fresh_river',
        note: 'lt_riverbank_* не существует и запрещён',
      },
      {
        title: 'Озеро как ландшафт',
        primary_landscape_template_id: 'lt_forest_mixed',
        landscape_group: 'lake_shore',
        note: 'Озеро должно быть wb_*, не landscape_group',
      },
      {
        title: 'Вода без hydrology_notes',
        primary_landscape_template_id: 'lt_forest_mixed',
        primary_water_body_template_id: 'wb_stream',
        hydrology_notes: null,
      },
    ],
  },
];

function getAdminUrl() {
  const direct = String(process.env.WORLD_DB_ADMIN_URL ?? '').trim();
  if (direct) return direct;

  const user = process.env.POSTGRES_USER || 'world_admin';
  const password = encodeURIComponent(process.env.POSTGRES_PASSWORD ?? '');
  const db = process.env.POSTGRES_DB || 'world_db';
  const port = process.env.POSTGRES_PORT || '5432';
  const host = process.env.POSTGRES_HOST || '127.0.0.1';
  return `postgresql://${user}:${password}@${host}:${port}/${db}`;
}

const client = new Client({ connectionString: getAdminUrl() });

const isDirectRun = process.argv[1]?.endsWith('seed-llm-validation-landscape.js');

if (isDirectRun) {
try {
  await client.connect();

  for (const row of LLM_VALIDATION_LANDSCAPE_RULES) {
    await client.query(
      `INSERT INTO world_base.llm_validation_rules (
        id, slug, title, validation_type, rule_text, applies_to_table,
        applies_to_generation_step, severity, failure_message, repair_instruction,
        examples_valid, examples_invalid, status, confidence
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      ON CONFLICT (id) DO UPDATE SET
        slug = EXCLUDED.slug,
        title = EXCLUDED.title,
        validation_type = EXCLUDED.validation_type,
        rule_text = EXCLUDED.rule_text,
        applies_to_table = EXCLUDED.applies_to_table,
        applies_to_generation_step = EXCLUDED.applies_to_generation_step,
        severity = EXCLUDED.severity,
        failure_message = EXCLUDED.failure_message,
        repair_instruction = EXCLUDED.repair_instruction,
        examples_valid = EXCLUDED.examples_valid,
        examples_invalid = EXCLUDED.examples_invalid,
        status = EXCLUDED.status,
        confidence = EXCLUDED.confidence,
        updated_at = now()`,
      [
        row.id, row.slug, row.title, row.validation_type, row.rule_text,
        row.applies_to_table, row.applies_to_generation_step, row.severity,
        row.failure_message, row.repair_instruction,
        JSON.stringify(row.examples_valid), JSON.stringify(row.examples_invalid),
        'approved', 'high',
      ],
    );
  }

  const { rows } = await client.query('SELECT COUNT(*)::int AS count FROM world_base.llm_validation_rules');
  console.log(`llm_validation_rules (landscape): ${rows[0].count} rows (expected ${LLM_VALIDATION_LANDSCAPE_RULES.length} landscape rules seeded)`);
} catch (error) {
  console.error(error.message ?? error);
  process.exit(1);
} finally {
  await client.end();
}
}
