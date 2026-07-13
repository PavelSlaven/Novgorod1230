import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildStage16AnchorIndexes,
  buildStage16ContainerCandidateIndexes,
  buildStage16ItemCandidateIndexes,
  buildStage16ItemPlacementCodePrecheck,
  buildStage16ItemPlacementInput,
  buildStage16PropertyRuleIndexes,
  buildStage17TimeLightConsistencyInput,
  filterStage16EligibleAnchors,
  filterStage16EligibleContainers,
  filterStage16EligibleItems,
  filterStage16EligiblePropertyRules,
  runStage16ItemPlacement,
  runStage16ItemPlacementBlock,
  STAGE16_AUDIT_SCHEMA,
  STAGE16_DRAFT_SCHEMA,
  STAGE16_INPUT_SCHEMA,
  STAGE16_PRECHECK_SCHEMA,
  validateStage16ItemPlacementAudit,
  validateStage16ItemPlacementDraft,
  validateStage16ItemPlacementInput
} from '../stages/stage16-item-placement.js';

function inputFixture(overrides = {}) {
  return {
    version: 1,
    schema: STAGE16_INPUT_SCHEMA,
    request_id: 'req_16',
    historical_frame: {
      version: 1,
      schema: 'historical_frame',
      region: { region_id: 'region_1' },
      year: { value: 1230 },
      calendar: { season: 'winter' },
      clock: { day: 1, hour: 7, minute: 0, time_of_day: 'morning', light_profile: 'dim' }
    },
    selected_start_node: {
      version: 1,
      schema: 'selected_start_node',
      selected: { selected_place_template_id: 'place_1' },
      selected_node_chain: { g4_node_id: 'g4' }
    },
    start_place_audit: { version: 1, schema: 'start_place_audit', pass: true },
    player_character: {
      version: 1,
      schema: 'player_character_game_profile',
      character_id: 'pc_1',
      inventory: { items: [{ item_instance_id: 'existing_pc_item', item_profile_id: 'existing_profile' }] }
    },
    player_character_audit: { version: 1, schema: 'player_character_audit', pass: true },
    g5_scene_graph: {
      version: 1,
      schema: 'g5_scene_graph_draft',
      materialization_status: 'materialized',
      parent_location: { g4_node_id: 'g4' },
      g5_minilocations: [{ minilocation_id: 'm1', parent_g4_node_id: 'g4' }],
      g5_anchors: [{
        anchor_id: 'a1',
        parent_minilocation_id: 'm1',
        parent_g4_node_id: 'g4',
        anchor_function: 'work_surface',
        supports: { can_hold_item: true, can_hold_container: true, item_capacity: 4, container_capacity: 2 },
        visibility: { visibility_default: 'visible' },
        access: { access_state: 'open' }
      }]
    },
    g5_scene_audit: {
      version: 1,
      schema: 'g5_scene_audit',
      pass: true,
      commit_permission: { can_continue_to_item_placement: true }
    },
    initial_npc_placement: {
      version: 1,
      schema: 'initial_npc_placement_draft',
      placement_status: 'placed',
      npc_instances: [{ npc_instance_id: 'npc_1' }]
    },
    npc_placement_audit: {
      version: 1,
      schema: 'initial_npc_placement_audit',
      pass: true,
      commit_permission: { can_continue_to_item_placement: true }
    },
    item_profile_candidate_set: {
      version: 1,
      schema: 'item_profile_candidate_set',
      selection_status: 'ready',
      item_profile_candidates: [{
        item_profile_candidate_id: 'item_c1',
        item_profile_id: 'item_profile_1',
        item_group: 'tool',
        item_kind: 'knife',
        rarity: 'common',
        value_band: 'low',
        place_template_ids: ['place_1'],
        allowed_seasons: ['winter'],
        allowed_time_of_day: ['morning'],
        property_rule_candidate_ids: ['prop_c1']
      }],
      container_profile_candidates: [{
        container_profile_candidate_id: 'container_c1',
        container_profile_id: 'container_profile_1',
        place_template_ids: ['place_1'],
        property_rule_candidate_ids: ['prop_c1']
      }],
      property_rule_candidates: [{
        property_rule_candidate_id: 'prop_c1',
        item_profile_candidate_ids: ['item_c1'],
        container_profile_candidate_ids: ['container_c1']
      }]
    },
    item_placement_policy: {
      target_visible_items_min: 0,
      target_visible_items_max: 12,
      target_interactable_items_min: 0,
      target_interactable_items_max: 6,
      target_containers_max: 6,
      allow_empty_item_scene_if_place_supports_it: true,
      require_item_profile_candidate: true,
      require_anchor_supports_item_or_container: true,
      require_property_rule_for_interactable_item: true,
      require_owner_or_holder_model: true,
      require_visibility_model: true,
      require_access_model: true,
      require_weight_size_condition: true,
      require_causal_basis: true,
      require_source_trace: true,
      do_not_create_items_from_player_desire: true,
      do_not_reveal_hidden_items: true,
      do_not_fill_closed_containers_without_causal_basis: true,
      do_not_duplicate_player_inventory: true,
      do_not_create_new_npcs: true,
      do_not_change_g5_scene: true,
      do_not_create_hidden_event: true,
      do_not_write_intro_prose: true,
      do_not_write_visible_scene: true
    },
    ...overrides
  };
}

