import { computeVisibleContextPackageDigest } from '@rus/contracts';
import {
  buildStage20VisibleContextInput,
  buildVisibleContextCodePrecheck,
  buildStage20ReferenceIndex,
  buildStage20VisibilityFilter
} from '@rus/new-game/stages/stage-20/compat';
import {
  buildStage21VisibleContextAuditInput,
  STAGE21_REQUIRED_CHECKS
} from '@rus/new-game/stages/stage-21/compat';

export function makeStage20Input(mutator = null) {
  const weather = { version: 1, schema: 'weather_state', label: 'морозное утро', precipitation: 'none' };
  const clock = { current_year: 1230, current_day_index: 4, current_minute_of_day: 420, light_profile: 'grey_dawn' };
  const values = {
    request_id: 'req-stage20-21',
    historical_frame: {
      version: 1,
      schema: 'historical_frame',
      region: { region_id: 'region-novgorod' },
      year: { value: 1230 },
      calendar: { season: 'winter' },
      clock
    },
    weather_state: weather,
    selected_start_node: { version: 1, schema: 'selected_start_node', node_id: 'node-yard' },
    player_character: { version: 1, schema: 'player_character_game_profile', character_id: 'pc-1' },
    current_position: {
      region_id: 'region-novgorod',
      place_id: 'place-yard',
      location_id: 'location-gate',
      minilocation_id: 'mini-gate',
      anchor_id: 'anchor-gate',
      last_route_id: null
    },
    g5_scene_graph: {
      version: 1,
      schema: 'g5_scene_graph_draft',
      parent_location: { region_id: 'region-novgorod', place_id: 'place-yard', location_id: 'location-gate' },
      player_start_position: {
        region_id: 'region-novgorod', place_id: 'place-yard', location_id: 'location-gate',
        minilocation_id: 'mini-gate', anchor_id: 'anchor-gate'
      },
      g5_minilocations: [{ g5_minilocation_id: 'mini-gate' }],
      g5_anchors: [{ g5_anchor_id: 'anchor-gate', parent_minilocation_id: 'mini-gate' }],
      g5_edges: []
    },
    g5_scene_audit: { version: 1, schema: 'g5_scene_audit', pass: true },
    initial_npc_placement: { version: 1, schema: 'initial_npc_placement_draft', npc_instances: [] },
    npc_placement_audit: { version: 1, schema: 'initial_npc_placement_audit', pass: true },
    initial_item_placement: { version: 1, schema: 'initial_item_placement_draft', item_instances: [], container_instances: [] },
    item_placement_audit: { version: 1, schema: 'initial_item_placement_audit', pass: true },
    time_light_consistency_audit: {
      version: 1,
      schema: 'time_light_consistency_audit',
      pass: true,
      authoritative_frame: { weather_state: weather },
      normalized_visibility_constraints: {
        light_profile: 'grey_dawn',
        visible_without_action: ['anchor-gate'],
        audible_but_not_visible: [],
        visible_only_on_inspection: [],
        hidden_until_action: []
      },
      commit_permission: { can_continue_to_visible_context: true }
    },
    character_knowledge_map: {
      version: 1,
      schema: 'character_knowledge_map',
      known_routes: [], known_nearby_paths: [], known_places: [], known_addresses: [], known_landmarks: [],
      known_people: [], known_authorities: [], known_dangers: [], known_social_rules: [], known_resources: [],
      rumors: [], mistaken_beliefs: [], uncertain_knowledge: [], forbidden_knowledge: [], knowledge_gaps: []
    },
    character_knowledge_map_audit: {
      version: 1,
      schema: 'character_knowledge_map_audit',
      pass: true,
      commit_permission: { can_continue_to_hidden_state: true }
    },
    full_hidden_scene_state: {
      version: 1,
      schema: 'full_hidden_scene_state',
      hidden_npc_state: [], hidden_access_state: [], hidden_property_state: [], hidden_container_state: [],
      hidden_item_state: [], hidden_risk_state: [], hidden_event_state: [], hidden_social_state: [],
      hidden_route_state: [], hidden_environment_state: [], reveal_conditions: [], discovery_rules: []
    },
    full_hidden_state_audit: { version: 1, schema: 'full_hidden_state_audit', pass: true },
    visible_context_policy: {}
  };
  if (mutator) mutator(values);
  return buildStage20VisibleContextInput(values);
}

