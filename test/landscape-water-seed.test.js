import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LANDSCAPE_TEMPLATES } from '../scripts/seed-landscape-templates.js';
import { WATER_BODY_TEMPLATES } from '../scripts/seed-water-body-templates.js';
import { ROUTE_TEMPLATES } from '../scripts/seed-route-templates.js';
import { LAND_USE_TEMPLATES } from '../scripts/seed-land-use-templates.js';
import { PLACE_TEMPLATES } from '../scripts/seed-place-templates.js';
import { LLM_VALIDATION_LANDSCAPE_RULES } from '../scripts/seed-llm-validation-landscape.js';

const VALID_EDGE_TYPES = new Set([
  'road', 'path', 'river', 'lake_route', 'sea_route', 'winter_road', 'ford', 'ferry', 'bridge',
  'gate', 'street', 'door', 'yard_passage', 'forest_track', 'offroad_crossing', 'mountain_pass',
  'desert_route', 'steppe_route', 'border_transition', 'corridor_segment', 'portage',
]);

const VALID_NODE_TYPES = new Set([
  'world_region', 'subregion', 'place', 'location', 'minilocation', 'scene_anchor',
  'route_junction', 'river_junction', 'ford', 'ferry', 'gate', 'road_segment',
  'water_segment', 'border_crossing', 'sea_crossing', 'mountain_pass', 'desert_oasis', 'steppe_camp',
  'region_cell', 'cell_subgraph', 'map_corridor', 'geographic_landmark', 'historical_landmark',
]);

const VALID_SCALE_LEVELS = new Set(['G0', 'G1', 'G2', 'G3', 'G4', 'G5']);

const VALID_CATALOG_STATUS = new Set(['draft', 'usable_with_caution', 'needs_review']);
const VALID_CATALOG_CONFIDENCE = new Set(['medium', 'medium_high', 'medium_low']);

const WATER_ONLY_ROUTE_IDS = new Set([
  'rt_ford', 'rt_ferry', 'rt_bridge', 'rt_river_route', 'rt_lake_route', 'rt_sea_route',
]);

const TAXONOMY_FIELDS = [
  'dominant_vegetation',
  'moisture_level',
  'relief_type',
  'soil_ground_type',
  'openness',
  'seasonal_stability',
];

test('landscape catalog: 70 templates', () => {
  assert.equal(LANDSCAPE_TEMPLATES.length, 70);
});

test('landscape catalog: game_use, limits, status/confidence on all rows', () => {
  for (const row of LANDSCAPE_TEMPLATES) {
    assert.ok(String(row.game_use ?? '').length > 0, `game_use empty for ${row.id}`);
    assert.ok(String(row.limits ?? '').length > 0, `limits empty for ${row.id}`);
    assert.ok(VALID_CATALOG_STATUS.has(row.status), `${row.id} bad status: ${row.status}`);
    assert.ok(VALID_CATALOG_CONFIDENCE.has(row.confidence), `${row.id} bad confidence: ${row.confidence}`);
  }
});

test('landscape catalog: taxonomy fields populated', () => {
  for (const row of LANDSCAPE_TEMPLATES) {
    for (const field of TAXONOMY_FIELDS) {
      assert.ok(String(row[field] ?? '').length > 0, `${row.id}.${field} empty`);
    }
  }
});

test('landscape catalog: parent FK references exist', () => {
  const ids = new Set(LANDSCAPE_TEMPLATES.map((r) => r.id));
  for (const row of LANDSCAPE_TEMPLATES) {
    const parent = row.parent_landscape_template_id;
    if (parent) {
      assert.ok(ids.has(parent), `${row.id} parent missing: ${parent}`);
    }
  }
});

test('landscape catalog: base_movement_multiplier is numeric when set', () => {
  for (const row of LANDSCAPE_TEMPLATES) {
    if (row.base_movement_multiplier != null) {
      assert.ok(Number.isFinite(Number(row.base_movement_multiplier)), `${row.id} bad multiplier`);
    }
  }
});

test('water catalog: 41 templates', () => {
  assert.equal(WATER_BODY_TEMPLATES.length, 41);
});

