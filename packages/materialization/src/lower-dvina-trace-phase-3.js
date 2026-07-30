import { deterministicInstanceId } from './core.js';
import { failLowerDvinaTraceMaterialization as fail } from './lower-dvina-trace-contract.js';

export function materializeLowerDvinaTracePreparedCamp({
  input,
  bundle,
  runId,
  participantSelections,
  locationSelections
}) {
  const binding = bundle.materialization_bindings.camp_spatial_binding;
  const camp = locationSelections.find(
    (value) => value.slot_key === binding.location_profile_ref
  );
  if (!camp) {
    fail('TRACE_PHASE_3_CAMP_LOCATION_MISSING', 'The approved camp location selection is missing.');
  }
  const nodeId = deterministicInstanceId(
    input.party_id,
    runId,
    'g5_node',
    binding.location_profile_ref,
    0
  );
  const anchorId = deterministicInstanceId(
    input.party_id,
    runId,
    'g5_anchor',
    binding.anchor_template.template_id,
    0
  );
  const scene = {
    location_profile_ref: binding.location_profile_ref,
    node: {
      instance_id: nodeId,
      parent_g4_id: camp.selected.g4_node_ref.id,
      template_id: binding.node_template_ref,
      slot_key: binding.node_slot_ref,
      state: {
        location_profile_ref: camp.location.location_profile_id,
        prepared_for_first_entry: true
      }
    },
    anchor: {
      instance_id: anchorId,
      node_id: nodeId,
      template_id: binding.anchor_template.template_id,
      slot_key: binding.anchor_template.slot_key,
      npc_capacity: binding.anchor_template.npc_capacity,
      item_capacity: binding.anchor_template.item_capacity,
      container_capacity: binding.anchor_template.container_capacity,
      state: structuredClone(binding.anchor_template.state)
    }
  };
  const npcs = bundle.materialization_bindings.initial_participant_placements
    .map((placement, ordinal) => materializeNpc({
      input,
      bundle,
      runId,
      participantSelections,
      placement,
      ordinal,
      anchorId
    }));
  if (new Set(npcs.map((value) => value.instance_id)).size !== npcs.length
    || npcs.length > scene.anchor.npc_capacity) {
    fail(
      'TRACE_PHASE_3_NPC_IDENTITY_INVALID',
      'Prepared camp NPC identities or capacity are invalid.'
    );
  }
  return { scene, npcs };
}

function materializeNpc({
  input,
  bundle,
  runId,
  participantSelections,
  placement,
  ordinal,
  anchorId
}) {
  const selection = participantSelections.find(
    (value) => value.slot_key === placement.participant_slot_ref
  );
  if (!selection || selection.materialization_rule !== placement.materialization_depth) {
    fail(
      'TRACE_PHASE_3_PARTICIPANT_SELECTION_MISSING',
      `The sealed participant ${placement.participant_slot_ref} is missing or incompatible.`
    );
  }
  const profile = requiredById(
    bundle.participant_profile_set.profiles,
    'profile_id',
    selection.selected_profile.profile_id
  );
  if (profile.revision !== selection.selected_profile.revision
    || profile.knowledge_scope_ref == null
    || !Object.hasOwn(profile, 'canonical_name')
    || typeof profile.social_role_id !== 'string'
    || typeof profile.occupation_id !== 'string'
    || typeof profile.scenario_function !== 'string'
    || typeof profile.causal_basis !== 'string') {
    fail(
      'TRACE_PHASE_3_PARTICIPANT_PROFILE_INVALID',
      `The participant profile for ${placement.participant_slot_ref} is not exact.`
    );
  }
  const knowledgeScope = requiredById(
    bundle.participant_profile_set.knowledge_scope_profiles,
    'profile_id',
    profile.knowledge_scope_ref
  );
  return {
    instance_id: deterministicInstanceId(
      input.party_id,
      runId,
      'npc',
      placement.instance_key,
      ordinal
    ),
    participant_slot_ref: placement.participant_slot_ref,
    profile_id: profile.profile_id,
    profile_revision: profile.revision,
    profile_level: placement.materialization_depth,
    anchor_id: anchorId,
    location_profile_ref: placement.location_profile_ref,
    zone_ref: placement.zone_ref,
    role_ref: {
      id: profile.social_role_id,
      source: 'approved_scenario_profile'
    },
    occupation_ref: {
      id: profile.occupation_id,
      source: 'approved_scenario_profile'
    },
    identity_state: {
      canonical_name: profile.canonical_name,
      ...(Object.hasOwn(profile, 'name_policy')
        ? { name_policy: profile.name_policy }
        : {})
    },
    machine_state: {
      status: 'active',
      materialization_depth: placement.materialization_depth
    },
    semantic_state: {
      scenario_function: profile.scenario_function,
      causal_basis: profile.causal_basis
    },
    knowledge_profile_snapshot: structuredClone(knowledgeScope),
    profile_candidate_set_digest: selection.candidate_set_digest,
    profile_record_digest: selection.record_digest
  };
}

function requiredById(values, key, id) {
  const matches = values.filter((value) => value?.[key] === id);
  if (matches.length !== 1) {
    fail('TRACE_SCENARIO_REFERENCE_INVALID', `Expected exactly one ${key}=${id}.`);
  }
  return matches[0];
}
