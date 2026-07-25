import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SPATIAL_V3_CONTRACT_VERSION,
  contractDefinitions,
  typedErrorDefinitions,
  validateSpatialV3Contract
} from '../src/spatial-v3/registry.js';

const temporalContracts = [
  'rational_minutes', 'game_timestamp', 'elapsed_time', 'calendar_profile_ref',
  'temporal_boundary_candidate', 'temporal_boundary_batch', 'temporal_advance_request',
  'temporal_advance_result', 'time_slice_plan', 'time_slice_result',
  'activity_profile_ref', 'participant_binding', 'resource_binding',
  'interruption_outcome', 'perception_result', 'npc_decision_request',
  'npc_decision_trace', 'remote_aggregate_state', 'remote_catch_up_request',
  'remote_catch_up_result', 'propagation_process_ref',
  'visible_package_persistence_envelope'
];

const temporalErrors = [
  'time_timestamp_invalid', 'time_elapsed_invalid', 'time_calendar_profile_gap',
  'time_owner_conflict', 'time_window_invalid', 'temporal_execution_unbounded',
  'temporal_boundary_ambiguous', 'temporal_boundary_cycle', 'temporal_candidate_stale',
  'temporal_change_set_conflict', 'activity_profile_gap', 'activity_policy_gap',
  'activity_precondition_stale', 'activity_transition_invalid', 'event_rule_gap',
  'event_effect_gap', 'npc_schedule_gap', 'npc_decision_policy_gap',
  'perception_policy_gap', 'weather_profile_gap', 'historical_phase_rule_gap',
  'remote_catch_up_rule_gap', 'propagation_rule_gap', 'visible_package_persistence_gap'
];

test('Temporal World v1.1 is the current 4.4 target contract set with one declaration per DTO/error', () => {
  assert.equal(SPATIAL_V3_CONTRACT_VERSION, '4.4.0-target.1');
  const contractNames = contractDefinitions.map(({ contract_name }) => contract_name);
  const errorCodes = typedErrorDefinitions.map(({ error_code }) => error_code);
  assert.equal(new Set(contractNames).size, contractNames.length);
  assert.equal(new Set(errorCodes).size, errorCodes.length);
  for (const name of temporalContracts) assert.equal(contractNames.filter((candidate) => candidate === name).length, 1, name);
  for (const code of temporalErrors) assert.equal(errorCodes.filter((candidate) => candidate === code).length, 1, code);
  assert.ok(typedErrorDefinitions.every(({ retryability }) => retryability));
});

test('Temporal DTO validators accept only canonical decimal strings', () => {
  assert.deepEqual(validateSpatialV3Contract('rational_minutes', { numerator: '1', denominator: '2' }), []);
  assert.ok(validateSpatialV3Contract('rational_minutes', { numerator: '01', denominator: '2' }).length > 0);
  assert.ok(validateSpatialV3Contract('rational_minutes', { numerator: 1, denominator: 2 }).length > 0);
  assert.ok(validateSpatialV3Contract('rational_minutes', { numerator: '2', denominator: '4' }).length > 0);
  assert.deepEqual(validateSpatialV3Contract('game_timestamp', {
    whole_minutes: '9007199254740993',
    subminute_numerator: '1',
    subminute_denominator: '3'
  }), []);
  const calendarSnapshot = {
    snapshot_id: 'calendar-1',
    exact_game_timestamp: { whole_minutes: '0', subminute_numerator: '0', subminute_denominator: '1' },
    calendar_profile_ref: {
      profile_ref: { entity_ref: { entity_kind: 'calendar_profile', entity_id: 'calendar-1' }, authoring_version: 'v1' },
      canonical_digest: 'a'.repeat(64)
    },
    year: '1230',
    month: '1',
    day: '1',
    local_time_of_day: { numerator: '0', denominator: '1' },
    daypart_id: 'night',
    season_id: 'winter',
    daylight_phase_id: 'dark',
    canonical_digest: 'b'.repeat(64)
  };
  assert.deepEqual(validateSpatialV3Contract('runtime_calendar_snapshot', calendarSnapshot), []);
  assert.ok(validateSpatialV3Contract('runtime_calendar_snapshot', { ...calendarSnapshot, year: 1230 }).length > 0);
});

