import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFullHiddenStateCodePrecheck,
  buildStage19HiddenStateInput,
  buildStage19ReferenceIndex,
  runStage19HiddenStateBlock,
  STAGE19_AUDIT_SCHEMA,
  STAGE19_RESULT_SCHEMA,
  validateFullHiddenSceneState,
  validateStage19Input
} from '../stages/stage19-hidden-state.js';

function makeInput(overrides = {}) {
  const weather = {
    version: 1,
    schema: 'weather_state',
    weather_kind: 'cloudy',
    temperature_band: 'cold',
    precipitation: 'none',
    wind: 'weak',
    visibility_weather_modifier: 'reduced',
    ground_state: 'snow',
    weather_source: 'regional_rule'
  };
  return buildStage19HiddenStateInput({
    request_id: 'req_19',
    historical_frame: {
      version: 1,
      schema: 'historical_frame',
      region: { region_id: 'region_1' },
      year: { value: 1230 },
      calendar: { season: 'winter' },
      clock: { day: 1, hour: 3, minute: 45, time_of_day: 'deep_night', light_profile: 'dark' }
    },
    weather_state: weather,
    selected_start_node: {
      version: 1,
      schema: 'selected_start_node',
      selected: { selected_node_id: 'g4_1', selected_scale_level: 'G4' },
      selected_node_chain: { g1_node_id: 'g1_1', g2_node_id: 'g2_1', g3_node_id: 'g3_1', g4_node_id: 'g4_1' }
    },
    player_character: { version: 1, schema: 'player_character_game_profile', player_character_id: 'pc_1' },
    g5_scene_graph: {
      version: 1,
      schema: 'g5_scene_graph_draft',
      parent_location: { g1_node_id: 'g1_1', g2_node_id: 'g2_1', g3_node_id: 'g3_1', g4_node_id: 'g4_1' },
      g5_minilocations: [{ minilocation_id: 'mini_1' }],
      g5_anchors: [{ anchor_id: 'anchor_1', minilocation_id: 'mini_1' }, { anchor_id: 'anchor_2', minilocation_id: 'mini_1' }],
      g5_edges: [{ g5_edge_id: 'g5_edge_1', from_anchor_id: 'anchor_1', to_anchor_id: 'anchor_2' }],
      access_model: {}
    },
    g5_scene_audit: { version: 1, schema: 'g5_scene_audit', pass: true },
    initial_npc_placement: { version: 1, schema: 'initial_npc_placement_draft', placement_status: 'empty_allowed', npc_instances: [] },
    npc_placement_audit: { version: 1, schema: 'initial_npc_placement_audit', pass: true },
    initial_item_placement: { version: 1, schema: 'initial_item_placement_draft', placement_status: 'empty_allowed', item_instances: [], container_instances: [] },
    item_placement_audit: { version: 1, schema: 'initial_item_placement_audit', pass: true },
    time_light_consistency_audit: {
      version: 1,
      schema: 'time_light_consistency_audit',
      pass: true,
      authoritative_frame: { weather_state: weather },
      commit_permission: { can_continue_to_visible_context: true, can_continue_to_narrator: false }
    },
    character_knowledge_map: { version: 1, schema: 'character_knowledge_map', forbidden_knowledge: [] },
    character_knowledge_map_audit: {
      version: 1,
      schema: 'character_knowledge_map_audit',
      pass: true,
      commit_permission: { can_continue_to_hidden_state: true }
    },
    regional_context_package: {
      version: 1,
      schema: 'regional_context_package',
      social_context: {}, property_context: {}, event_context: {}, conflict_context: {}, danger_context: {}, authority_context: {}, npc_context: {}, item_context: {}
    },
    world_base_route_snapshot: {
      version: 1,
      schema: 'world_base_route_snapshot',
      nearby_graph_edges: [{ graph_edge_id: 'graph_edge_1', from_node_id: 'g4_1', to_node_id: 'g4_2' }],
      known_route_candidates: [], historical_anchor_candidates: [], route_knowledge_rule_candidates: []
    },
    ...overrides
  });
}

