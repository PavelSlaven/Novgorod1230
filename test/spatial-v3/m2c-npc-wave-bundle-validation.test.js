import assert from 'node:assert/strict';
import test from 'node:test';
import { validateM2cNpcWaveApproval } from '../../tools/spatial-v3/m2c-npc-wave-approval.mjs';
import {
  M2C_NPC_WAVE_TABLE_SET,
  validateM2cNpcWaveBundle,
} from '../../tools/spatial-v3/m2c-npc-wave-bundle-validation.mjs';

const REV = 'novgorod_spatial_v3_target_contract_approval_001';
const PROV = 'game_base_v1_m2c_people_3ab1c890';

function baseManifest(overrides = {}) {
  return {
    bundle_id: 'novgorod_m2c_npc_wave_v1',
    bundle_kind: 'dependency_closure',
    world_revision_id: REV,
    data_gaps: [],
    ...overrides,
  };
}

function emptyWaveDatasets(overrides = {}) {
  const datasets = new Map();
  for (const table of M2C_NPC_WAVE_TABLE_SET) datasets.set(table, []);
  datasets.set('spatial_v3_nodes', []);
  for (const [table, rows] of Object.entries(overrides)) datasets.set(table, rows);
  return datasets;
}

function collectErrors(manifest, datasets) {
  const errors = [];
  validateM2cNpcWaveBundle(manifest, datasets, errors);
  return errors;
}

function assertSingleCode(errors, code) {
  assert.ok(errors.some((error) => error.code === code), `expected ${code}, got ${errors.map((e) => e.code).join(', ')}`);
}

function minimalPlaceFamily(id = 'pf_test') {
  return {
    id,
    version: 1,
    world_revision_id: REV,
    status: 'approved',
    provenance_ref: PROV,
  };
}

function minimalPresenceRule(overrides = {}) {
  return {
    rule_id: 'pr_test',
    rule_version: 1,
    world_revision_id: REV,
    scope_kind: 'place_family',
    scope_ref: 'pf_test',
    region_id: null,
    subject_kind: 'category',
    subject_ref: 'cat_a',
    variants: [],
    allowed_seasons: ['all'],
    allowed_times: [],
    provenance_ref: PROV,
    status: 'approved',
    ...overrides,
  };
}

function minimalPrimaryBinding(overrides = {}) {
  return {
    world_revision_id: REV,
    node_id: 'node_a',
    node_version: 1,
    place_family_id: 'pf_test',
    place_family_version: 1,
    binding_role: 'primary',
    status: 'approved',
    provenance_ref: PROV,
    ...overrides,
  };
}

test('M2C_WAVE_BUNDLE_KIND_INVALID', () => {
  const errors = collectErrors(baseManifest({ bundle_kind: 'full_bundle' }), emptyWaveDatasets());
  assertSingleCode(errors, 'M2C_WAVE_BUNDLE_KIND_INVALID');
});

test('M2C_WAVE_DATA_GAPS_NONEMPTY', () => {
  const errors = collectErrors(baseManifest({ data_gaps: [{ code: 'X', subject_ref: 'y', dependency_pins: ['p'], blocking: true }] }), emptyWaveDatasets());
  assertSingleCode(errors, 'M2C_WAVE_DATA_GAPS_NONEMPTY');
});

test('M2C_WAVE_DATASET_MISSING', () => {
  const datasets = emptyWaveDatasets();
  datasets.delete('fauna_phase_activity_rules');
  const errors = collectErrors(baseManifest(), datasets);
  assertSingleCode(errors, 'M2C_WAVE_DATASET_MISSING');
});

test('M2C_WAVE_PRESENCE_SCOPE_UNKNOWN', () => {
  const errors = collectErrors(baseManifest(), emptyWaveDatasets({
    place_families: [minimalPlaceFamily()],
    presence_rules: [minimalPresenceRule({ scope_ref: 'pf_missing' })],
  }));
  assertSingleCode(errors, 'M2C_WAVE_PRESENCE_SCOPE_UNKNOWN');
});

test('M2C_WAVE_PEOPLE_ALLOWED_TIMES_FORBIDDEN', () => {
  const errors = collectErrors(baseManifest(), emptyWaveDatasets({
    place_families: [minimalPlaceFamily()],
    presence_rules: [minimalPresenceRule({
      subject_kind: 'occupation',
      subject_ref: 'nov_role_x',
      allowed_times: ['day'],
    })],
  }));
  assertSingleCode(errors, 'M2C_WAVE_PEOPLE_ALLOWED_TIMES_FORBIDDEN');
});