function draftFixture(overrides = {}) {
  return {
    version: 1,
    schema: STAGE16_DRAFT_SCHEMA,
    request_id: 'req_16',
    placement_status: 'placed',
    frame: { region_id: 'region_1', year: 1230, season: 'winter', clock: {} },
    parent_scene: { g4_node_id: 'g4', selected_place_template_id: 'place_1', g5_scene_id: null },
    item_instances: [{
      item_instance_id: 'item_1',
      item_profile_candidate_id: 'item_c1',
      item_profile_id: 'item_profile_1',
      identity: { title: 'work knife', item_kind: 'knife', item_group: 'tool', count: 1, is_stack: false },
      placement: {
        placement_type: 'on_anchor',
        g5_anchor_id: 'a1',
        container_instance_id: null,
        holder_npc_instance_id: null,
        holder_player_character_id: null,
        parent_g4_node_id: 'g4',
        placement_basis: 'work surface',
        causal_basis_type: 'anchor_function'
      },
      physical_state: { size_band: 'hand', weight: 0.25, condition: 'ordinary', can_be_moved: true, requires_hands: 1, movement_hindrance: 'none' },
      visibility_state: { visibility: 'visible', visible_to_player_now: true, known_to_player_now: true, requires_inspection: false, requires_light: false, visibility_basis: 'open visible anchor' },
      access_state: { access: 'reachable', can_touch_now: true, can_take_now: false, can_use_now: false, access_basis: 'belongs to workplace' },
      property_state: { property_rule_candidate_id: 'prop_c1', owner_model: 'workplace', owner_npc_instance_id: null, holder_model: 'anchor', holder_id: 'a1', controller_model: 'none', controller_id: null, ownership_known_to_player: true, legal_or_social_status: 'owned' },
      risk_state: { theft_risk: 'low', witness_risk: 'low', legal_risk: 'low', reputation_risk: 'low', damage_risk: 'low', noise_risk: 'none', risk_basis: ['workplace property'] },
      game_function: { can_be_used_for: ['cutting'], can_be_searched: false, can_be_taken: true, can_be_bought: false, can_be_broken: true, can_be_moved: true, can_be_hidden: true, can_be_evidence: false, function_limits: [] },
      source_trace: [{ record_id: 'item_c1', source_ids: ['src_item_1'] }]
    }],
    container_instances: [{
      container_instance_id: 'container_1',
      container_profile_candidate_id: 'container_c1',
      container_profile_id: 'container_profile_1',
      identity: { title: 'wooden chest', container_kind: 'chest', container_group: 'storage' },
      placement: { g5_anchor_id: 'a1', parent_g4_node_id: 'g4', placement_basis: 'storage function', causal_basis_type: 'storage_function' },
      physical_state: { capacity_band: 'medium', mobility: 'heavy', condition: 'closed', weight_empty: 15, weight_current_known: false, can_be_moved: false },
      content_state: { content_known: false, content_materialized: false, content_visibility: 'not_visible', visible_content_summary: null, content_must_not_be_regenerated_after_first_definition: true, content_must_not_be_generated_until_opened_or_inspected: true },
      visibility_state: { visible_to_player_now: true, known_to_player_now: true, requires_inspection: false, requires_light: false, visibility_basis: 'visible anchor' },
      access_state: { access: 'closed', can_open_now: false, requires_key: false, requires_tool: false, requires_force: false, requires_permission: true, requires_time_minutes: 1, access_basis: 'workplace control' },
      property_state: { property_rule_candidate_id: 'prop_c1', owner_model: 'workplace', controller_model: 'none', controller_npc_instance_id: null, ownership_known_to_player: true },
      risk_state: { opening_risk: 'low', theft_risk: 'low', witness_risk: 'low', damage_risk: 'low', risk_basis: ['workplace property'] },
      source_trace: [{ record_id: 'container_c1', source_ids: ['src_container_1'] }]
    }],
    item_anchor_bindings: [{ item_anchor_binding_id: 'ib1', item_instance_id: 'item_1', g5_anchor_id: 'a1', binding_type: 'lying_on' }],
    container_anchor_bindings: [{ container_anchor_binding_id: 'cb1', container_instance_id: 'container_1', g5_anchor_id: 'a1', binding_type: 'stored_at' }],
    property_bindings: [{
      property_binding_id: 'pb1',
      property_rule_candidate_id: 'prop_c1',
      applies_to: { item_instance_id: 'item_1', container_instance_id: null, g5_anchor_id: null, npc_instance_id: null },
      ownership_model: 'service',
      holder_model: 'fixed',
      controller_model: 'none',
      access_model: { can_see: true, can_touch: true, can_take: false, can_buy: false, can_borrow: false, can_open: false, requires_permission: true, requires_payment: false, requires_key_or_tool: false },
      risk_model: { witness_risk: 'low', legal_risk: 'low', reputation_risk: 'low', violence_or_punishment_risk: 'none' },
      transfer_conditions: { can_transfer_to_player_later: true, allowed_transfer_reasons: ['gift', 'purchase'], requires_causal_basis: true }
    }],
    visibility_state: [{ item_instance_id: 'item_1', visible_to_player_now: true }, { container_instance_id: 'container_1', visible_to_player_now: true }],
    access_state: [{ item_instance_id: 'item_1', access: 'reachable' }, { container_instance_id: 'container_1', access: 'closed' }],
    risk_state: [{ item_instance_id: 'item_1', theft_risk: 'low' }, { container_instance_id: 'container_1', opening_risk: 'low' }],
    rejected_item_placements: [],
    downstream_constraints: { must_preserve: [], must_not_create_yet: [], must_resolve_later: [] },
    source_trace: [{ record_id: 'stage16', source_ids: ['src_item_1', 'src_container_1'] }],
    audit_self_check: { pass: true, concerns: [], evidence: [{ check: 'self', pass: true }] },
    ...overrides
  };
}