test('Temporal activity status rejects invalidated and an active execution cannot be unbounded', () => {
  const base = {
    id: 'activity-1',
    route_plan_execution_id: 'execution-1',
    plan_step_ordinal: 0,
    series_ordinal: 0,
    activity_snapshot: {},
    status: 'invalidated',
    started_at: { whole_minutes: '0', subminute_numerator: '0', subminute_denominator: '1' },
    last_processed_at: { whole_minutes: '0', subminute_numerator: '0', subminute_denominator: '1' },
    exact_elapsed: { numerator: '0', denominator: '1' },
    preconditions_digest: 'a'.repeat(64),
    state_version: '1',
    updated_change_set_id: 'change-1'
  };
  assert.ok(validateSpatialV3Contract('party_timed_activity_execution', base)
    .some(({ code }) => code === 'activity_transition_invalid'));
  assert.ok(validateSpatialV3Contract('party_timed_activity_execution', { ...base, status: 'active' })
    .some(({ code }) => code === 'temporal_execution_unbounded'));
});

test('Factual visible envelope rejects hidden fields and combined write plans reject narration output', () => {
  const envelope = {
    package_id: 'visible-1',
    party_id: 'party-1',
    turn_id: 'turn-1',
    committed_state_version: '2',
    change_set_id: 'change-1',
    package_digest: 'a'.repeat(64),
    visible_payload: {
      schema: 'temporal_visible_package.v1',
      perceived_scene: 'Телега стоит у ворот.',
      perceived_changes: [],
      sensory_details: [],
      visible_npcs: [],
      visible_objects: [],
      known_context: [],
      uncertainties: [],
      hypotheses: [],
      player_safe_interruption: null,
      allowed_action_affordances: []
    },
    presentation_status: 'pending',
    projection_policy_ref: { entity_ref: { entity_kind: 'visibility_modifier', entity_id: 'projection-1' }, authoring_version: 'v1' },
    dependency_pins: { pins: [], canonical_digest: 'b'.repeat(64) },
    idempotency_record_id: 'idempotency-1'
  };
  assert.deepEqual(validateSpatialV3Contract('visible_package_persistence_envelope', envelope), []);

  const hidden = validateSpatialV3Contract('visible_package_persistence_envelope', {
    ...envelope,
    visible_payload: { ...envelope.visible_payload, hidden_event_queue: ['secret'] }
  });
  assert.ok(hidden.some(({ code }) => code === 'hidden_information_leak'));

  for (const visible_payload of [
    {
      ...envelope.visible_payload,
      visible_npcs: [{
        entity_ref: { entity_kind: 'npc', entity_id: 'npc-1' },
        display_label: 'Возница',
        recognition: 'recognized',
        internal_notes: 'готовится бежать'
      }]
    },
    {
      ...envelope.visible_payload,
      faction_disposition: 'hostile'
    }
  ]) {
    const neutralLeak = validateSpatialV3Contract('visible_package_persistence_envelope', {
      ...envelope,
      visible_payload
    });
    assert.ok(neutralLeak.some(({ code }) => code === 'hidden_information_leak'));
  }

  const planWithNarration = validateSpatialV3Contract('combined_write_plan', {
    plan_id: 'plan-1',
    party_id: 'party-1',
    write_plan_kind: 'semantic_commit',
    operation_kind: 'timed_activity',
    canonical_input_digest: 'a'.repeat(64),
    expected_state_versions: {},
    validation_report_digest: 'b'.repeat(64),
    write_set_digest: 'c'.repeat(64),
    idempotency_record_id: 'idem-1',
    narration_output: { text: 'must not be factual' }
  });
  assert.ok(planWithNarration.length > 0);
});
