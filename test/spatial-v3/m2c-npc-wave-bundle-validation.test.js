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
    item_ref: 'it_a',
    variants: [],
    entry_visible_if: 'placed_exposed',
    search_only_if: 'placed_concealed',
    entry_exposed_weight: null,
    search_concealed_weight: null,
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

test('M2C_WAVE_PRESENCE_DISCOVERY_WEIGHTS_INVALID', () => {
  const errors = collectErrors(baseManifest(), emptyWaveDatasets({
    place_families: [minimalPlaceFamily()],
    presence_rules: [minimalPresenceRule({ entry_exposed_weight: 0, search_concealed_weight: 0 })],
  }));
  assertSingleCode(errors, 'M2C_WAVE_PRESENCE_DISCOVERY_WEIGHTS_INVALID');
});

test('M2C_WAVE_SINGLE_MODE_ZERO_WEIGHTS_INVALID', () => {
  for (const overrides of [
    { entry_visible_if: 'placed_exposed', search_only_if: null },
    { entry_visible_if: null, search_only_if: 'placed_concealed' },
  ]) {
    const errors = collectErrors(baseManifest(), emptyWaveDatasets({
      place_families: [minimalPlaceFamily()],
      presence_rules: [minimalPresenceRule({ entry_exposed_weight: 0,
        search_concealed_weight: 0, ...overrides })],
    }));
    assertSingleCode(errors, 'M2C_WAVE_PRESENCE_DISCOVERY_WEIGHTS_INVALID');
  }
});

test('M2C_WAVE_SINGLE_MODE_WITH_NULL_WEIGHTS_IS_VALID', () => {
  for (const overrides of [
    { entry_visible_if: 'placed_exposed', search_only_if: null },
    { entry_visible_if: null, search_only_if: 'placed_concealed' },
  ]) {
    const errors = collectErrors(baseManifest(), emptyWaveDatasets({
      place_families: [minimalPlaceFamily()],
      presence_rules: [minimalPresenceRule({ entry_exposed_weight: null,
        search_concealed_weight: null, ...overrides })],
    }));
    assert.deepEqual(errors, []);
  }
});

test('M2C_WAVE_PRESENCE_DISCOVERY_MODE_INVALID', () => {
  const errors = collectErrors(baseManifest(), emptyWaveDatasets({
    place_families: [minimalPlaceFamily()],
    presence_rules: [minimalPresenceRule({ entry_visible_if: null, search_only_if: null })],
  }));
  assertSingleCode(errors, 'M2C_WAVE_PRESENCE_DISCOVERY_MODE_INVALID');
});

test('M2C_WAVE_NON_ITEM_DISCOVERY_FIELDS_FORBIDDEN', () => {
  const errors = collectErrors(baseManifest(), emptyWaveDatasets({
    place_families: [minimalPlaceFamily()],
    presence_rules: [minimalPresenceRule({ item_ref: null, entry_visible_if: null,
      search_only_if: null, entry_exposed_weight: 1, search_concealed_weight: null })],
  }));
  assertSingleCode(errors, 'M2C_WAVE_NON_ITEM_DISCOVERY_FIELDS_FORBIDDEN');
});

test('M2C_WAVE_NON_ITEM_WITHOUT_DISCOVERY_FIELDS_IS_VALID', () => {
  const errors = collectErrors(baseManifest(), emptyWaveDatasets({
    place_families: [minimalPlaceFamily()],
    presence_rules: [minimalPresenceRule({ item_ref: null, entry_visible_if: null,
      search_only_if: null, entry_exposed_weight: null, search_concealed_weight: null })],
  }));
  assert.deepEqual(errors, []);
});

test('M2C_WAVE_NONEMPTY_VARIANTS_REQUIRE_BASE_ITEM_REF', () => {
  const errors = collectErrors(baseManifest(), emptyWaveDatasets({
    place_families: [minimalPlaceFamily()],
    presence_rules: [minimalPresenceRule({ item_ref: null, variants: [{ item_ref: 'it_variant' }] })],
  }));
  assertSingleCode(errors, 'M2C_WAVE_VARIANTS_REQUIRE_BASE_ITEM_REF');
});