function auditFixture(overrides = {}) {
  const checks = Object.fromEntries([
    'all_item_candidates_exist',
    'all_container_candidates_exist',
    'all_property_rules_exist',
    'all_anchors_valid',
    'all_holders_valid',
    'causal_basis_valid',
    'visibility_access_property_risk_valid',
    'closed_containers_protected',
    'no_player_inventory_duplicates',
    'no_forbidden_entities_created',
    'source_trace_sufficient'
  ].map((key) => [key, { pass: true }]));
  return {
    version: 1,
    schema: STAGE16_AUDIT_SCHEMA,
    request_id: 'req_16',
    pass: true,
    checks,
    concerns: [],
    evidence: [{ check: 'all', pass: true }],
    repair_route: null,
    commit_permission: {
      can_commit_item_instances: true,
      can_commit_container_instances: true,
      can_continue_to_time_light_gate: true,
      can_continue_to_visible_context: false
    },
    ...overrides
  };
}

function contextFixture(env = { NODE_ENV: 'test' }) {
  const outputs = new Map();
  const gates = new Map();
  return {
    env,
    requestId: 'req_16',
    getStageOutput: (id) => outputs.get(id),
    setStageOutput: (id, value) => outputs.set(id, value),
    setGateResult: (id, value) => gates.set(id, value),
    setLifecycleState() {},
    freezeArtifact() {},
    note() {},
    outputs,
    gates
  };
}

