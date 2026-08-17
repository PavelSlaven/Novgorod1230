import { deepFreeze } from '@rus/kernel';
import { MaterializationError } from './core.js';
import { materializeItemPlacement } from './placement-materializers.js';

/** Stage 16 adapter for authored initial actor equipment candidates. */
export function materializeApprovedActorEquipment({
  party_id: partyId,
  world_revision_id: worldRevisionId,
  request_id: requestId,
  run_id: runId,
  g4_id: g4Id,
  actor_candidate_instance_map: actorCandidateInstanceMap,
  initial_equipment_candidates: initialEquipmentCandidates,
  item_templates: itemTemplates,
  item_inventory_profiles: itemInventoryProfiles,
  item_visual_profiles: itemVisualProfiles,
  action_production_mechanics_profiles: actionProductionMechanicsProfiles = [],
  catalog_digest: catalogDigest
}) {
  const actorByCandidate = actorCandidateMap(actorCandidateInstanceMap);
  const players = [...actorByCandidate.values()].filter(
    ({ actor_kind: kind }) => kind === 'player_character'
  );
  if (players.length !== 1) {
    throw new MaterializationError(
      'INITIAL_ACTOR_EQUIPMENT_PLAYER_INVALID',
      'Initial actor equipment requires exactly one materialized player.'
    );
  }
  const itemProfileCandidates = [];
  const quantityRequirements = [];
  const equipmentCandidates = [];
  for (const candidate of [...(initialEquipmentCandidates ?? [])]
    .sort((left, right) => String(left.equipment_candidate_id)
      .localeCompare(String(right.equipment_candidate_id)))) {
    const template = exactApprovedRecord(
      itemTemplates, 'item_template_id', candidate.item_template_ref
    );
    const profile = exactApprovedRecord(
      itemInventoryProfiles, 'inventory_profile_id',
      candidate.inventory_profile_ref
    );
    const visualProfile = exactApprovedRecord(
      itemVisualProfiles, 'visual_profile_id', candidate.visual_profile_ref
    );
    const visualProfileSnapshot = visualSnapshot(
      visualProfile, template, candidate
    );
    const target = actorByCandidate.get(candidate.target_actor_slot_ref);
    const targetsPlayer = target?.actor_kind === 'player_character';
    if (!target || candidate.status !== 'approved'
      || candidate.owner_ref !== candidate.target_actor_slot_ref
      || candidate.holder_ref !== candidate.target_actor_slot_ref
      || candidate.controller_ref !== candidate.target_actor_slot_ref
      || candidate.physical_position !== 'equipped'
      || !['base_garment', 'outer_garment', 'headwear']
        .includes(candidate.equipment_slot_category_id)
      || candidate.visual_profile_snapshot != null
      || profile.item_template_ref !== template.item_template_id) {
      throw new MaterializationError(
        'INITIAL_ACTOR_EQUIPMENT_CANDIDATE_INVALID',
        `Initial equipment ${candidate.equipment_candidate_id} is incomplete.`
      );
    }
    const itemProfileCandidateId =
      `${candidate.equipment_candidate_id}:item_profile`;
    const quantityRequirementId =
      `${candidate.equipment_candidate_id}:quantity`;
    itemProfileCandidates.push(itemProfileCandidate({
      candidate,
      profile,
      template,
      visualProfile,
      visualProfileSnapshot,
      worldRevisionId,
      itemProfileCandidateId,
      quantityRequirementId
    }));
    quantityRequirements.push(quantityRequirement({
      profile,
      template,
      visualProfileSnapshot,
      worldRevisionId,
      quantityRequirementId
    }));
    equipmentCandidates.push(equipmentCandidate({
      candidate,
      template,
      worldRevisionId,
      itemProfileCandidateId,
      target
    }));
  }
  const draft = materializeItemPlacement({
    request_id: requestId,
    selected_start_node: { selected_node_chain: { g4_node_id: g4Id } },
    player_character: { character_id: players[0].actor_instance_id },
    g5_scene_graph: {
      item_materialization_slots: [],
      materialization_run: {
        run_id: runId,
        seed_context: {
          party_id: partyId,
          g4_id: g4Id,
          world_revision_id: worldRevisionId
        }
      }
    },
    initial_npc_placement: {
      npc_candidate_instance_map: [...actorByCandidate.values()]
        .filter(({ actor_kind: kind }) => kind === 'npc')
        .sort((left, right) => left.actor_candidate_id
          .localeCompare(right.actor_candidate_id))
        .map((binding) => ({
          npc_candidate_id: binding.actor_candidate_id,
          npc_instance_id: binding.actor_instance_id
        }))
    },
    item_profile_candidate_set: {
      world_revision_id: worldRevisionId,
      catalog_digest: catalogDigest,
      item_profile_candidates: itemProfileCandidates,
      container_profile_candidates: [], property_rule_candidates: [],
      quantity_requirements: quantityRequirements,
      equipment_candidates: equipmentCandidates,
      empty_allowed: false
    },
    eligible_item_profile_candidates: itemProfileCandidates,
    eligible_container_profile_candidates: [],
    eligible_property_rule_candidates: [],
    eligible_g5_item_anchors: [], eligible_g5_container_anchors: []
  });
  return deepFreeze({
    item_instances: draft.item_instances.map((item) =>
      projectActorEquipmentInstance(item, actionProductionMechanicsProfiles)),
    materialization_run: structuredClone(draft.materialization_run)
  });
}