test('M2C_WAVE_VARIANTS_REQUIRE_ITEM_REF_ON_EVERY_VARIANT', () => {
  const errors = collectErrors(baseManifest(), emptyWaveDatasets({
    place_families: [minimalPlaceFamily()],
    presence_rules: [minimalPresenceRule({ variants: [{ variant_ref: 'it_variant' }] })],
  }));
  assertSingleCode(errors, 'M2C_WAVE_VARIANT_ITEM_REF_INVALID');
});

test('M2C_WAVE_VARIANTS_MUST_BE_ARRAY', () => {
  for (const variants of [{ item_ref: 'it_variant' }, 'it_variant', 1, null]) {
    const errors = collectErrors(baseManifest(), emptyWaveDatasets({
      place_families: [minimalPlaceFamily()],
      presence_rules: [minimalPresenceRule({ variants })],
    }));
    assertSingleCode(errors, 'M2C_WAVE_VARIANTS_NOT_ARRAY');
  }
});

test('M2C_WAVE_VALID_ITEM_VARIANTS_ARE_ACCEPTED', () => {
  const errors = collectErrors(baseManifest(), emptyWaveDatasets({
    place_families: [minimalPlaceFamily()],
    presence_rules: [minimalPresenceRule({ variants: [{ item_ref: 'it_variant' }] })],
  }));
  assert.deepEqual(errors, []);
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

const validRoutineProfile = {
  schema: 'npc_routine_profile_v1',
  profile_id: 'sch_test',
  revision: 1,
  status: 'approved',
  phases: [
    { state_id: 'a', duration_minutes: 720, runtime_status: 'available', activity_ref: 'act_a',
      summary: 'A', activity_status: 'active', can_continue_automatically: true, decision_required: false },
    { state_id: 'b', duration_minutes: 720, runtime_status: 'sleeping', activity_ref: 'act_b',
      summary: 'B', activity_status: 'active', can_continue_automatically: true, decision_required: false },
  ],
};

function minimalScheduleRule(overrides = {}) {
  return {
    schedule_id: 'sch_test',
    schedule_version: 1,
    world_revision_id: REV,
    scope_kind: 'place_family',
    scope_ref: 'pf_ferry_landing',
    subject_kind: 'occupation',
    subject_ref: 'nov_occ_ferryman',
    season: 'summer',
    months: [6, 7, 8],
    day_type: 'normal',
    routine_profile: validRoutineProfile,
    status: 'approved',
    confidence: 'low',
    provenance_ref: PROV,
    authoring_payload: {},
    ...overrides,
  };
}

function minimalCompositionRule(overrides = {}) {
  return {
    composition_id: 'pf_ferry_landing',
    composition_version: 1,
    world_revision_id: REV,
    place_family_id: 'pf_ferry_landing',
    place_family_version: 1,
    population_groups: [{
      group_id: 'pf_ferry_landing.ferryman',
      weighted_subjects: [{ subject_kind: 'occupation', subject_ref: 'nov_occ_ferryman', weight: 1 }],
    }],
    scheduled_absences: [],
    empty_reason: null,
    status: 'approved',
    confidence: 'low',
    provenance_ref: PROV,
    authoring_payload: {},
    ...overrides,
  };
}

test('M2C_WAVE_COMPOSITION_PRESENCE_CONFLICT on ferry without creation_owner', () => {
  const pf = { ...minimalPlaceFamily('pf_ferry_landing'), id: 'pf_ferry_landing' };
  const errors = collectErrors(baseManifest(), emptyWaveDatasets({
    place_families: [pf],
    place_population_composition_rules: [minimalCompositionRule()],
    presence_rules: [minimalPresenceRule({
      scope_ref: 'pf_ferry_landing',
      subject_kind: 'occupation',
      subject_ref: 'nov_occ_ferryman',
      presence_probability_ppm: 250000,
      authoring_payload: {},
    })],
  }));
  assertSingleCode(errors, 'M2C_WAVE_COMPOSITION_PRESENCE_CONFLICT');
});

test('M2C_WAVE_COMPOSITION_PRESENCE_CONFLICT absent when creation_owner composition', () => {
  const pf = { ...minimalPlaceFamily('pf_peasant_homestead'), id: 'pf_peasant_homestead' };
  const errors = collectErrors(baseManifest(), emptyWaveDatasets({
    place_families: [pf],
    place_population_composition_rules: [{
      ...minimalCompositionRule({
        composition_id: 'pf_peasant_homestead',
        place_family_id: 'pf_peasant_homestead',
        population_groups: [{
          group_id: 'householder',
          weighted_subjects: [{ subject_kind: 'social_role', subject_ref: 'nov_role_smerd_householder', weight: 1 }],
        }],
      }),
    }],
    presence_rules: [minimalPresenceRule({
      scope_ref: 'pf_peasant_homestead',
      subject_kind: 'social_role',
      subject_ref: 'nov_role_smerd_householder',
      presence_probability_ppm: 250000,
      authoring_payload: { creation_owner: 'composition' },
    })],
  }));
  assert.equal(errors.filter((e) => e.code === 'M2C_WAVE_COMPOSITION_PRESENCE_CONFLICT').length, 0);
});

test('M2C_WAVE_COMPOSITION_GROUP_INVALID when weighted_subjects empty', () => {
  const errors = collectErrors(baseManifest(), emptyWaveDatasets({
    place_families: [minimalPlaceFamily('pf_ferry_landing')],
    place_population_composition_rules: [minimalCompositionRule({
      population_groups: [{ group_id: 'g1', weighted_subjects: [] }],
    })],
  }));
  assertSingleCode(errors, 'M2C_WAVE_COMPOSITION_GROUP_INVALID');
});

test('M2C_WAVE_COMPOSITION_GROUP_INVALID when weight is zero', () => {
  const errors = collectErrors(baseManifest(), emptyWaveDatasets({
    place_families: [minimalPlaceFamily('pf_ferry_landing')],
    place_population_composition_rules: [minimalCompositionRule({
      population_groups: [{
        group_id: 'g1',
        weighted_subjects: [{ subject_kind: 'occupation', subject_ref: 'nov_occ_ferryman', weight: 0 }],
      }],
    })],
  }));
  assertSingleCode(errors, 'M2C_WAVE_COMPOSITION_GROUP_INVALID');
});

test('M2C_WAVE_SCHEDULE_SUBJECT_SEASON_CONFLICT when months overlap', () => {
  const rule = minimalScheduleRule();
  const errors = collectErrors(baseManifest(), emptyWaveDatasets({
    place_families: [minimalPlaceFamily('pf_ferry_landing')],
    npc_schedule_routine_rules: [rule, { ...rule, schedule_id: 'sch_dup' }],
  }));
  assertSingleCode(errors, 'M2C_WAVE_SCHEDULE_SUBJECT_SEASON_CONFLICT');
});

test('M2C_WAVE_SCHEDULE_SEASON_MONTHS_MISMATCH when month outside season', () => {
  const errors = collectErrors(baseManifest(), emptyWaveDatasets({
    place_families: [minimalPlaceFamily('pf_ferry_landing')],
    npc_schedule_routine_rules: [minimalScheduleRule({ season: 'winter', months: [7] })],
  }));
  assertSingleCode(errors, 'M2C_WAVE_SCHEDULE_SEASON_MONTHS_MISMATCH');
});

test('M2C_WAVE_SCHEDULE_ROUTINE_PROFILE_INVALID when routine profile has one phase', () => {
  const errors = collectErrors(baseManifest(), emptyWaveDatasets({
    place_families: [minimalPlaceFamily('pf_ferry_landing')],
    npc_schedule_routine_rules: [minimalScheduleRule({
      routine_profile: {
        ...validRoutineProfile,
        phases: [validRoutineProfile.phases[0]],
      },
    })],
  }));
  assertSingleCode(errors, 'M2C_WAVE_SCHEDULE_ROUTINE_PROFILE_INVALID');
});