function makeValidOutput(input, overrides = {}) {
  return {
    version: 1,
    schema: 'full_hidden_scene_state',
    request_id: input.request_id,
    hidden_state_status: 'formed',
    frame: {
      region_id: input.historical_frame.region.region_id,
      year: input.historical_frame.year.value,
      season: input.historical_frame.calendar.season,
      clock: structuredClone(input.historical_frame.clock),
      weather_state: structuredClone(input.weather_state)
    },
    parent_scene: { g4_node_id: 'g4_1', g5_scene_id: null, player_current_anchor_id: 'anchor_1' },
    hidden_npc_state: [],
    hidden_access_state: [],
    hidden_property_state: [],
    hidden_container_state: [],
    hidden_item_state: [],
    hidden_risk_state: [],
    hidden_event_state: [],
    hidden_social_state: [],
    hidden_route_state: [{
      hidden_route_state_id: 'hidden_route_1',
      route_ref: { g5_edge_id: 'g5_edge_1', graph_edge_id: 'graph_edge_1', route_id: null },
      actual_state: 'watched',
      visible_state: 'uncertain',
      known_to_character: 'partly',
      hidden_risks: [],
      triggered_changes: [],
      reveal_condition_ids: ['reveal_1'],
      source_trace: []
    }],
    hidden_environment_state: [],
    discovery_rules: [],
    reveal_conditions: [{
      reveal_condition_id: 'reveal_1',
      hidden_fact_id: 'hidden_route_1',
      can_reveal_to: 'character',
      reveal_channel: 'map_update',
      condition_type: 'inspection_success',
      condition_params: {},
      reveal_text_policy: { allowed_summary_level: 'partial', must_not_reveal_extra: true, must_not_explain_hidden_cause: true }
    }],
    consequence_hooks: [],
    forbidden_output_rules: [],
    player_facing_boundary: { hide_private_motives: true },
    source_trace: [{ source_type: 'g5_edge', source_id: 'g5_edge_1', supports: ['hidden_route_state'] }],
    audit_self_check: { pass: true, concerns: [], evidence: ['all refs checked'] },
    ...overrides
  };
}

function passingAudit() {
  return { version: 1, schema: STAGE19_AUDIT_SCHEMA, pass: true, concerns: [], evidence: ['independent audit passed'] };
}

test('valid Stage 19 input and output pass code precheck', () => {
  const input = makeInput();
  assert.deepEqual(validateStage19Input(input), []);
  const output = makeValidOutput(input);
  const precheck = buildFullHiddenStateCodePrecheck(output, input);
  assert.equal(precheck.pass, true, JSON.stringify(precheck.concerns, null, 2));
});

test('reference index contains only approved G5 and graph edges', () => {
  const refs = buildStage19ReferenceIndex(makeInput());
  assert.deepEqual([...refs.g5EdgeIds], ['g5_edge_1']);
  assert.deepEqual([...refs.graphEdgeIds], ['graph_edge_1']);
  assert.equal(refs.graphEdgeIds.has('route_template_1'), false);
});

test('route_id is forbidden before Stage 24-25 commit', () => {
  const input = makeInput();
  const output = makeValidOutput(input);
  output.hidden_route_state[0].route_ref.route_id = 'party_route_1';
  const issues = validateFullHiddenSceneState(output, input);
  assert.ok(issues.some((item) => item.code === 'HIDDEN_STATE_ROUTE_ID_FORBIDDEN_BEFORE_COMMIT'));
});

test('unknown graph edge is rejected', () => {
  const input = makeInput();
  const output = makeValidOutput(input);
  output.hidden_route_state[0].route_ref.graph_edge_id = 'graph_edge_unknown';
  const issues = validateFullHiddenSceneState(output, input);
  assert.ok(issues.some((item) => item.code === 'HIDDEN_STATE_ROUTE_REF_NOT_FOUND'));
});