function itemProfileCandidate({ candidate, profile, template, visualProfile,
  visualProfileSnapshot,
  worldRevisionId, itemProfileCandidateId, quantityRequirementId }) {
  return {
    item_profile_candidate_id: itemProfileCandidateId,
    item_profile_id: profile.inventory_profile_id,
    item_template_id: template.item_template_id,
    item_category_id: template.semantic_category,
    status: 'approved', world_revision_id: worldRevisionId,
    required: false, quantity: 1,
    quantity_requirement_id: quantityRequirementId,
    quantity_unit_id: 'piece',
    condition_state: candidate.condition_state,
    legal_status: candidate.legal_status,
    physical_state: {
      condition: candidate.condition_state,
      mass_grams_per_unit: profile.mass_grams,
      external_hand_cost: profile.external_hand_cost,
      weight: profile.mass_grams / 1000
    },
    property_state: {
      owner_model: 'pending_actor_binding',
      holder_model: 'pending_actor_binding',
      controller_model: 'pending_actor_binding',
      legal_or_social_status: candidate.claim_state
    },
    visibility_state: {
      visibility: 'visible', visible_to_player_now: true
    },
    access_state: { access: 'actor_controlled' },
    risk_state: {},
    inventory_profile_snapshot: structuredClone(profile),
    visual_profile_snapshot: structuredClone(visualProfileSnapshot),
    source_trace: [{
      source_id: candidate.equipment_candidate_id,
      source_kind: 'approved_initial_equipment_candidate',
      world_revision_id: worldRevisionId
    }, {
      source_id: visualProfile.visual_profile_id,
      source_kind: 'approved_item_visual_profile',
      world_revision_id: worldRevisionId
    }]
  };
}

function quantityRequirement({
  profile, template, worldRevisionId, quantityRequirementId
}) {
  return {
    quantity_requirement_id: quantityRequirementId,
    status: 'approved', world_revision_id: worldRevisionId,
    item_template_id: template.item_template_id,
    minimum_quantity: 1, maximum_quantity: 1,
    quantity_unit_id: 'piece', quantity_dimension: 'count',
    mass_grams_per_unit: profile.mass_grams,
    default_quantity_policy: { mode: 'explicit_only' }
  };
}

function equipmentCandidate({ candidate, template, visualProfileSnapshot,
  worldRevisionId, itemProfileCandidateId, target }) {
  const targetsPlayer = target.actor_kind === 'player_character';
  return {
    equipment_candidate_id: candidate.equipment_candidate_id,
    item_profile_candidate_id: itemProfileCandidateId,
    item_template_id: template.item_template_id,
    equipment_slot_category_id: candidate.equipment_slot_category_id,
    instance_key: candidate.instance_key,
    status: 'approved', required: true,
    world_revision_id: worldRevisionId,
    ...(targetsPlayer
      ? { target_player_character: true, target_npc_candidate_ids: [] }
      : {
        target_npc_candidate_ids: [candidate.target_actor_slot_ref],
        target_actor_slot_key: candidate.target_actor_slot_ref
      }),
    visual_profile_snapshot: structuredClone(visualProfileSnapshot)
  };
}