test('M2C_WAVE_PRESENCE_C4_CONFLICT', () => {
  const ruleA = minimalPresenceRule({ rule_id: 'pr_a' });
  const ruleB = minimalPresenceRule({ rule_id: 'pr_b' });
  const errors = collectErrors(baseManifest(), emptyWaveDatasets({
    place_families: [minimalPlaceFamily()],
    presence_rules: [ruleA, ruleB],
  }));
  assertSingleCode(errors, 'M2C_WAVE_PRESENCE_C4_CONFLICT');
});

test('M2C_WAVE_NODES_DATASET_REQUIRED', () => {
  const errors = collectErrors(baseManifest(), emptyWaveDatasets({
    place_families: [minimalPlaceFamily()],
    spatial_node_place_family_bindings: [minimalPrimaryBinding()],
  }));
  assertSingleCode(errors, 'M2C_WAVE_NODES_DATASET_REQUIRED');
});

test('wave validation runs for non-canonical bundle_id when wave tables present', () => {
  const errors = collectErrors(baseManifest({ bundle_id: 'not_the_wave_bundle_id' }), emptyWaveDatasets({
    place_families: [minimalPlaceFamily()],
    spatial_node_place_family_bindings: [minimalPrimaryBinding()],
  }));
  assertSingleCode(errors, 'M2C_WAVE_NODES_DATASET_REQUIRED');
});

test('M2C_WAVE_BINDING_NODE_NOT_IN_CLOSURE', () => {
  const errors = collectErrors(baseManifest(), emptyWaveDatasets({
    place_families: [minimalPlaceFamily()],
    spatial_v3_nodes: [{ id: 'other_node', version: 1 }],
    spatial_node_place_family_bindings: [minimalPrimaryBinding()],
  }));
  assertSingleCode(errors, 'M2C_WAVE_BINDING_NODE_NOT_IN_CLOSURE');
});

test('M2C_WAVE_BINDING_ROLE_INVALID', () => {
  const errors = collectErrors(baseManifest(), emptyWaveDatasets({
    place_families: [minimalPlaceFamily()],
    spatial_v3_nodes: [{ id: 'node_a', version: 1 }],
    spatial_node_place_family_bindings: [minimalPrimaryBinding({ binding_role: 'secondary' })],
  }));
  assertSingleCode(errors, 'M2C_WAVE_BINDING_ROLE_INVALID');
});

test('M2C_WAVE_BINDING_PRIMARY_DUPLICATE', () => {
  const binding = minimalPrimaryBinding();
  const errors = collectErrors(baseManifest(), emptyWaveDatasets({
    place_families: [minimalPlaceFamily()],
    spatial_v3_nodes: [{ id: 'node_a', version: 1 }],
    spatial_node_place_family_bindings: [binding, { ...binding, place_family_id: 'pf_other' }],
  }));
  assertSingleCode(errors, 'M2C_WAVE_BINDING_PRIMARY_DUPLICATE');
});

test('M2C_WAVE_VARIANTS_NULL_ELEMENT', () => {
  const errors = collectErrors(baseManifest(), emptyWaveDatasets({
    place_families: [minimalPlaceFamily()],
    presence_rules: [minimalPresenceRule({ variants: [null] })],
  }));
  assertSingleCode(errors, 'M2C_WAVE_VARIANTS_NULL_ELEMENT');
});

test('M2C_WAVE_VARIANTS_STRING_FORBIDDEN', () => {
  const errors = collectErrors(baseManifest(), emptyWaveDatasets({
    place_families: [minimalPlaceFamily()],
    presence_rules: [minimalPresenceRule({ variants: ['it_bad'] })],
  }));
  assertSingleCode(errors, 'M2C_WAVE_VARIANTS_STRING_FORBIDDEN');
});

test('M2C_WAVE_WORLD_REVISION_MISMATCH', () => {
  const errors = collectErrors(baseManifest(), emptyWaveDatasets({
    place_families: [minimalPlaceFamily()],
    presence_rules: [minimalPresenceRule({ world_revision_id: 'wrong_revision' })],
  }));
  assertSingleCode(errors, 'M2C_WAVE_WORLD_REVISION_MISMATCH');
});

test('M2C_WAVE_ROW_PROVENANCE_INVALID', () => {
  const errors = collectErrors(baseManifest(), emptyWaveDatasets({
    place_families: [minimalPlaceFamily()],
    presence_rules: [minimalPresenceRule({ provenance_ref: '' })],
  }));
  assertSingleCode(errors, 'M2C_WAVE_ROW_PROVENANCE_INVALID');
});

test('M2C_WAVE_APPROVAL_MISSING', async () => {
  const result = await validateM2cNpcWaveApproval({
    root: process.cwd(),
    approvalPath: 'data/world-catalogs/novgorod/m2c-npc-wave/v1/approval-missing-for-test.json',
  });
  assert.equal(result.ok, false);
  assert.equal(result.errors[0].code, 'M2C_WAVE_APPROVAL_MISSING');
});