test('water catalog: game_use, limits, status/confidence on all rows', () => {
  for (const row of WATER_BODY_TEMPLATES) {
    assert.ok(String(row.game_use ?? '').length > 0, `game_use empty for ${row.id}`);
    assert.ok(String(row.limits ?? '').length > 0, `limits empty for ${row.id}`);
    assert.ok(VALID_CATALOG_STATUS.has(row.status), `${row.id} bad status: ${row.status}`);
    assert.ok(VALID_CATALOG_CONFIDENCE.has(row.confidence), `${row.id} bad confidence: ${row.confidence}`);
  }
});

test('validation rules: val_no_shore_landscape_g1 present', () => {
  const rule = LLM_VALIDATION_LANDSCAPE_RULES.find((r) => r.id === 'val_no_shore_landscape_g1');
  assert.ok(rule);
  assert.equal(rule.severity, 'hard_block');
});

test('validation rules: val_water_examples has 3 valid G1 patterns', () => {
  const rule = LLM_VALIDATION_LANDSCAPE_RULES.find((r) => r.id === 'val_water_examples');
  assert.ok(rule);
  assert.equal(rule.examples_valid.length, 3);
});

test('route catalog: 21 templates', () => {
  assert.equal(ROUTE_TEMPLATES.length, 21);
});

test('route catalog: all ids start with rt_', () => {
  for (const row of ROUTE_TEMPLATES) {
    assert.match(row.id, /^rt_/, `bad id prefix: ${row.id}`);
  }
});

test('route catalog: game_use, limits, status/confidence on all rows', () => {
  for (const row of ROUTE_TEMPLATES) {
    assert.ok(String(row.game_use ?? '').length > 0, `game_use empty for ${row.id}`);
    assert.ok(String(row.limits ?? '').length > 0, `limits empty for ${row.id}`);
    assert.ok(VALID_CATALOG_STATUS.has(row.status), `${row.id} bad status: ${row.status}`);
    assert.ok(VALID_CATALOG_CONFIDENCE.has(row.confidence), `${row.id} bad confidence: ${row.confidence}`);
  }
});

test('route catalog: FK flag consistency', () => {
  for (const row of ROUTE_TEMPLATES) {
    if (WATER_ONLY_ROUTE_IDS.has(row.id)) {
      assert.equal(row.requires_water_body_template, true, `${row.id} should require water`);
      assert.equal(row.requires_landscape_template, false, `${row.id} should not require landscape`);
    } else if (row.id === 'rt_portage') {
      assert.equal(row.requires_water_body_template, true, `${row.id} should require water`);
      assert.equal(row.requires_landscape_template, true, `${row.id} should require landscape`);
    } else if (row.id === 'rt_corridor_segment') {
      assert.equal(row.requires_landscape_template, false, `${row.id} should not require landscape`);
      assert.equal(row.requires_water_body_template, false, `${row.id} should not require water`);
    } else {
      assert.equal(row.requires_landscape_template, true, `${row.id} should require landscape`);
      assert.equal(row.requires_water_body_template, false, `${row.id} should not require water`);
    }
  }
});

test('route catalog: default_edge_type valid', () => {
  for (const row of ROUTE_TEMPLATES) {
    assert.ok(
      VALID_EDGE_TYPES.has(row.default_edge_type),
      `invalid default_edge_type for ${row.id}: ${row.default_edge_type}`,
    );
  }
});

test('land use catalog: 45 templates', () => {
  assert.equal(LAND_USE_TEMPLATES.length, 45);
});

test('land use catalog: all ids start with lu_', () => {
  for (const row of LAND_USE_TEMPLATES) {
    assert.match(row.id, /^lu_/, `bad id prefix: ${row.id}`);
  }
});

test('land use catalog: game_use, limits, status/confidence on all rows', () => {
  for (const row of LAND_USE_TEMPLATES) {
    assert.ok(String(row.game_use ?? '').length > 0, `game_use empty for ${row.id}`);
    assert.ok(String(row.limits ?? '').length > 0, `limits empty for ${row.id}`);
    assert.ok(VALID_CATALOG_STATUS.has(row.status), `${row.id} bad status: ${row.status}`);
    assert.ok(VALID_CATALOG_CONFIDENCE.has(row.confidence), `${row.id} bad confidence: ${row.confidence}`);
  }
});

