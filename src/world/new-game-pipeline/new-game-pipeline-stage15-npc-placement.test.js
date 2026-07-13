import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildStage15AnchorIndex,
  buildStage15CandidateIndex,
  buildStage15NpcPlacementCodePrecheck,
  buildStage15NpcPlacementInput,
  filterStage15EligibleAnchors,
  filterStage15EligibleCandidates,
  runStage15NpcPlacement,
  runStage15NpcPlacementBlock,
  STAGE15_AUDIT_SCHEMA,
  STAGE15_DRAFT_SCHEMA,
  STAGE15_INPUT_SCHEMA,
  validateStage15NpcPlacementAudit,
  validateStage15NpcPlacementDraft,
  validateStage15NpcPlacementInput
} from '../stages/stage15-npc-placement.js';
import { buildStage16ItemPlacementInput } from '../stages/stage16-item-placement.js';

function inputFixture(overrides = {}) {
  return {
    version: 1,
    schema: STAGE15_INPUT_SCHEMA,
    request_id: 'req_1',
    historical_frame: {
      version: 1,
      schema: 'historical_frame',
      region: { region_id: 'region_1' },
      year: { value: 1230 },
      calendar: { season: 'winter' },
      clock: { day: 1, hour: 6, minute: 30, time_of_day: 'morning', light_profile: 'dim' }
    },
    selected_start_node: {
      version: 1,
      schema: 'selected_start_node',
      selected: { selected_scale_level: 'G4', selected_place_template_id: 'place_1' },
      selected_node_chain: { g1_node_id: 'g1', g2_node_id: 'g2', g3_node_id: 'g3', g4_node_id: 'g4' }
    },
    start_place_audit: { version: 1, schema: 'start_place_audit', pass: true },
    player_character: { version: 1, schema: 'player_character_game_profile' },
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
        supports: { can_hold_npc: true, npc_capacity: 2 },
        access: { access_state: 'open' },
        visibility: { visibility_default: 'visible' }
      }]
    },
    g5_scene_audit: {
      version: 1,
      schema: 'g5_scene_audit',
      pass: true,
      commit_permission: { can_continue_to_npc_placement: true }
    },
    npc_candidate_set: {
      version: 1,
      schema: 'npc_candidate_set',
      selection_status: 'ready',
      npc_candidates: [{
        npc_candidate_id: 'c1',
        profile_level: 'background',
        social_role_id: 'role_1',
        occupation_id: 'occ_1',
        npc_archetype_id: 'arch_1',
        place_template_ids: ['place_1'],
        allowed_seasons: ['winter'],
        allowed_time_of_day: ['morning'],
        name_pool_ids: ['names_1']
      }]
    },
    item_profile_candidate_set: {
      version: 1,
      schema: 'item_profile_candidate_set',
      item_profile_candidates: [{ item_profile_candidate_id: 'item_profile_1' }]
    },
    npc_placement_policy: {
      target_visible_background_npcs_min: 0,
      target_visible_background_npcs_max: 6,
      target_scene_npcs_min: 0,
      target_scene_npcs_max: 3,
      target_key_seed_npcs_max: 1,
      allow_empty_scene_if_place_supports_it: true,
      require_anchor_supports_npc: true,
      require_anchor_visibility_match: true,
      require_time_of_day_match: true,
      require_season_match: true,
      require_place_template_match: true,
      require_social_order_match: true,
      require_reason_for_presence: true,
      require_profile_level_limits: true,
      require_name_pool_for_named_scene_or_key_npc: true,
      allow_unnamed_background_npc: true,
      require_source_trace: true,
      do_not_write_intro_prose: true,
      do_not_create_dialogue: true,
      do_not_create_items_for_npc_yet: true,
      do_not_change_g5_scene: true,
      do_not_create_hidden_event: true,
      do_not_create_new_social_roles: true,
      do_not_create_new_occupations: true,
      do_not_create_new_npc_archetypes: true
    },
    ...overrides
  };
}