test('builds exact item_placement_input with full policy and hard gates', () => {
  const source = inputFixture();
  const stages = new Map([[3, source.historical_frame], [8, source.item_profile_candidate_set], [9, source.selected_start_node], [10, source.start_place_audit], [11, source.player_character], [12, source.player_character_audit], [13, source.g5_scene_graph], [14, source.g5_scene_audit], [15, source.initial_npc_placement], [1502, source.npc_placement_audit]]);
  const built = buildStage16ItemPlacementInput({ requestId: 'req_16', getStageOutput: (id) => stages.get(id) });
  assert.equal(built.schema, STAGE16_INPUT_SCHEMA);
  assert.equal(built.item_placement_policy.require_causal_basis, true);
  assert.equal(built.item_placement_policy.do_not_change_g5_scene, true);
  assert.deepEqual(validateStage16ItemPlacementInput(built), []);
});

test('Stage 14 and Stage 15 permissions are hard input gates', () => {
  const input = inputFixture();
  input.g5_scene_audit.commit_permission.can_continue_to_item_placement = false;
  input.npc_placement_audit.commit_permission.can_continue_to_item_placement = false;
  const codes = new Set(validateStage16ItemPlacementInput(input).map((item) => item.code));
  assert.ok(codes.has('ITEM_PLACEMENT_G5_PERMISSION_DENIED'));
  assert.ok(codes.has('ITEM_PLACEMENT_NPC_PERMISSION_DENIED'));
});

test('item/container/property and anchor indexes filter allowlists', () => {
  const input = inputFixture();
  assert.equal(buildStage16ItemCandidateIndexes(input).byId.get('item_c1').item_profile_id, 'item_profile_1');
  assert.equal(buildStage16ContainerCandidateIndexes(input).byId.get('container_c1').container_profile_id, 'container_profile_1');
  assert.equal(buildStage16PropertyRuleIndexes(input).byId.get('prop_c1').property_rule_candidate_id, 'prop_c1');
  assert.equal(buildStage16AnchorIndexes(input).byId.get('a1').anchor_id, 'a1');
  assert.equal(filterStage16EligibleItems(input).length, 1);
  assert.equal(filterStage16EligibleContainers(input).length, 1);
  assert.equal(filterStage16EligiblePropertyRules(input).length, 1);
  assert.equal(filterStage16EligibleAnchors(input).item_anchors.length, 1);
});

test('valid draft passes strict validation and code precheck', () => {
  const concerns = validateStage16ItemPlacementDraft(draftFixture(), inputFixture());
  assert.deepEqual(concerns, []);
  const precheck = buildStage16ItemPlacementCodePrecheck(draftFixture(), inputFixture());
  assert.equal(precheck.schema, STAGE16_PRECHECK_SCHEMA);
  assert.equal(precheck.pass, true);
});

test('candidate, property, anchor and holder references are validated', () => {
  const draft = draftFixture();
  draft.item_instances[0].item_profile_candidate_id = 'missing_item';
  draft.item_instances[0].property_state.property_rule_candidate_id = 'missing_property';
  draft.item_instances[0].placement.g5_anchor_id = 'missing_anchor';
  draft.item_instances[0].placement.holder_npc_instance_id = 'missing_npc';
  const codes = new Set(validateStage16ItemPlacementDraft(draft, inputFixture()).map((item) => item.code));
  assert.ok(codes.has('ITEM_PLACEMENT_ITEM_PROFILE_CANDIDATE_NOT_FOUND'));
  assert.ok(codes.has('ITEM_PLACEMENT_PROPERTY_RULE_CANDIDATE_NOT_FOUND'));
  assert.ok(codes.has('ITEM_PLACEMENT_ANCHOR_NOT_FOUND'));
  assert.ok(codes.has('ITEM_PLACEMENT_NPC_HOLDER_NOT_FOUND'));
});

