export function clone(value) { return structuredClone(value); }

export function makeStage18Input() {
  const weather = { version: 1, schema: 'weather_state', condition: 'clear', precipitation: 'none' };
  return {
    version: 1,
    schema: 'character_knowledge_map_input',
    request_id: 'req-1',
    historical_frame: {
      version: 1,
      schema: 'historical_frame',
      region: { region_id: 'region-1' },
      year: { value: 1230 },
      calendar: { season: 'winter' },
      clock: { day: 1, hour: 22, minute: 0, time_of_day: 'night', light_profile: 'firelit' }
    },
    weather_state: weather,
    selected_start_node: {
      version: 1,
      schema: 'selected_start_node',
      region_id: 'region-1',
      place_id: 'place-1',
      location_id: 'g4-1',
      g1_node_id: 'g1-1',
      g2_node_id: 'g2-1',
      g3_node_id: 'g3-1',
      g4_node_id: 'g4-1'
    },
    start_place_audit: { version: 1, schema: 'start_place_audit', pass: true },
    player_character: {
      version: 1,
      schema: 'player_character_game_profile',
      player_character_id: 'pc-1',
      social_role_id: 'role-1',
      occupation_id: 'occupation-1',
      source_trace: [{ source_id: 'pc-source-1' }]
    },
    player_character_audit: { version: 1, schema: 'player_character_audit', pass: true },
    current_position: {
      region_id: 'region-1',
      place_id: 'place-1',
      location_id: 'g4-1',
      g1_node_id: 'g1-1',
      g2_node_id: 'g2-1',
      g3_node_id: 'g3-1',
      g4_node_id: 'g4-1',
      minilocation_id: 'mini-1',
      anchor_id: 'anchor-1',
      last_route_id: null
    },
    g5_scene_graph: {
      version: 1,
      schema: 'g5_scene_graph_draft',
      parent_location: {
        region_id: 'region-1',
        place_id: 'place-1',
        location_id: 'g4-1',
        g1_node_id: 'g1-1',
        g2_node_id: 'g2-1',
        g3_node_id: 'g3-1',
        g4_node_id: 'g4-1'
      },
      player_start_position: {
        region_id: 'region-1',
        place_id: 'place-1',
        location_id: 'g4-1',
        minilocation_id: 'mini-1',
        anchor_id: 'anchor-1'
      },
      g5_minilocations: [{ minilocation_id: 'mini-1' }, { minilocation_id: 'mini-2' }],
      g5_anchors: [
        { anchor_id: 'anchor-1', parent_minilocation_id: 'mini-1' },
        { anchor_id: 'anchor-2', parent_minilocation_id: 'mini-2' }
      ],
      g5_edges: [{ g5_edge_id: 'g5-edge-1', from_anchor_id: 'anchor-1', to_anchor_id: 'anchor-2' }]
    },
    g5_scene_audit: { version: 1, schema: 'g5_scene_audit', pass: true },
    initial_npc_placement: {
      version: 1,
      schema: 'initial_npc_placement_draft',
      npc_instances: [{
        npc_instance_id: 'npc-1',
        anchor_id: 'anchor-1',
        identity: { name_status: 'unknown' },
        visibility_state: { visible_to_player_now: true, audible_to_player_now: true }
      }]
    },
    npc_placement_audit: { version: 1, schema: 'initial_npc_placement_audit', pass: true },
    initial_item_placement: {
      version: 1,
      schema: 'initial_item_placement_draft',
      item_instances: [{
        item_instance_id: 'item-1',
        anchor_id: 'anchor-1',
        visibility_state: { visible_to_player_now: true }
      }],
      container_instances: [{
        container_instance_id: 'container-1',
        anchor_id: 'anchor-1',
        visibility_state: { visible_to_player_now: true },
        physical_state: { condition: 'closed' },
        access_state: { access: 'closed' }
      }]
    },
    item_placement_audit: { version: 1, schema: 'initial_item_placement_audit', pass: true },
    time_light_consistency_audit: {
      version: 1,
      schema: 'time_light_consistency_audit',
      pass: true,
      authoritative_frame: { weather_state: weather },
      normalized_visibility_constraints: {
        visible_without_action: ['anchor-1'],
        audible_but_not_visible: ['anchor-2'],
        visible_only_on_inspection: [],
        hidden_until_action: []
      },
      commit_permission: {
        can_continue_to_visible_context: true,
        can_continue_to_narrator: false
      }
    },
    regional_context_package: {
      version: 1,
      schema: 'regional_context_package',
      common_knowledge: { source_id: 'common-1' },
      route_knowledge_rules: { source_id: 'route-rule-1' },
      social_context: {}, occupation_context: {}, historical_context: {}, danger_context: {}, rumor_context: {}, authority_context: {}, landmark_context: {}
    },
    world_base_route_snapshot: {
      version: 1,
      schema: 'world_base_route_snapshot',
      nearby_graph_edges: [{ graph_edge_id: 'graph-edge-1', from_node_id: 'g4-1', to_node_id: 'g4-2', source_id: 'edge-source-1' }],
      known_route_candidates: [], historical_anchor_candidates: [], route_knowledge_rule_candidates: []
    },
    knowledge_policy: {
      require_knowledge_basis: true,
      require_source_trace: true,
      separate_player_and_character_knowledge: true,
      separate_known_and_visible: true,
      separate_fact_and_rumor: true,
      separate_exact_and_approximate_routes: true,
      allow_mistaken_beliefs: true,
      allow_uncertain_knowledge: true,
      do_not_grant_full_map: true,
      do_not_grant_hidden_state: true,
      do_not_create_new_routes: true,
      do_not_create_new_places: true,
      do_not_create_new_npcs: true,
      do_not_write_visible_scene: true,
      do_not_write_intro_prose: true
    }
  };
}

