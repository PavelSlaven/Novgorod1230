import assert from 'node:assert/strict';
import test from 'node:test';
import {
  loadLowerDvinaTracePhase3Content,
  validateLowerDvinaTracePhase3Content
} from '../../tools/world-catalog-workflow/src/lower-dvina-trace-phase-3-content-check.mjs';

const canonical = await loadLowerDvinaTracePhase3Content();

function mutation(label, mutate, expectedCode) {
  test(`Phase 3 content rejects ${label}`, () => {
    const changed = structuredClone(canonical);
    mutate(changed);
    assert.throws(
      () => validateLowerDvinaTracePhase3Content(changed),
      { code: expectedCode }
    );
  });
}

test('Phase 3 prerequisite pins the camp, three participants and both Eremey mappings', () => {
  assert.doesNotThrow(() => validateLowerDvinaTracePhase3Content(canonical));
  const binding = canonical.materialization_bindings;
  assert.equal(binding.camp_spatial_binding.location_profile_ref, 'trace_ld_v1_loc_fishing_camp');
  assert.equal(binding.camp_spatial_binding.anchor_template.slot_key, 'working_camp');
  const campLocation = canonical.location_topology_set.location_profiles.find(
    (value) => value.location_profile_id === binding.camp_spatial_binding.location_profile_ref
  );
  assert.equal(
    campLocation.spatial_candidate_set.candidates[0].g3_node_ref.id,
    'gn_nov_g3_xp017_yp026_r2_vikhtuy_river_approach'
  );
  assert.equal(
    campLocation.spatial_candidate_set.candidates[0].g4_node_ref.id,
    'g4v3__gn_nov_g3_xp017_yp026_r2_vikhtuy_river_approach'
  );
  assert.equal(
    binding.camp_spatial_binding.anchor_template.state.access_policy_ref,
    'trace_ld_v1_access_fishing_camp'
  );
  assert.equal(
    binding.camp_spatial_binding.anchor_template.state.capacity_contract_ref,
    'trace_ld_v1_capacity_fishing_camp'
  );
  assert.equal(binding.camp_spatial_binding.entry_route_ref, 'trace_ld_v1_route_wreck_to_camp');
  assert.equal(binding.initial_participant_placements.length, 3);
  assert.equal(
    new Set(binding.initial_participant_placements.map((value) => value.participant_slot_ref)).size,
    3
  );
  const mappings = canonical.knowledge_lie_memory_rules.interaction_persistence_mappings;
  assert.deepEqual(
    mappings.map((value) => value.statement_template_ref).sort(),
    [
      'trace_ld_v1_statement_eremey_disclosure',
      'trace_ld_v1_statement_eremey_first_answer'
    ]
  );
  assert.equal(
    mappings.every((value) => (
      value.timestamp_projection.source_record === 'committed_activity'
      && value.timestamp_projection.source_field === 'game_timestamp'
      && value.timestamp_projection.write_policy === 'copy_exact_committed_value'
      && value.timestamp_projection.clock_write === 'forbidden'
    )),
    true
  );
  const guardedFailure = canonical.activity_check_consequence_profiles.consequence_profiles.find(
    (value) => value.consequence_id === 'trace_ld_v1_consequence_eremey_remains_guarded'
  );
  assert.deepEqual(guardedFailure.write_target_classes, ['activity_history']);
  const activityWriteTargets = Object.fromEntries(
    canonical.activity_check_consequence_profiles.activity_profiles
      .filter((value) => [
        'trace_ld_v1_activity_first_eremey_talk',
        'trace_ld_v1_activity_eremey_with_evidence'
      ].includes(value.profile_id))
      .map((value) => [value.profile_id, value.write_target_classes])
  );
  assert.deepEqual(
    activityWriteTargets.trace_ld_v1_activity_first_eremey_talk,
    ['perception_report']
  );
  assert.deepEqual(
    activityWriteTargets.trace_ld_v1_activity_eremey_with_evidence,
    ['npc_decision_admission', 'activity_history']
  );
});