test('causal basis, player desire and physical properties are enforced', () => {
  const draft = draftFixture();
  draft.item_instances[0].placement.causal_basis_type = 'player_desire';
  delete draft.item_instances[0].physical_state.weight;
  delete draft.item_instances[0].physical_state.size_band;
  delete draft.item_instances[0].physical_state.condition;
  const codes = new Set(validateStage16ItemPlacementDraft(draft, inputFixture()).map((item) => item.code));
  assert.ok(codes.has('ITEM_PLACEMENT_PLAYER_DESIRE_MATERIALIZED'));
  assert.ok(codes.has('ITEM_PLACEMENT_WEIGHT_MISSING'));
  assert.ok(codes.has('ITEM_PLACEMENT_SIZE_MISSING'));
  assert.ok(codes.has('ITEM_PLACEMENT_CONDITION_MISSING'));
});

test('hidden visibility, risk and closed-container contents are protected', () => {
  const input = inputFixture();
  input.item_profile_candidate_set.item_profile_candidates[0].rarity = 'rare';
  const draft = draftFixture();
  draft.item_instances[0].visibility_state.visibility = 'hidden';
  draft.item_instances[0].visibility_state.visible_to_player_now = true;
  draft.item_instances[0].risk_state = { theft_risk: 'none', witness_risk: 'none', legal_risk: 'none', reputation_risk: 'none', damage_risk: 'none', noise_risk: 'none', risk_basis: [] };
  draft.container_instances[0].content_state.content_materialized = true;
  const codes = new Set(validateStage16ItemPlacementDraft(draft, input).map((item) => item.code));
  assert.ok(codes.has('ITEM_PLACEMENT_HIDDEN_ITEM_VISIBLE'));
  assert.ok(codes.has('ITEM_PLACEMENT_RISK_MISSING'));
  assert.ok(codes.has('ITEM_PLACEMENT_CLOSED_CONTAINER_CONTENTS_LEAK'));
});

test('player inventory duplicate and NPC/G5/prose/hidden-event leakage are rejected', () => {
  const draft = draftFixture();
  draft.item_instances[0].item_instance_id = 'existing_pc_item';
  draft.new_npcs = [{ npc_instance_id: 'npc_new' }];
  draft.new_anchor = { anchor_id: 'a_new' };
  draft.visible_scene = 'forbidden';
  draft.hidden_event = { id: 'event_1' };
  const codes = new Set(validateStage16ItemPlacementDraft(draft, inputFixture()).map((item) => item.code));
  assert.ok(codes.has('ITEM_PLACEMENT_PLAYER_INVENTORY_DUPLICATE'));
  assert.ok(codes.has('ITEM_PLACEMENT_CREATED_NPC'));
  assert.ok(codes.has('ITEM_PLACEMENT_CREATED_G5_ANCHOR'));
  assert.ok(codes.has('ITEM_PLACEMENT_CREATED_VISIBLE_SCENE'));
  assert.ok(codes.has('ITEM_PLACEMENT_CREATED_HIDDEN_EVENT'));
});

test('empty_allowed is valid only with policy, reason and audit evidence', () => {
  const draft = draftFixture({
    placement_status: 'empty_allowed',
    item_instances: [],
    container_instances: [],
    item_anchor_bindings: [],
    container_anchor_bindings: [],
    property_bindings: [],
    visibility_state: [],
    access_state: [],
    risk_state: [],
    empty_scene_reason: 'No material object is causally required in the starting view.'
  });
  assert.deepEqual(validateStage16ItemPlacementDraft(draft, inputFixture()), []);
  const invalid = structuredClone(draft);
  delete invalid.empty_scene_reason;
  invalid.audit_self_check.evidence = [];
  const codes = new Set(validateStage16ItemPlacementDraft(invalid, inputFixture()).map((item) => item.code));
  assert.ok(codes.has('ITEM_PLACEMENT_EMPTY_REASON_MISSING'));
  assert.ok(codes.has('ITEM_PLACEMENT_EMPTY_AUDIT_EVIDENCE'));
});