export function makeKnowledgeMap() {
  return {
    version: 1,
    schema: 'character_knowledge_map',
    request_id: 'req-1',
    knowledge_status: 'formed',
    character_ref: {
      player_character_id: 'pc-1',
      social_role_id: 'role-1',
      occupation_id: 'occupation-1',
      origin_basis: ['origin']
    },
    current_position_ref: {
      region_id: 'region-1',
      g1_node_id: 'g1-1',
      g2_node_id: 'g2-1',
      g3_node_id: 'g3-1',
      g4_node_id: 'g4-1',
      minilocation_id: 'mini-1',
      anchor_id: 'anchor-1'
    },
    knowledge_scope_summary: {
      map_detail_level: 'local_g5',
      route_knowledge_level: 'immediate_exits',
      social_knowledge_level: 'ordinary_customs',
      danger_knowledge_level: 'visible_dangers',
      confidence_profile: 'medium'
    },
    known_routes: [{
      known_route_id: 'known-route-1',
      g5_edge_id: 'g5-edge-1',
      basis: ['visible_now'],
      source_trace: [{ source_id: 'common-1' }]
    }],
    known_nearby_paths: [], known_places: [], known_addresses: [], known_landmarks: [],
    known_people: [], known_authorities: [], known_dangers: [],
    known_social_rules: [{
      known_social_rule_id: 'known-rule-1',
      statement: 'A local custom is known.',
      basis: ['common_knowledge'],
      source_trace: [{ source_id: 'common-1' }]
    }],
    known_resources: [],
    rumors: [], mistaken_beliefs: [], uncertain_knowledge: [],
    forbidden_knowledge: [{ forbidden_knowledge_id: 'forbidden-1', category: 'hidden_state' }],
    knowledge_gaps: [{ knowledge_gap_id: 'gap-1', category: 'unknown_people' }],
    player_vs_character_knowledge_boundary: {
      player_only_information: [],
      character_known_information: ['known-rule-1'],
      forbidden_transfer: ['forbidden-1'],
      ui_guidance: { show_unknown_as_unknown: true, keep_player_only_information_out: true }
    },
    downstream_constraints: {
      must_preserve: ['known-rule-1'],
      must_not_reveal: ['forbidden-1'],
      must_resolve_later: []
    },
    source_trace: [{ source_id: 'common-1' }],
    audit_self_check: { pass: true, concerns: [], evidence: ['all knowledge records have basis'] }
  };
}

export function makeKnowledgeAudit(pass = true) {
  return {
    version: 1,
    schema: 'character_knowledge_map_audit',
    request_id: 'req-1',
    pass,
    concerns: pass ? [] : [{ code: 'KNOWLEDGE_MAP_UNBASED_KNOWLEDGE', severity: 'hard_block', message: 'Unbased.' }],
    evidence: ['independent audit evidence']
  };
}