test('failed upstream G5 audit blocks Stage 19 input', () => {
  const input = makeInput({ g5_scene_audit: { version: 1, schema: 'g5_scene_audit', pass: false } });
  assert.ok(validateStage19Input(input).some((item) => item.code === 'HIDDEN_STATE_G5_AUDIT_FAILED'));
});

test('player-facing prose is rejected recursively', () => {
  const input = makeInput();
  const output = makeValidOutput(input, { visible_scene: 'Игрок видит скрытую причину.' });
  assert.ok(validateFullHiddenSceneState(output, input).some((item) => item.code === 'HIDDEN_STATE_CREATED_VISIBLE_SCENE'));
});

test('hidden risk requires a trigger', () => {
  const input = makeInput();
  const output = makeValidOutput(input);
  output.hidden_risk_state.push({
    hidden_risk_state_id: 'risk_1',
    risk_target: { target_type: 'route', target_id: 'g5_edge_1' },
    risk_type: 'route', actual_severity: 'medium', visible_hint_level: 'faint', what_player_can_notice: null,
    what_is_hidden: 'watchers', trigger_conditions: [], consequence_hook_ids: [], reveal_condition_ids: ['reveal_risk'], source_trace: []
  });
  output.reveal_conditions.push({ reveal_condition_id: 'reveal_risk', hidden_fact_id: 'risk_1', condition_type: 'inspection_success' });
  output.forbidden_output_rules.push({ forbidden_output_rule_id: 'forbid_risk', hidden_fact_ids: ['risk_1'], forbidden_surface: 'narrator_prose', rule: 'reveal_only_after_condition', reason: 'hidden_state' });
  assert.ok(validateFullHiddenSceneState(output, input).some((item) => item.code === 'HIDDEN_STATE_RISK_WITHOUT_TRIGGER'));
});

test('sensitive NPC motive requires forbidden output coverage', () => {
  const base = makeInput();
  const input = makeInput({
    initial_npc_placement: { ...base.initial_npc_placement, placement_status: 'placed', npc_instances: [{ npc_instance_id: 'npc_1', npc_profile_level: 'scene' }] }
  });
  const output = makeValidOutput(input);
  output.hidden_npc_state.push({
    hidden_npc_state_id: 'hidden_npc_1', npc_instance_id: 'npc_1', npc_profile_level: 'scene',
    private_motives: [{ motive_id: 'motive_1', known_to_player: false, known_to_character: false, reveal_condition_ids: ['reveal_motive'] }],
    private_constraints: [], private_knowledge: [], reaction_model: {}, memory_hooks: [], consequence_hooks: [], source_trace: []
  });
  output.reveal_conditions.push({ reveal_condition_id: 'reveal_motive', hidden_fact_id: 'motive_1', condition_type: 'dialogue_success' });
  const issues = validateFullHiddenSceneState(output, input);
  assert.ok(issues.some((item) => item.code === 'HIDDEN_STATE_FORBIDDEN_OUTPUT_RULE_MISSING'));
});

test('Stage 19 cannot materialize unapproved container contents', () => {
  const base = makeInput();
  const input = makeInput({
    initial_item_placement: {
      ...base.initial_item_placement,
      placement_status: 'placed',
      item_instances: [{ item_instance_id: 'item_1' }],
      container_instances: [{ container_instance_id: 'container_1', content_instance_ids: [] }]
    }
  });
  const output = makeValidOutput(input);
  output.hidden_container_state.push({
    hidden_container_state_id: 'hidden_container_1', container_instance_id: 'container_1',
    container_truth: { actual_state: 'closed', visible_state: 'visible_closed' },
    content_truth: { content_policy: 'materialized', content_known_to_player: false, content_known_to_character: false, content_instance_ids: ['item_1'], content_summary_for_system: 'tools' },
    access_truth: {}, intervention_traces: {}, risk_truth: {}, reveal_condition_ids: ['reveal_container'], consequence_hook_ids: [], source_trace: []
  });
  output.reveal_conditions.push({ reveal_condition_id: 'reveal_container', hidden_fact_id: 'hidden_container_1', condition_type: 'forced_open' });
  output.forbidden_output_rules.push({ forbidden_output_rule_id: 'forbid_container', hidden_fact_ids: ['hidden_container_1'], forbidden_surface: 'visible_scene', rule: 'reveal_only_after_condition', reason: 'closed_container' });
  assert.ok(validateFullHiddenSceneState(output, input).some((item) => item.code === 'HIDDEN_STATE_CREATED_ITEM'));
});