test('code precheck failure blocks the independent auditor', async () => {
  let audited = 0;
  await assert.rejects(runStage16ItemPlacementBlock({
    input: inputFixture(),
    place: async () => draftFixture({ source_trace: [] }),
    audit: async () => { audited += 1; return auditFixture(); }
  }), /code precheck/);
  assert.equal(audited, 0);
});

test('placer and independent auditor are both called for valid output', async () => {
  let placed = 0;
  let audited = 0;
  const result = await runStage16ItemPlacementBlock({
    input: inputFixture(),
    place: async () => { placed += 1; return draftFixture(); },
    audit: async () => { audited += 1; return auditFixture(); }
  });
  assert.equal(result.pass, true);
  assert.equal(placed, 1);
  assert.equal(audited, 1);
});

test('audit requires checks/evidence/repair route and strict permissions', () => {
  const invalid = auditFixture({
    pass: false,
    checks: {},
    concerns: [],
    evidence: [],
    repair_route: null,
    commit_permission: {
      can_commit_item_instances: true,
      can_commit_container_instances: false,
      can_continue_to_time_light_gate: false,
      can_continue_to_visible_context: false
    }
  });
  const codes = new Set(validateStage16ItemPlacementAudit(invalid, draftFixture(), inputFixture()).map((item) => item.code));
  assert.ok(codes.has('ITEM_PLACEMENT_EMPTY_AUDIT_EVIDENCE'));
  assert.ok(codes.has('ITEM_PLACEMENT_AUDIT_CONCERNS_MISSING'));
  assert.ok(codes.has('ITEM_PLACEMENT_AUDIT_REPAIR_ROUTE_MISSING'));
  assert.ok(codes.has('ITEM_PLACEMENT_AUDIT_PERMISSION_INVALID'));
});

test('no valid G5 item/container anchor returns repair route to Stage 13 before LLM', async () => {
  const input = inputFixture();
  input.g5_scene_graph.g5_anchors[0].supports.can_hold_item = false;
  input.g5_scene_graph.g5_anchors[0].supports.can_hold_container = false;
  let called = false;
  await assert.rejects(
    runStage16ItemPlacementBlock({ input, place: async () => { called = true; }, audit: async () => auditFixture() }),
    (error) => error.semanticRecoveryRoute?.return_to_stage === 13
  );
  assert.equal(called, false);
});

test('production rejects provided Stage 16 output', async () => {
  const context = contextFixture({ NODE_ENV: 'production' });
  await assert.rejects(runStage16ItemPlacement(context, {
    input: inputFixture(),
    providedDraft: draftFixture(),
    providedAudit: auditFixture()
  }), /disabled in production/);
});

test('successful Stage 16 stores draft/precheck/audit and builds strict Stage 17 input', async () => {
  const context = contextFixture();
  await runStage16ItemPlacement(context, {
    input: inputFixture(),
    executor: async ({ stage }) => stage.role === 'InitialItemPlacementAuditor' ? auditFixture() : draftFixture()
  });
  assert.equal(context.outputs.get(16).schema, STAGE16_DRAFT_SCHEMA);
  assert.equal(context.outputs.get(1601).schema, STAGE16_PRECHECK_SCHEMA);
  assert.equal(context.outputs.get(1602).schema, STAGE16_AUDIT_SCHEMA);
  const next = buildStage17TimeLightConsistencyInput(context, {
    historical_frame: inputFixture().historical_frame,
    selected_start_node: inputFixture().selected_start_node,
    player_character: inputFixture().player_character,
    g5_scene_graph: inputFixture().g5_scene_graph,
    initial_npc_placement: inputFixture().initial_npc_placement
  });
  assert.equal(next.schema, 'time_light_consistency_input');
  assert.equal(next.initial_item_placement.schema, STAGE16_DRAFT_SCHEMA);
  assert.equal(next.initial_item_placement_code_precheck.schema, STAGE16_PRECHECK_SCHEMA);
  assert.equal(next.item_placement_audit.schema, STAGE16_AUDIT_SCHEMA);
  assert.equal(next.constraints.preserve_item_anchor_bindings, true);
  assert.equal(next.constraints.do_not_generate_container_contents_without_causal_basis, true);
});
