import { LOWER_DVINA_TRACE_ACCEPTANCE_SEED_CONTEXT, materializeLowerDvinaTracePartyInstance } from '@rus/materialization/internal/lower-dvina-trace-phase-1a';
import { MATERIALIZER_VERSION, RNG_VERSION } from '@rus/materialization';
import { materializeInitialActorEquipment } from '@rus/new-game';
import { resolveLowerDvinaTraceStartTimestamp } from '../src/internal/lower-dvina-trace-phase-1a.js';
import { lowerDvinaTracePhase1ADomainPin } from '../../../test/fixtures/lower-dvina-trace-phase-1a-domain-pin.mjs';
import { lowerDvinaTraceCanonicalG5SceneBindings } from
  '../../../test/fixtures/lower-dvina-trace-v5-world-fixture.js';

export function phase1AInstance(partyId, scenarioBundle,
  worldBaseReferenceSnapshot = undefined) {
  return materializeInitialActorEquipment(
    materializeLowerDvinaTracePartyInstance({
      party_id: partyId,
      scenario_id: 'lower_dvina_trace_v1',
      scenario_definition_revision: scenarioBundle.definition_revision,
      scenario_manifest_digest: scenarioBundle.manifest_digest,
      world_revision_id: scenarioBundle.location_topology_set.spatial_source_ref.world_revision_id,
      world_catalog_digest: scenarioBundle.location_topology_set.spatial_source_ref.world_revision_catalog_digest,
      domain_catalog_pin: lowerDvinaTracePhase1ADomainPin(scenarioBundle),
      materializer_version: MATERIALIZER_VERSION,
      rng_algorithm_id: RNG_VERSION,
      seed_context: LOWER_DVINA_TRACE_ACCEPTANCE_SEED_CONTEXT,
      idempotency_key: `phase1a:${partyId}`,
      trigger: 'new_game',
      occurrence: 0,
      existing_party_state: { baseline_exists: false },
      scenario_bundle: scenarioBundle,
      world_base_reference_snapshot: worldBaseReferenceSnapshot,
      resolve_timestamp: resolveLowerDvinaTraceStartTimestamp,
    }),
  );
}

export function currentWorldBaseReferenceSnapshot() {
  const g6 = (scene_slot_key, physical_class_id, primary_scene_role_id,
    overhead_cover_id) => ({ scene_slot_key, physical_class_id,
    primary_scene_role_id, vertical_context_id: 'surface', overhead_cover_id,
    intra_g6_visibility_mode: 'default_clear',
    default_visibility_distance_band: 'near', acoustic_uniformity: 'uniform' });
  const edge = (edge_slot_key, from_position_slot_key, to_position_slot_key,
    reverse_edge_slot_key) => ({ edge_slot_key, from_position_slot_key,
    to_position_slot_key, reverse_edge_slot_key, passage_type_id: 'passage.local',
    transition_environment_profile_id: 'env.local_variable',
    transition_environment_profile_version: 3,
    movement_orientation_profile_id: 'orientation.topological_local',
    movement_orientation_profile_version: 2, cost_kind: 'action', action_units: 1,
    baseline_movement_method_id: null, movement_method_cost_profile_id: null,
    movement_method_cost_profile_version: null, base_minutes: null,
    dynamic_recheck_policy_id: null, dynamic_recheck_policy_version: null,
    capacity: 1, portal_template_id: null, portal_template_version: null,
    availability_condition_set_id: null, availability_condition_set_version: null });
  const link = (link_slot_key, from_position_slot_key, to_position_slot_key,
    reverse_link_slot_key) => ({ link_slot_key, from_position_slot_key,
    to_position_slot_key, reverse_link_slot_key, quality: 'clear',
    distance_band: 'near', portal_template_id: null, portal_template_version: null,
    condition_profile_id: null, condition_profile_version: null });
  const camp = {
    header: { id: 'trace_ld_v1_tpl_fishing_camp', version: 1 },
    g6_slots: [g6('working_camp', 'spatial.g6.open', 'working_camp', 'none'),
      g6('s1_open_one_space', 'spatial.g6.semi_enclosed', 'ordinary_local', 'partial')],
    position_slots: [{ position_slot_key: 'working_camp',
      g6_scene_slot_key: 'working_camp',
      position_type_id: 'scene_position.fixed_working_reach', capacity: 7,
      access_class_id: 'trace_ld_v1_access_fishing_camp' },
    { position_slot_key: 's1_open_one_space.interior',
      g6_scene_slot_key: 's1_open_one_space',
      position_type_id: 'scene_position.central', capacity: 1,
      access_class_id: 'default' }],
    movement_edges: [edge('s1_open_one_space.out', 'working_camp',
      's1_open_one_space.interior', 's1_open_one_space.back'),
    edge('s1_open_one_space.back', 's1_open_one_space.interior',
      'working_camp', 's1_open_one_space.out')],
    visibility_links: [link('s1_open_one_space.visible_out', 'working_camp',
      's1_open_one_space.interior', 's1_open_one_space.visible_back'),
    link('s1_open_one_space.visible_back', 's1_open_one_space.interior',
      'working_camp', 's1_open_one_space.visible_out')]
  };
  const shore = structuredClone(camp);
  shore.header = { id: 'trace_ld_v1_tpl_wreck_shore', version: 1 };
  shore.g6_slots = [g6('open_shore', 'spatial.g6.open', 'open_shore', 'none')];
  shore.position_slots = [{ position_slot_key: 'open_shore',
    g6_scene_slot_key: 'open_shore',
    position_type_id: 'scene_position.water_reach', capacity: 7,
    access_class_id: 'trace_ld_v1_access_wreck_shore' }];
  shore.movement_edges = [];
  shore.visibility_links = [];
  return { version: 1, schema: 'world_base_reference_snapshot',
    readonly_checksum: 'turn-step-current-production', allowed_region_ids: [],
    allowed_graph_node_ids: [], allowed_graph_edge_ids: [],
    allowed_place_template_ids: [], allowed_npc_candidate_ids: [],
    allowed_item_profile_ids: [], allowed_container_profile_ids: [],
    allowed_property_rule_ids: [], allowed_source_ids: [],
    scene_template_closures: [shore, camp],
    canonical_g5_scene_bindings: lowerDvinaTraceCanonicalG5SceneBindings };
}

export async function unexpectedPlayerConversationModel() {
  throw new Error('Unexpected player conversation model call');
}
export async function unexpectedNpcSemanticModel() {
  throw new Error('Unexpected NPC semantic model call');
}
export async function unexpectedNpcAutonomousModel() {
  throw new Error('Unexpected autonomous NPC model call');
}
export async function unexpectedNpcCombatModel() {
  throw new Error('Unexpected NPC combat model call');
}

export function replaceState(target, source) {
  for (const key of Object.keys(target)) delete target[key];
  Object.assign(target, structuredClone(source));
}

export function approvedNarration(requestId) {
  return {
    version: 1,
    schema: 'narration_flow_result',
    request_id: requestId,
    surface: 'turn',
    status: 'approved',
    pass: true,
    approved_output: {
      version: 1,
      schema: 'narration_output',
      output_id: `narration:${requestId}`,
      prose: 'Ты внимательно осматриваешь повреждённую лодку и следы на берегу.',
      action_options: [],
      used_references: [],
      self_check: { no_new_world_facts: true },
    },
    final_audit: {
      version: 1,
      schema: 'narration_audit',
      pass: true,
      concerns: [],
      evidence: ['Текст основан только на persisted visible context.'],
    },
    repair_request: null,
    generation_history: [],
    audit_history: [],
    repair_history: [],
    diagnostics: {},
  };
}