function draftFixture(overrides = {}) {
  return {
    version: 1,
    schema: STAGE15_DRAFT_SCHEMA,
    request_id: 'req_1',
    placement_status: 'placed',
    frame: { region_id: 'region_1', year: 1230, season: 'winter', clock: {} },
    parent_scene: { g4_node_id: 'g4', selected_place_template_id: 'place_1', g5_scene_id: null },
    npc_instances: [{
      npc_instance_id: 'npc_1',
      npc_candidate_id: 'c1',
      profile_level: 'background',
      identity: { name_status: 'visible_label', display_label: 'worker', name: null, name_pool_id: null, identity_known_to_player: false },
      base_refs: { npc_archetype_id: 'arch_1', social_role_id: 'role_1', occupation_id: 'occ_1', key_npc_seed_id: null },
      placement: { g5_anchor_id: 'a1', g5_minilocation_id: 'm1', parent_g4_node_id: 'g4', placement_basis: 'allowed anchor', presence_reason: 'ordinary work', right_to_be_here: 'yes' },
      current_activity: { activity_type: 'work', short_label: 'works', activity_basis: 'role', can_be_interrupted: true, time_until_change_minutes: 10 },
      visibility_state: { visible_to_player: true, audible_to_player: false, identified_by_player: false, requires_attention_check: false, requires_approach: false, hidden_from_player: false, visibility_basis: 'visible anchor' },
      attention_state: { attention_mode: 'busy' },
      witness_state: { can_witness_player_action: true },
      interaction_state: { can_be_addressed_now: false },
      knowledge_scope: { known_facts_now: [], rumors_now: [], mistaken_beliefs: [], forbidden_knowledge: [], knowledge_limits: [] },
      motivation_scope: { immediate_goal: 'work' },
      schedule_state: { available_now: true, movement_options_anchor_ids: [] },
      npc_resource_hints: { may_control_item_profile_candidate_ids: [], may_hold_item_profile_candidate_ids: [], may_guard_container_profile_candidate_ids: [], requires_item_placement_later: false },
      profile_promotion_rules: { can_promote_to_scene: true, can_promote_to_key: false, promotion_triggers: [] },
      source_trace: [{ record_id: 'c1', source_ids: ['s1'] }]
    }],
    npc_anchor_bindings: [{ npc_anchor_binding_id: 'b1', npc_instance_id: 'npc_1', g5_anchor_id: 'a1' }],
    npc_visibility_state: [{ npc_instance_id: 'npc_1', visible_to_player: true }],
    npc_attention_and_witness_state: [{ npc_instance_id: 'npc_1', attention_mode: 'busy' }],
    npc_schedule_state: [{ npc_instance_id: 'npc_1', available_now: true }],
    rejected_npc_placements: [],
    downstream_constraints: { must_preserve: [], must_not_create_yet: [], must_resolve_later: [] },
    source_trace: [{ record_id: 'c1', source_ids: ['s1'] }],
    audit_self_check: { pass: true, concerns: [], evidence: [{ check: 'self', pass: true }] },
    ...overrides
  };
}

function auditFixture(overrides = {}) {
  return {
    version: 1,
    schema: STAGE15_AUDIT_SCHEMA,
    request_id: 'req_1',
    pass: true,
    concerns: [],
    evidence: [{ check: 'all', pass: true }],
    repair_route: null,
    commit_permission: {
      can_commit_npc_instances: true,
      can_continue_to_item_placement: true,
      can_continue_to_visible_context: false
    },
    ...overrides
  };
}

test('builds exact Stage 15 input with normalized policy', () => {
  const stages = new Map([[3, inputFixture().historical_frame], [7, inputFixture().npc_candidate_set], [8, inputFixture().item_profile_candidate_set], [9, inputFixture().selected_start_node], [10, inputFixture().start_place_audit], [11, inputFixture().player_character], [12, inputFixture().player_character_audit], [13, inputFixture().g5_scene_graph], [14, inputFixture().g5_scene_audit]]);
  const built = buildStage15NpcPlacementInput({ requestId: 'req_1', getStageOutput: (id) => stages.get(id) });
  assert.equal(built.schema, STAGE15_INPUT_SCHEMA);
  assert.equal(built.version, 1);
  assert.equal(built.npc_placement_policy.do_not_create_dialogue, true);
  assert.equal(validateStage15NpcPlacementInput(built).length, 0);
});

test('Stage 14 permission is a hard input gate', () => {
  const input = inputFixture({ g5_scene_audit: { version: 1, schema: 'g5_scene_audit', pass: true, commit_permission: { can_continue_to_npc_placement: false } } });
  assert.ok(validateStage15NpcPlacementInput(input).some((item) => item.code === 'NPC_PLACEMENT_G5_PERMISSION_DENIED'));
});

test('candidate and anchor indexes/filtering use allowlists', () => {
  const input = inputFixture();
  assert.equal(buildStage15CandidateIndex(input).byId.get('c1').npc_candidate_id, 'c1');
  assert.equal(buildStage15AnchorIndex(input).byId.get('a1').anchor_id, 'a1');
  assert.equal(filterStage15EligibleCandidates(input).length, 1);
  assert.equal(filterStage15EligibleAnchors(input).length, 1);
});