function visualSnapshot(profile, template, candidate) {
  const snapshot = profile?.visual_profile_snapshot;
  const required = [
    'garment_kind', 'equipment_slot', 'neckline', 'sleeve_form',
    'outer_form', 'visible_fabric', 'trim', 'main_visible_color',
    'secondary_visible_color', 'headwear_kind'
  ];
  if (profile.item_template_ref !== template.item_template_id
      || !snapshot || snapshot.schema !== 'item_visual_profile_snapshot_v1'
      || snapshot.version !== 1
      || snapshot.equipment_slot !== candidate.equipment_slot_category_id
      || required.some((key) => typeof snapshot[key] !== 'string'
        || snapshot[key].trim() === '')) {
    throw new MaterializationError(
      'INITIAL_ACTOR_EQUIPMENT_VISUAL_PROFILE_INVALID',
      `Initial equipment visual profile ${profile?.visual_profile_id} is invalid.`
    );
  }
  return snapshot;
}

function actorCandidateMap(values) {
  const map = new Map();
  for (const binding of values ?? []) {
    if (!binding?.actor_candidate_id || !binding.actor_instance_id
        || !['npc', 'player_character'].includes(binding.actor_kind)
        || map.has(binding.actor_candidate_id)) {
      throw new MaterializationError(
        'INITIAL_ACTOR_EQUIPMENT_ACTOR_MAP_INVALID',
        'Actor candidate-to-instance mappings must be exact and unique.'
      );
    }
    map.set(binding.actor_candidate_id, structuredClone(binding));
  }
  return map;
}

function projectActorEquipmentInstance(item, actionProductionProfiles) {
  const property = item.property_state ?? {};
  const placement = item.placement ?? {};
  return {
    instance_id: item.item_instance_id,
    template_id: item.item_template_id,
    profile_id: item.item_profile_id,
    category_id: item.item_category_id,
    quantity: item.quantity,
    condition_state: item.condition_state,
    legal_status: item.legal_status,
    claim_state: property.legal_or_social_status,
    owner_npc_id: property.owner_model === 'npc' ? property.owner_id : null,
    owner_character_id:
      property.owner_model === 'player' ? property.owner_id : null,
    holder_npc_id: placement.holder_npc_instance_id ?? null,
    holder_character_id: placement.holder_player_character_id ?? null,
    controller_npc_id:
      property.controller_model === 'npc' ? property.controller_id : null,
    controller_character_id:
      property.controller_model === 'player' ? property.controller_id : null,
    physical_position: placement.physical_position,
    equipment_slot_category_id: placement.equipment_slot_category_id,
    state: {
      ...structuredClone(item.state ?? {}),
      source_equipment_candidate_ref: item.equipment_candidate_id,
      ...actionProductionMechanicsState(item, actionProductionProfiles)
    }
  };
}

function actionProductionMechanicsState(item, profiles) {
  const matches = profiles.filter(({ template_id: id }) =>
    id === item.item_template_id);
  if (matches.length === 0) return {};
  const profile = matches.length === 1 ? matches[0] : null;
  if (profile == null
      || profile.inventory_profile_id !== item.item_profile_id
      || profile.profile_version !== '1'
      || typeof profile.profile_ref !== 'string'
      || profile.profile_ref.length === 0
      || profile.mechanics == null
      || typeof profile.mechanics !== 'object'
      || Array.isArray(profile.mechanics)) {
    throw new MaterializationError(
      'INITIAL_ACTOR_EQUIPMENT_ACTION_PRODUCTION_MECHANICS_INVALID',
      'Initial A1 mechanics must resolve from one exact authored profile.'
    );
  }
  return { action_production_mechanics_snapshot: {
    schema: 'rus.items.action_production_committed_mechanics_snapshot.v1',
    profile_ref: profile.profile_ref,
    profile_version: profile.profile_version,
    template_id: profile.template_id,
    inventory_profile_id: profile.inventory_profile_id,
    mechanics: structuredClone(profile.mechanics)
  } };
}

function exactApprovedRecord(values, key, id) {
  const matches = (values ?? []).filter((value) => value?.[key] === id
    && (value.status == null || value.status === 'approved'));
  if (matches.length !== 1) {
    throw new MaterializationError(
      'APPROVED_EQUIPMENT_RECORD_INVALID',
      `Required equipment record ${id} must resolve exactly once.`
    );
  }
  return matches[0];
}