export function makeVisibleContextPackage(input = makeStage20Input(), overrides = {}) {
  return {
    version: 1,
    schema: 'visible_context_package',
    request_id: input.request_id,
    visible_context_status: 'formed',
    frame: {
      region_id: input.historical_frame.region.region_id,
      year: input.historical_frame.year.value,
      season: input.historical_frame.calendar.season,
      clock: structuredClone(input.historical_frame.clock),
      weather_state: structuredClone(input.weather_state),
      light_profile: input.time_light_consistency_audit.normalized_visibility_constraints.light_profile
    },
    position: structuredClone(input.current_position),
    narrator_scope: {
      allowed_surfaces: ['visible_scene_facts', 'visible_anchors', 'available_actions_context'],
      forbidden_surfaces: ['full_hidden_scene_state'],
      style_constraints: ['second_person'],
      knowledge_boundary: { use_only_character_safe_information: true }
    },
    visible_scene_dossier: { must_include: [], must_not_include: [] },
    visible_scene_facts: [{ visible_fact_id: 'fact-frost', label: 'На воротах лежит иней.', source_refs: ['anchor-gate'] }],
    visible_anchors: [{ anchor_id: 'anchor-gate', label: 'ворота двора' }],
    visible_exits: [],
    visible_npcs: [],
    visible_items: [],
    visible_containers: [],
    visible_risks: [],
    audible_context: [],
    smell_context: [],
    touch_body_context: [],
    weather_light_context: [],
    known_context: [],
    rumor_context: [],
    uncertain_context: [],
    available_actions_context: [{
      action_id: 'action-look-gate',
      action_kind: 'inspect',
      target_ref: { anchor_id: 'anchor-gate' },
      must_not_reveal_hidden_truth: true
    }],
    hidden_filtered_out: [],
    source_trace: [{ source_ref: 'anchor-gate' }],
    audit_self_check: { pass: true, concerns: [], evidence: ['Пакет собран только из видимого якоря.'] },
    ...overrides
  };
}

export function makeStage20Precheck(input = makeStage20Input(), pkg = makeVisibleContextPackage(input)) {
  const refs = buildStage20ReferenceIndex(input);
  const filter = buildStage20VisibilityFilter(input, refs);
  return buildVisibleContextCodePrecheck(pkg, input, refs, filter);
}

export function makeStage21Input(stage20Result) {
  return buildStage21VisibleContextAuditInput({
    request_id: stage20Result.request_id,
    historical_frame: stage20Result.input_snapshot.historical_frame,
    weather_state: stage20Result.input_snapshot.weather_state,
    current_position: stage20Result.input_snapshot.current_position,
    g5_scene_graph: stage20Result.input_snapshot.g5_scene_graph,
    g5_scene_audit: stage20Result.input_snapshot.g5_scene_audit,
    initial_npc_placement: stage20Result.input_snapshot.initial_npc_placement,
    npc_placement_audit: stage20Result.input_snapshot.npc_placement_audit,
    initial_item_placement: stage20Result.input_snapshot.initial_item_placement,
    item_placement_audit: stage20Result.input_snapshot.item_placement_audit,
    time_light_consistency_audit: stage20Result.input_snapshot.time_light_consistency_audit,
    character_knowledge_map: stage20Result.input_snapshot.character_knowledge_map,
    character_knowledge_map_audit: stage20Result.input_snapshot.character_knowledge_map_audit,
    full_hidden_scene_state: stage20Result.input_snapshot.full_hidden_scene_state,
    full_hidden_state_audit: stage20Result.input_snapshot.full_hidden_state_audit,
    visible_context_package: stage20Result.visible_context_package,
    visible_context_package_digest: stage20Result.visible_context_package_digest,
    visible_context_code_precheck: stage20Result.visible_context_code_precheck,
    visible_context_audit_policy: {}
  });
}

export function makePassingVisibleContextAudit(input) {
  return {
    version: 1,
    schema: 'visible_context_audit',
    request_id: input.request_id,
    visible_context_package_digest: input.visible_context_package_digest,
    pass: true,
    checks: Object.fromEntries(STAGE21_REQUIRED_CHECKS.map((key) => [key, { pass: true }])),
    concerns: [],
    evidence: ['Пакет совпадает с утверждённым видимым состоянием.'],
    repair_route: null,
    commit_permission: {
      can_send_to_narrator: true,
      can_write_visible_context_snapshot: true,
      can_generate_player_facing_prose: true
    }
  };
}

export function clone(value) { return structuredClone(value); }
export { computeVisibleContextPackageDigest };

export function makeFailingVisibleContextAudit(input, code = 'VISIBLE_CONTEXT_PRIVATE_MOTIVE_LEAK') {
  const checks = Object.fromEntries(STAGE21_REQUIRED_CHECKS.map((key) => [key, { pass: true }]));
  checks.hidden_state_leak_check = { pass: false };
  return {
    version: 1,
    schema: 'visible_context_audit',
    request_id: input.request_id,
    visible_context_package_digest: input.visible_context_package_digest,
    pass: false,
    checks,
    concerns: [{ code, severity: 'repairable', message: 'Обнаружена утечка скрытого состояния.' }],
    evidence: ['В пакете присутствует недоступный персонажу смысл.'],
    repair_route: {
      return_to_stage: 'stage20_visible_context',
      repair_kind: 'remove_hidden_leak'
    },
    commit_permission: {
      can_send_to_narrator: false,
      can_write_visible_context_snapshot: false,
      can_generate_player_facing_prose: false
    }
  };
}

export function makeVisibleContextRepairRoute(input, audit, overrides = {}) {
  return {
    version: 1,
    schema: 'visible_context_audit_repair_route',
    request_id: input.request_id,
    visible_context_package_digest: input.visible_context_package_digest,
    return_to_stage: 'stage20_visible_context',
    repair_kind: 'remove_hidden_leak',
    concern_codes: [audit.concerns[0].code],
    evidence_refs: [0],
    allowed_mutable_paths: ['visible_scene_facts'],
    forbidden_mutable_paths: ['frame', 'position'],
    requires_reaudit_from_stage: 21,
    ...overrides
  };
}