test('empty_limited is accepted only for genuinely empty scene hidden state', () => {
  const input = makeInput();
  const output = makeValidOutput(input, {
    hidden_state_status: 'empty_limited',
    hidden_route_state: [],
    reveal_conditions: [],
    source_trace: [{ source_type: 'scene', source_id: 'g4_1', supports: ['empty_limited'] }]
  });
  assert.equal(buildFullHiddenStateCodePrecheck(output, input).pass, true);
});

test('empty_limited is rejected when a scene NPC exists', () => {
  const base = makeInput();
  const input = makeInput({
    initial_npc_placement: { ...base.initial_npc_placement, placement_status: 'placed', npc_instances: [{ npc_instance_id: 'npc_1', npc_profile_level: 'scene' }] }
  });
  const output = makeValidOutput(input, { hidden_state_status: 'empty_limited', hidden_route_state: [], reveal_conditions: [] });
  assert.ok(validateFullHiddenSceneState(output, input).some((item) => item.code === 'HIDDEN_STATE_EMPTY_LIMITED_INVALID'));
});

test('isolated block calls builder and independent auditor and returns one bundle', async () => {
  const input = makeInput();
  const output = makeValidOutput(input);
  const calls = [];
  const result = await runStage19HiddenStateBlock({
    input,
    build: async (received) => { calls.push(['builder', received]); return output; },
    audit: async (received) => { calls.push(['auditor', received]); return passingAudit(); },
    formatRepair: async () => assert.fail('format repair should not run'),
    semanticRepair: async () => assert.fail('semantic repair should not run'),
    seniorRepair: async () => assert.fail('senior repair should not run')
  });
  assert.equal(result.schema, STAGE19_RESULT_SCHEMA);
  assert.equal(result.commit_permission.can_continue_to_visible_context, true);
  assert.equal(calls[0][1].context, undefined);
  assert.equal(calls[1][1].full_hidden_scene_state.schema, 'full_hidden_scene_state');
});

test('invalid JSON is routed through format repair before precheck', async () => {
  const input = makeInput();
  const output = makeValidOutput(input);
  let formatCalls = 0;
  const result = await runStage19HiddenStateBlock({
    input,
    build: async () => '{invalid json',
    audit: async () => passingAudit(),
    formatRepair: async (payload) => { formatCalls += 1; assert.equal(payload.target, 'full_hidden_scene_state'); return output; },
    semanticRepair: async () => assert.fail('semantic repair should not run'),
    seniorRepair: async () => assert.fail('senior repair should not run')
  });
  assert.equal(result.pass, true);
  assert.equal(formatCalls, 1);
  assert.equal(result.repair_history[0].kind, 'format');
});

test('semantic repair receives code validation errors', async () => {
  const input = makeInput();
  const invalid = makeValidOutput(input);
  invalid.hidden_route_state[0].route_ref.graph_edge_id = 'missing';
  const valid = makeValidOutput(input);
  let semanticPayload = null;
  const result = await runStage19HiddenStateBlock({
    input,
    build: async () => invalid,
    audit: async () => passingAudit(),
    formatRepair: async (payload) => payload.parsed_output,
    semanticRepair: async (payload) => { semanticPayload = payload; return valid; },
    seniorRepair: async () => assert.fail('senior repair should not run')
  });
  assert.equal(result.pass, true);
  assert.ok(semanticPayload.validationErrors.some((item) => item.code === 'HIDDEN_STATE_ROUTE_REF_NOT_FOUND'));
});