export function makeStage20Input() {
  const base = makeStage18Input();
  const knowledge = makeKnowledgeMap();
  return {
    version: 1,
    schema: 'visible_context_builder_input',
    request_id: base.request_id,
    historical_frame: base.historical_frame,
    weather_state: base.weather_state,
    selected_start_node: base.selected_start_node,
    player_character: base.player_character,
    current_position: base.current_position,
    g5_scene_graph: base.g5_scene_graph,
    g5_scene_audit: base.g5_scene_audit,
    initial_npc_placement: base.initial_npc_placement,
    npc_placement_audit: base.npc_placement_audit,
    initial_item_placement: base.initial_item_placement,
    item_placement_audit: base.item_placement_audit,
    time_light_consistency_audit: base.time_light_consistency_audit,
    character_knowledge_map: knowledge,
    character_knowledge_map_audit: {
      ...makeKnowledgeAudit(true),
      commit_permission: { can_commit_character_knowledge: true, can_continue_to_hidden_state: true }
    },
    full_hidden_scene_state: {
      version: 1,
      schema: 'full_hidden_scene_state',
      request_id: 'req-1',
      hidden_npc_state: [{
        hidden_npc_state_id: 'hidden-npc-1',
        npc_instance_id: 'npc-1',
        private_motive: 'Secret motive',
        visible_hint_now: { hint_id: 'hint-1', text: 'The person looks tense.' }
      }],
      hidden_access_state: [], hidden_property_state: [],
      hidden_container_state: [{
        hidden_container_state_id: 'hidden-container-1',
        container_instance_id: 'container-1',
        content_known_to_character: false,
        content_instance_ids: ['item-hidden-1']
      }],
      hidden_item_state: [], hidden_risk_state: [], hidden_event_state: [], hidden_social_state: [], hidden_route_state: [], hidden_environment_state: [],
      reveal_conditions: [], discovery_rules: [], forbidden_output_rules: []
    },
    full_hidden_state_audit: {
      version: 1,
      schema: 'full_hidden_state_audit',
      pass: true,
      concerns: [], evidence: ['hidden audit passed']
    },
    visible_context_policy: {
      require_current_position_match: true,
      require_time_light_consistency: true,
      require_character_knowledge_boundary: true,
      require_hidden_state_filter: true,
      require_reveal_conditions: true,
      require_source_trace: true,
      allow_visible_hints_from_hidden_state: true,
      allow_reasonable_character_inference: true,
      reject_hidden_truth_leak: true,
      reject_private_motives: true,
      reject_closed_container_contents: true,
      reject_future_events: true,
      reject_unknown_exact_routes: true,
      reject_unseen_items: true,
      reject_raw_json_output_to_narrator: true,
      do_not_create_new_world_facts: true,
      do_not_change_clock: true,
      do_not_change_scene_state: true
    }
  };
}

export function makeVisibleContextPackage() {
  return {
    version: 1,
    schema: 'visible_context_package',
    request_id: 'req-1',
    visible_context_status: 'formed',
    frame: {
      region_id: 'region-1',
      year: 1230,
      season: 'winter',
      clock: { day: 1, hour: 22, minute: 0, time_of_day: 'night', light_profile: 'firelit' },
      weather_state: { version: 1, schema: 'weather_state', condition: 'clear', precipitation: 'none' },
      light_profile: 'firelit'
    },
    position: { region_id: 'region-1', place_id: 'place-1', location_id: 'g4-1', minilocation_id: 'mini-1', anchor_id: 'anchor-1' },
    narrator_scope: {
      allowed_surfaces: ['visible_scene'],
      forbidden_surfaces: ['hidden_state'],
      style_constraints: ['no omniscience'],
      knowledge_boundary: { use_only_visible_package: true }
    },
    visible_scene_facts: [{ visible_fact_id: 'vf-1', statement: 'A person and a closed chest are visible.', source_refs: ['anchor-1', 'npc-1', 'container-1'] }],
    visible_anchors: [{ anchor_id: 'anchor-1' }],
    visible_exits: [{ g5_edge_id: 'g5-edge-1', from_anchor_id: 'anchor-1', to_anchor_id: 'anchor-2' }],
    visible_npcs: [{ npc_instance_id: 'npc-1', identity_status: 'unidentified' }],
    visible_items: [{ item_instance_id: 'item-1' }],
    visible_containers: [{ container_instance_id: 'container-1', is_closed: true, contents_visible: false, content_summary: null }],
    visible_risks: [], audible_context: [], smell_context: [], touch_body_context: [],
    weather_light_context: [{ context_id: 'wl-1', statement: 'The scene is firelit at night.' }],
    known_context: [{ context_id: 'known-1', statement: 'A local custom is known.', basis_refs: ['known-rule-1'] }],
    rumor_context: [],
    uncertain_context: [{ context_id: 'uncertain-1', statement: 'The person may be uneasy.', uncertainty_marker: true, confidence: 'low', inference_basis_refs: ['npc-1'] }],
    available_actions_context: [{ action_id: 'act-1', label: 'Speak to the person', target_ref: { npc_instance_id: 'npc-1' }, must_not_reveal_hidden_truth: true }],
    hidden_filtered_out: [
      { hidden_fact_id: 'hidden-npc-1', filter_reason: 'private_motive' },
      { hidden_fact_id: 'hidden-container-1', filter_reason: 'closed_container' }
    ],
    visible_scene_dossier: {
      summary: 'Night scene at the current anchor with one visible person and a closed chest.',
      must_include: ['current anchor', 'night lighting'],
      may_include: ['visible person', 'closed chest'],
      must_not_include: ['private motives', 'closed contents']
    },
    source_trace: [{ source_id: 'anchor-1' }, { source_id: 'known-rule-1' }],
    audit_self_check: { pass: true, concerns: [], evidence: ['visible references checked'] }
  };
}