test('valid draft passes all structural rules and code precheck', () => {
  const input = inputFixture();
  const draft = draftFixture();
  assert.deepEqual(validateStage15NpcPlacementDraft(draft, input), []);
  const precheck = buildStage15NpcPlacementCodePrecheck(draft, input);
  assert.equal(precheck.pass, true);
  assert.equal(precheck.schema, 'initial_npc_placement_code_precheck');
});

test('unknown candidate, anchor and concrete item are rejected', () => {
  const draft = draftFixture();
  draft.npc_instances[0].npc_candidate_id = 'unknown';
  draft.npc_instances[0].placement.g5_anchor_id = 'unknown';
  draft.npc_instances[0].item_id = 'item_1';
  const codes = new Set(validateStage15NpcPlacementDraft(draft, inputFixture()).map((item) => item.code));
  assert.ok(codes.has('NPC_PLACEMENT_CANDIDATE_NOT_FOUND'));
  assert.ok(codes.has('NPC_PLACEMENT_ANCHOR_NOT_FOUND'));
  assert.ok(codes.has('NPC_PLACEMENT_CREATED_ITEM_TOO_EARLY'));
});

test('empty_allowed requires policy and evidence', () => {
  const draft = draftFixture({ placement_status: 'empty_allowed', npc_instances: [], npc_anchor_bindings: [], npc_visibility_state: [], npc_attention_and_witness_state: [], npc_schedule_state: [], empty_scene_reason: 'No one is present at this hour.' });
  assert.deepEqual(validateStage15NpcPlacementDraft(draft, inputFixture()), []);
  const invalid = structuredClone(draft);
  delete invalid.empty_scene_reason;
  invalid.audit_self_check.evidence = [];
  assert.ok(validateStage15NpcPlacementDraft(invalid, inputFixture()).some((item) => item.code === 'NPC_PLACEMENT_EMPTY_REASON_MISSING'));
});

test('audit requires evidence and repair route on failure', () => {
  const invalid = auditFixture({ pass: false, concerns: [{ code: 'X' }], evidence: [], repair_route: null });
  const codes = new Set(validateStage15NpcPlacementAudit(invalid, draftFixture(), inputFixture()).map((item) => item.code));
  assert.ok(codes.has('NPC_PLACEMENT_EMPTY_AUDIT_EVIDENCE'));
  assert.ok(codes.has('NPC_PLACEMENT_AUDIT_REPAIR_ROUTE_MISSING'));
});

test('isolated block invokes placer and auditor', async () => {
  let placed = 0;
  let audited = 0;
  const result = await runStage15NpcPlacementBlock({
    input: inputFixture(),
    place: async () => { placed += 1; return draftFixture(); },
    audit: async () => { audited += 1; return auditFixture(); }
  });
  assert.equal(result.pass, true);
  assert.equal(placed, 1);
  assert.equal(audited, 1);
});

test('no valid NPC anchor returns repair route to Stage 13 before LLM', async () => {
  const input = inputFixture();
  input.g5_scene_graph.g5_anchors[0].supports.can_hold_npc = false;
  let called = false;
  await assert.rejects(
    runStage15NpcPlacementBlock({ input, place: async () => { called = true; }, audit: async () => auditFixture() }),
    (error) => error.semanticRecoveryRoute?.return_to_stage === 13
  );
  assert.equal(called, false);
});

test('Stage 16 input contains draft, audit and preserve constraints', () => {
  const input = buildStage16ItemPlacementInput({ requestId: 'req_1', getStageOutput: (id) => ({ 15: draftFixture(), 1502: auditFixture() }[id]) });
  assert.equal(input.schema, 'item_placement_input');
  assert.equal(input.initial_npc_placement.schema, STAGE15_DRAFT_SCHEMA);
  assert.equal(input.npc_placement_audit.schema, STAGE15_AUDIT_SCHEMA);
  assert.equal(input.item_placement_policy.require_causal_basis, true);
  assert.equal(input.item_placement_policy.do_not_change_g5_scene, true);
});


test('blocked and requires_repair statuses cannot pass code precheck', () => {
  for (const status of ['blocked', 'requires_repair']) {
    const precheck = buildStage15NpcPlacementCodePrecheck(draftFixture({ placement_status: status }), inputFixture());
    assert.equal(precheck.pass, false);
    assert.ok(precheck.concerns.some((item) => item.code === 'NPC_PLACEMENT_STATUS_NOT_COMMITTABLE'));
  }
});

test('production rejects provided Stage 15 output before commit', async () => {
  const context = { env: { NODE_ENV: 'production' }, requestId: 'req_1' };
  await assert.rejects(
    runStage15NpcPlacement(context, {
      input: inputFixture(),
      providedDraft: draftFixture(),
      providedAudit: auditFixture()
    }),
    /disabled in production/
  );
});