test('blue-wool pickup is an exact owner-preserving inventory transition', () => {
  const items = canonical.item_container_set;
  const wool = items.item_templates.find(
    (value) => value.item_template_id === 'trace_ld_v1_item_blue_wool_fragment'
  );
  const profile = items.item_inventory_profiles.find(
    (value) => value.inventory_profile_id === wool.inventory_profile_ref
  );
  const pickup = items.transition_templates.find(
    (value) => value.transition_template_id === 'trace_ld_v1_transition_blue_wool_pickup'
  );
  assert.equal(items.revision, 2);
  assert.equal(wool.property_state_template.holder_ref, null);
  assert.equal(wool.property_state_template.controller_ref, null);
  assert.equal(wool.placement_slot_ref, 'trace_ld_v1_slot_wreck_willow_branch');
  assert.deepEqual(profile, {
    inventory_profile_id: 'trace_ld_v1_inventory_profile_blue_wool_fragment',
    item_template_ref: 'trace_ld_v1_item_blue_wool_fragment',
    mass_grams: 10,
    carry_form: 'compact',
    external_hand_cost: 0
  });
  assert.equal(pickup.trigger.required_successful_consequence_ref, 'trace_ld_v1_consequence_inspection_success');
  assert.equal(pickup.trigger.required_committed_evidence_ref, 'trace_ld_v1_evidence_blue_wool');
  assert.equal(pickup.destination_state.holder_ref, 'player_clerk');
  assert.equal(pickup.destination_state.controller_ref, 'player_clerk');
  assert.equal(pickup.destination_state.physical_position, 'hands');
  assert.equal(pickup.owner_preservation, 'ratsha_storehouse_helper');
  assert.equal(pickup.owner_change, 'forbidden');
  assert.equal(pickup.clock_write, 'forbidden');
  assert.equal(pickup.atomic_with_parent_activity_commit, true);
  assert.equal(pickup.failure_pickup, 'forbidden');
  assert.equal(pickup.repeat_application, 'forbidden');
});

mutation(
  'a blue-wool source holder',
  (value) => {
    value.item_container_set.transition_templates
      .find((entry) => entry.transition_template_id === 'trace_ld_v1_transition_blue_wool_pickup')
      .source_item_state.holder_ref = 'player_clerk';
  },
  'TRACE_BLUE_WOOL_PICKUP_CONTRACT_INVALID'
);
mutation(
  'a blue-wool source controller',
  (value) => {
    value.item_container_set.transition_templates
      .find((entry) => entry.transition_template_id === 'trace_ld_v1_transition_blue_wool_pickup')
      .source_item_state.controller_ref = 'unknown_controller';
  },
  'TRACE_BLUE_WOOL_PICKUP_CONTRACT_INVALID'
);
mutation(
  'a blue-wool source placement outside the willow branch',
  (value) => {
    value.item_container_set.transition_templates
      .find((entry) => entry.transition_template_id === 'trace_ld_v1_transition_blue_wool_pickup')
      .source_placement_ref = 'unknown_slot';
  },
  'TRACE_BLUE_WOOL_PICKUP_CONTRACT_INVALID'
);
mutation(
  'a blue-wool destination with an unknown controller',
  (value) => {
    value.item_container_set.transition_templates
      .find((entry) => entry.transition_template_id === 'trace_ld_v1_transition_blue_wool_pickup')
      .destination_state.controller_ref = 'unknown_controller';
  },
  'TRACE_BLUE_WOOL_PICKUP_CONTRACT_INVALID'
);
mutation(
  'a blue-wool inventory profile without mass',
  (value) => {
    delete value.item_container_set.item_inventory_profiles[0].mass_grams;
  },
  'TRACE_BLUE_WOOL_PICKUP_CONTRACT_INVALID'
);
mutation(
  'an unknown blue-wool inventory profile',
  (value) => {
    value.item_container_set.transition_templates
      .find((entry) => entry.transition_template_id === 'trace_ld_v1_transition_blue_wool_pickup')
      .inventory_profile_ref = 'unknown_profile';
  },
  'TRACE_BLUE_WOOL_PICKUP_CONTRACT_INVALID'
);
mutation(
  'a pickup without successful committed inspection',
  (value) => {
    value.item_container_set.transition_templates
      .find((entry) => entry.transition_template_id === 'trace_ld_v1_transition_blue_wool_pickup')
      .trigger.required_successful_consequence_ref = 'inspection_failure';
  },
  'TRACE_BLUE_WOOL_PICKUP_CONTRACT_INVALID'
);
mutation(
  'a pickup that writes a separate clock change',
  (value) => {
    value.item_container_set.transition_templates
      .find((entry) => entry.transition_template_id === 'trace_ld_v1_transition_blue_wool_pickup')
      .clock_write = 'allowed';
  },
  'TRACE_BLUE_WOOL_PICKUP_CONTRACT_INVALID'
);
mutation(
  'a replayable second pickup',
  (value) => {
    value.item_container_set.transition_templates
      .find((entry) => entry.transition_template_id === 'trace_ld_v1_transition_blue_wool_pickup')
      .repeat_application = 'allowed';
  },
  'TRACE_BLUE_WOOL_PICKUP_CONTRACT_INVALID'
);

