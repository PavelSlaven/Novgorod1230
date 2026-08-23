import { canonicalDigest } from '@rus/materialization';
import { serverError } from '../errors.js';

export const TRACE_PHASE_3_IDS = Object.freeze({
  moveOption: 'follow_path_to_fishing_camp',
  moveActivity: 'trace_ld_v1_activity_route_to_camp',
  moveRoute: 'trace_ld_v1_route_wreck_to_camp',
  campLocation: 'trace_ld_v1_loc_fishing_camp',
  talkOption: 'ask_eremey_about_wreck',
  talkActivity: 'trace_ld_v1_activity_first_eremey_talk',
  evidenceOption: 'show_clue_and_seek_eremey_cooperation',
  evidenceActivity: 'trace_ld_v1_activity_eremey_with_evidence',
  evidenceCheck: 'trace_ld_v1_check_eremey_cooperation',
  evidence: 'trace_ld_v1_evidence_blue_wool',
  eremeyRef: 'eremey_fisher',
  fisherRefs: ['background_fisher_1', 'background_fisher_2']
});

export function resolveTracePhase3Contracts({ state, bundle }) {
  const ids = TRACE_PHASE_3_IDS;
  if (![9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24]
    .includes(bundle.definition_revision)) {
    gap('TRACE_PHASE_3_REVISION_MISMATCH');
  }
  const activities = bundle.activity_check_consequence_profiles.activity_profiles;
  const movement = exact(activities, 'profile_id', ids.moveActivity);
  const talk = exact(activities, 'profile_id', ids.talkActivity);
  const evidenceTalk = exact(activities, 'profile_id', ids.evidenceActivity);
  const check = exact(
    bundle.activity_check_consequence_profiles.check_profiles,
    'check_id',
    ids.evidenceCheck
  );
  const route = exact(
    bundle.movement_bindings.route_bindings,
    'route_id',
    ids.moveRoute
  );
  const routeBodyEffect = routeEffect(bundle.body_environment_profiles?.effect_profiles,
    'trace_ld_v1_body_open_route_8m', ids.moveActivity, route.duration_minutes);
  const sourceEndpoint = exact(
    bundle.location_topology_set.endpoints,
    'endpoint_id',
    route.source_endpoint
  );
  const destinationEndpoint = exact(
    bundle.location_topology_set.endpoints,
    'endpoint_id',
    route.destination_endpoint
  );
  const access = exact(
    bundle.location_access_policies.access_policies,
    'policy_id',
    talk.preconditions.access_policy_ref
  );
  const capacity = exact(
    bundle.location_capacity_contracts.capacity_contracts,
    'contract_id',
    bundle.location_capacity_contracts.capacity_contracts.find(
      (entry) => entry.location_ref === ids.campLocation
    )?.contract_id
  );
  const npcPolicy = exact(
    bundle.npc_decision_schedule_policies.decision_policies,
    'policy_id',
    'trace_ld_v1_npc_eremey_decisions'
  );
  const executions =
    bundle.npc_decision_schedule_policies.decision_execution_bindings.filter(
      (entry) => entry.policy_id === npcPolicy.policy_id
    );
  const statementEffects =
    bundle.npc_decision_schedule_policies.statement_effect_contracts;
  const eremeyKnowledge = exact(
    bundle.knowledge_lie_memory_rules.participant_knowledge_bindings,
    'participant_ref',
    ids.eremeyRef
  );
  const mappings = bundle.knowledge_lie_memory_rules
    .interaction_persistence_mappings;
  const firstMapping = exact(
    mappings,
    'mapping_id',
    'trace_ld_v1_mapping_eremey_first_answer_v1'
  );
  const disclosureMapping = exact(
    mappings,
    'mapping_id',
    'trace_ld_v1_mapping_eremey_disclosure_v1'
  );
  const memoryTemplates =
    bundle.knowledge_lie_memory_rules.memory_records;
  const journalTemplates =
    bundle.knowledge_lie_memory_rules.player_facing_text_records;
  const projectionText = Object.fromEntries(
    [firstMapping, disclosureMapping].map((mapping) => {
      const memory = exact(
        memoryTemplates,
        'memory_template_id',
        mapping.speaker_memory_projection.template_ref
      );
      const journal = exact(
        journalTemplates,
        'journal_template_id',
        mapping.player_journal_projection.template_ref
      );
      if (memory.source_statement_ref !== mapping.statement_template_ref
          || journal.source_statement_ref !== mapping.statement_template_ref
          || memory.truth_projection !== 'forbidden'
          || journal.objective_truth_projection !== 'forbidden') {
        gap('TRACE_PHASE_3_PROJECTION_TEMPLATE_MISMATCH');
      }
      return [mapping.mapping_id, {
        memory_text: memory.summary_text,
        journal_text: journal.summary_text
      }];
    })
  );
  const blueWoolPickup = exact(
    bundle.item_container_set.transition_templates,
    'transition_template_id',
    'trace_ld_v1_transition_blue_wool_pickup'
  );
  const conversationBindings = [14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24]
    .includes(bundle.definition_revision)
    ? bundle.conversation_semantic_bindings
    : null;
  const conversationSignalMappings = conversationBindings == null
    ? null
    : {
        question: exact(
          conversationBindings.signal_mappings,
          'source_command_id',
          'lower_dvina_trace.ask_eremey_about_wreck'
        ),
        evidence: exact(
          conversationBindings.signal_mappings,
          'source_command_id',
          'lower_dvina_trace.show_clue_and_seek_eremey_cooperation'
        )
      };
  for (const activity of [movement, talk, evidenceTalk]) {
    const selected = selection(state, 'activities', activity.profile_id);
    if (!selected || selected.record_digest !== canonicalDigest(activity)) {
      gap('TRACE_PHASE_3_SEALED_SELECTION_MISMATCH');
    }
  }
  if (movement.duration_minutes !== 8 || route.duration_minutes !== 8
      || route.navigation_check_policy !== 'no_check_on_visible_local_path'
      || route.terminal_position_outcome !== ids.campLocation
      || talk.duration_minutes !== 5 || talk.no_check_required !== true
      || evidenceTalk.duration_minutes !== 10
      || evidenceTalk.check_ref !== ids.evidenceCheck
      || firstMapping.decision_option_ref !== 'evade_and_withhold'
      || disclosureMapping.decision_option_ref !== 'bounded_disclosure'
      || !npcPolicy.knowledge_and_perception_refs.includes(
        eremeyKnowledge.knowledge_scope_ref
      )
      || (conversationBindings != null && (
        conversationBindings.legacy_bounded_production_path !== 'forbidden'
        || conversationSignalMappings.question.target_npc_ref !== ids.eremeyRef
        || conversationSignalMappings.evidence.target_npc_ref !== ids.eremeyRef
        || conversationSignalMappings.question.mechanics_refs.activity_id
          !== ids.talkActivity
        || conversationSignalMappings.evidence.mechanics_refs.activity_id
          !== ids.evidenceActivity
        || conversationSignalMappings.evidence.mechanics_refs.check_id
          !== ids.evidenceCheck
      ))) {
    gap('TRACE_PHASE_3_APPROVED_CHAIN_INVALID');
  }
  const prepared = state.prepared_scenes?.find(
    (scene) => scene.location_profile_ref === ids.campLocation
  ) ?? (state.first_entry_preparation?.scene?.location_profile_ref
      === ids.campLocation
    ? state.first_entry_preparation.scene : null);
  const campAnchor = prepared?.anchor?.instance_id;
  if (!campAnchor) gap('TRACE_PHASE_3_CAMP_ANCHOR_MISSING');
  const actors = [ids.eremeyRef, ...ids.fisherRefs].map((ref) => {
    const npc = [...(state.npcs ?? []),
      ...(state.first_entry_preparation?.npcs ?? [])].find((entry) =>
      entry.participant_slot_ref === ref);
    if (!npc?.instance_id) gap('TRACE_PHASE_3_PARTICIPANT_MISSING');
    return { ref, ...structuredClone(npc) };
  });
  const workingZone = exact(capacity.zones, 'zone_id', 'working_camp');
  if (sourceEndpoint.location_profile_id
        !== movement.preconditions.location_ref
      || destinationEndpoint.location_profile_id !== ids.campLocation
      || route.terminal_position_outcome !== ids.campLocation
      || access.location_ref !== ids.campLocation
      || prepared.anchor.state.access_policy_ref !== access.policy_id
      || prepared.anchor.state.capacity_contract_ref !== capacity.contract_id
      || prepared.anchor.state.zone_ref !== 'working_camp'
      || workingZone.max_actors < actors.length + 1
      || capacity.admission_model.entry_group_bounds.min > 1
      || capacity.admission_model.entry_group_bounds.max < 1
      || !capacity.admission_model.allowed_participant_slots.includes(
        'player_clerk'
      )
      || actors.some((actor) =>
        !capacity.admission_model.allowed_participant_slots.includes(
          actor.ref
        ))) {
    gap('TRACE_PHASE_3_MOVEMENT_ADMISSION_INVALID');
  }
  return Object.freeze({
    ids, movement, talk, evidenceTalk, check, route, routeBodyEffect,
    sourceEndpoint, destinationEndpoint, access, capacity,
    npcPolicy, executions, statementEffects, eremeyKnowledge,
    firstMapping, disclosureMapping, blueWoolPickup,
    conversationBindings, conversationSignalMappings,
    conversationTimeProfiles: structuredClone(
      bundle.turn_step_owner_profiles?.semantic_duration_profiles ?? []
    ),
    projectionText,
    campAnchor,
    actors,
    activityPins: [movement, talk, evidenceTalk].map((activity) => {
      const record = selection(state, 'activities', activity.profile_id);
      return {
        id: activity.profile_id,
        version: activity.version,
        digest: record.record_digest
      };
    })
  });
}
function routeEffect(records, effectId, activityRef, elapsedMinutes) {
  const effect = (records ?? []).find((entry) => entry.effect_profile_id === effectId);
  // Range-only historical profiles cannot be guessed or retroactively charged.
  if (!effect?.exact_deltas || !Array.isArray(effect.condition_outcomes)) return null;
  if (effect.activity_ref !== activityRef || effect.elapsed_minutes !== elapsedMinutes
      || effect.selection_policy !== 'fixed_approved_effect' || effect.rng_consumption !== 'forbidden') gap('TRACE_PHASE_3_ROUTE_BODY_EFFECT_INVALID');
  return structuredClone(effect);
}

function selection(state, kind, id) {
  return state.sealed_selections?.find(
    (group) => group.selection_kind === kind
  )?.records.find((record) => record.selected_id === id) ?? null;
}
function exact(records, key, id) {
  const found = (records ?? []).filter((record) => record[key] === id);
  if (found.length !== 1) gap('TRACE_PHASE_3_RECORD_GAP');
  return found[0];
}
function gap(code) {
  throw serverError(code, 'The exact party-pinned Phase 3 chain is incomplete.', {
    status: 409
  });
}