test('second semantic failure escalates to senior repair', async () => {
  const input = makeInput();
  const invalid = makeValidOutput(input);
  invalid.hidden_route_state[0].route_ref.graph_edge_id = 'missing';
  const valid = makeValidOutput(input);
  let seniorCalls = 0;
  const result = await runStage19HiddenStateBlock({
    input,
    build: async () => invalid,
    audit: async () => passingAudit(),
    formatRepair: async (payload) => payload.parsed_output,
    semanticRepair: async () => invalid,
    seniorRepair: async () => { seniorCalls += 1; return valid; }
  });
  assert.equal(result.pass, true);
  assert.equal(seniorCalls, 1);
  assert.ok(result.repair_history.some((item) => item.kind === 'senior_semantic'));
});

test('failed semantic audit triggers state repair and a fresh audit', async () => {
  const input = makeInput();
  const output = makeValidOutput(input);
  let audits = 0;
  const result = await runStage19HiddenStateBlock({
    input,
    build: async () => output,
    audit: async () => {
      audits += 1;
      return audits === 1
        ? { version: 1, schema: STAGE19_AUDIT_SCHEMA, pass: false, concerns: [{ code: 'SEMANTIC_CONFLICT', message: 'conflict' }], evidence: ['conflict evidence'] }
        : passingAudit();
    },
    formatRepair: async (payload) => payload.parsed_output,
    semanticRepair: async () => output,
    seniorRepair: async () => assert.fail('senior repair should not run')
  });
  assert.equal(result.pass, true);
  assert.equal(audits, 2);
});

test('malformed audit is repaired only as audit format', async () => {
  const input = makeInput();
  const output = makeValidOutput(input);
  const targets = [];
  const result = await runStage19HiddenStateBlock({
    input,
    build: async () => output,
    audit: async () => 'not json',
    formatRepair: async (payload) => { targets.push(payload.target); return passingAudit(); },
    semanticRepair: async () => assert.fail('semantic repair should not run'),
    seniorRepair: async () => assert.fail('senior repair should not run')
  });
  assert.equal(result.pass, true);
  assert.deepEqual(targets, ['full_hidden_state_audit']);
});

test('source trace and self-check evidence are mandatory', () => {
  const input = makeInput();
  const output = makeValidOutput(input, { source_trace: [], audit_self_check: { pass: true, concerns: [], evidence: [] } });
  const issues = validateFullHiddenSceneState(output, input);
  assert.ok(issues.some((item) => item.code === 'HIDDEN_STATE_SOURCE_MISSING'));
  assert.ok(issues.some((item) => item.code === 'HIDDEN_STATE_EMPTY_AUDIT_EVIDENCE'));
});

test('future event may remain system-hidden until its trigger', () => {
  const input = makeInput();
  const output = makeValidOutput(input);
  output.hidden_event_state.push({
    hidden_event_state_id: 'event_1', event_type: 'timer', event_status: 'armed',
    event_visibility: { known_to_player: false, known_to_character: false, visible_hint_now: null, must_not_reveal_until_triggered: true },
    trigger: { trigger_type: 'time_passed', trigger_params: {} },
    effect: { effect_type: 'route_blocks', effect_summary_for_system: 'edge becomes blocked', writes_to_tables: [] },
    timer: { starts_at_clock: null, fires_after_minutes: 10, expires_after_minutes: 0, paused: false }, source_trace: []
  });
  output.forbidden_output_rules.push({ forbidden_output_rule_id: 'forbid_event', hidden_fact_ids: ['event_1'], forbidden_surface: 'narrator_prose', rule: 'reveal_only_after_condition', reason: 'future_event' });
  const issues = validateFullHiddenSceneState(output, input);
  assert.equal(issues.some((item) => item.code === 'HIDDEN_STATE_NO_REVEAL_CONDITION' && item.field.includes('hidden_event_state')), false);
});