mutation(
  'a missing camp anchor',
  (value) => { delete value.materialization_bindings.camp_spatial_binding.anchor_template; },
  'TRACE_PHASE_3_CAMP_BINDING_INVALID'
);
mutation(
  'a placement on an unknown anchor',
  (value) => {
    value.materialization_bindings.initial_participant_placements[0].anchor_template_ref =
      'unknown_anchor';
  },
  'TRACE_PHASE_3_PARTICIPANT_PLACEMENT_INVALID'
);
mutation(
  'a duplicated NPC identity slot',
  (value) => {
    value.materialization_bindings.initial_participant_placements[1].instance_key =
      value.materialization_bindings.initial_participant_placements[0].instance_key;
  },
  'TRACE_PHASE_3_PARTICIPANT_PLACEMENT_INVALID'
);
mutation(
  'a missing speaker-memory mapping',
  (value) => {
    delete value.knowledge_lie_memory_rules.interaction_persistence_mappings[0]
      .speaker_memory_projection;
  },
  'TRACE_PHASE_3_INTERACTION_MAPPING_INVALID'
);
mutation(
  'a missing player-journal mapping',
  (value) => {
    delete value.knowledge_lie_memory_rules.interaction_persistence_mappings[0]
      .player_journal_projection;
  },
  'TRACE_PHASE_3_INTERACTION_MAPPING_INVALID'
);
mutation(
  'an implicit interaction timestamp source',
  (value) => {
    delete value.knowledge_lie_memory_rules.interaction_persistence_mappings[0]
      .timestamp_projection;
  },
  'TRACE_PHASE_3_INTERACTION_MAPPING_INVALID'
);
mutation(
  'route disclosure from Eremey evasion',
  (value) => {
    value.knowledge_lie_memory_rules.interaction_persistence_mappings[0]
      .route_knowledge_disclosure = {
        route_ref: 'trace_ld_v1_route_camp_to_shed',
        movement: 'forbidden'
      };
  },
  'TRACE_PHASE_3_EVASION_DISCLOSURE_FORBIDDEN'
);
mutation(
  'an unknown disclosed route',
  (value) => {
    value.knowledge_lie_memory_rules.interaction_persistence_mappings[1]
      .route_knowledge_disclosure.route_ref = 'unknown_route';
  },
  'TRACE_PHASE_3_DISCLOSURE_ROUTE_INVALID'
);
mutation(
  'an unapproved relationship delta',
  (value) => {
    value.npc_decision_schedule_policies.decision_execution_bindings
      .find((record) => record.option_id === 'evade_and_withhold')
      .write_targets.push('relationship_delta_proposal');
  },
  'TRACE_PHASE_3_RELATIONSHIP_RULE_MISSING'
);
mutation(
  'an unapproved relationship delta in Eremey guarded failure consequence',
  (value) => {
    value.activity_check_consequence_profiles.consequence_profiles
      .find((record) => (
        record.consequence_id === 'trace_ld_v1_consequence_eremey_remains_guarded'
      ))
      .write_target_classes.push('relationship_delta_proposal');
  },
  'TRACE_PHASE_3_EREMEY_RELATIONSHIP_RULE_MISSING'
);
mutation(
  'an unapproved relationship delta in an Eremey activity profile',
  (value) => {
    value.activity_check_consequence_profiles.activity_profiles
      .find((record) => record.profile_id === 'trace_ld_v1_activity_first_eremey_talk')
      .write_target_classes.push('relationship_delta_proposal');
  },
  'TRACE_PHASE_3_EREMEY_RELATIONSHIP_RULE_MISSING'
);
mutation(
  'the superseded Phase 3 package digest',
  (value) => {
    value.manifest.superseded_package_ref.digest = '0'.repeat(64);
  },
  'TRACE_PHASE_3_SUPERSEDES_MISMATCH'
);
mutation(
  'a reused item-container digest',
  (value) => {
    value.manifest.reused_content_refs.item_container_set.digest = '0'.repeat(64);
  },
  'TRACE_PHASE_3_REUSED_CONTENT_MISMATCH'
);