test('land use catalog: FK refs to landscape and water catalogs', () => {
  const landscapeIds = new Set(LANDSCAPE_TEMPLATES.map((r) => r.id));
  const waterIds = new Set(WATER_BODY_TEMPLATES.map((r) => r.id));

  for (const row of LAND_USE_TEMPLATES) {
    for (const ltId of row.compatible_landscape_template_ids ?? []) {
      assert.ok(landscapeIds.has(ltId), `${row.id} references missing landscape: ${ltId}`);
    }
    for (const wbId of row.compatible_water_body_template_ids ?? []) {
      assert.ok(waterIds.has(wbId), `${row.id} references missing water body: ${wbId}`);
    }
  }
});

test('land use catalog: requires_specific_landscape implies compatible landscapes', () => {
  for (const row of LAND_USE_TEMPLATES) {
    if (row.requires_specific_landscape) {
      assert.ok(
        Array.isArray(row.compatible_landscape_template_ids) && row.compatible_landscape_template_ids.length > 0,
        `${row.id} requires_specific_landscape but compatible_landscape_template_ids empty`,
      );
    }
  }
});

test('place catalog: 64 templates', () => {
  assert.equal(PLACE_TEMPLATES.length, 64);
});

test('place catalog: all ids start with pt_', () => {
  for (const row of PLACE_TEMPLATES) {
    assert.match(row.id, /^pt_/, `bad id prefix: ${row.id}`);
  }
});

test('place catalog: game_use, limits, status/confidence on all rows', () => {
  for (const row of PLACE_TEMPLATES) {
    assert.ok(String(row.game_use ?? '').length > 0, `game_use empty for ${row.id}`);
    assert.ok(String(row.limits ?? '').length > 0, `limits empty for ${row.id}`);
    assert.ok(VALID_CATALOG_STATUS.has(row.status), `${row.id} bad status: ${row.status}`);
    assert.ok(VALID_CATALOG_CONFIDENCE.has(row.confidence), `${row.id} bad confidence: ${row.confidence}`);
  }
});

test('place catalog: FK refs to all 4 layer catalogs', () => {
  const landscapeIds = new Set(LANDSCAPE_TEMPLATES.map((r) => r.id));
  const waterIds = new Set(WATER_BODY_TEMPLATES.map((r) => r.id));
  const routeIds = new Set(ROUTE_TEMPLATES.map((r) => r.id));
  const landUseIds = new Set(LAND_USE_TEMPLATES.map((r) => r.id));

  for (const row of PLACE_TEMPLATES) {
    for (const ltId of row.compatible_landscape_template_ids ?? []) {
      assert.ok(landscapeIds.has(ltId), `${row.id} references missing landscape: ${ltId}`);
    }
    for (const wbId of row.compatible_water_body_template_ids ?? []) {
      assert.ok(waterIds.has(wbId), `${row.id} references missing water body: ${wbId}`);
    }
    for (const rtId of row.compatible_route_template_ids ?? []) {
      assert.ok(routeIds.has(rtId), `${row.id} references missing route: ${rtId}`);
    }
    for (const luId of row.compatible_land_use_template_ids ?? []) {
      assert.ok(landUseIds.has(luId), `${row.id} references missing land use: ${luId}`);
    }
  }
});

test('place catalog: default_node_type and typical_scale_level valid when set', () => {
  for (const row of PLACE_TEMPLATES) {
    if (row.default_node_type) {
      assert.ok(
        VALID_NODE_TYPES.has(row.default_node_type),
        `invalid default_node_type for ${row.id}: ${row.default_node_type}`,
      );
    }
    if (row.typical_scale_level) {
      assert.ok(
        VALID_SCALE_LEVELS.has(row.typical_scale_level),
        `invalid typical_scale_level for ${row.id}: ${row.typical_scale_level}`,
      );
    }
  }
});
