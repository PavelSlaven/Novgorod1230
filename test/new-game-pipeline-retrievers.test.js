import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createNewGamePipelineContext,
  runNewGamePipeline,
  runNewGameRetrievalStages4To8
} from '../src/world/new-game-pipeline/index.js';

import {
  buildMinimalCandidateSet,
  buildStage3FixtureOutput
} from './fixtures/new-game-pipeline-stage3.js';
import { buildStage4FakeQueryable } from './fixtures/new-game-pipeline-stage4.js';

const historicalFrame = buildStage3FixtureOutput('req_fixture');

test('retrieval stages 4-8 return callable gated candidate sets', async () => {
  const context = createNewGamePipelineContext({ requestId: 'req_pipeline' });
  context.setStageOutput(2, normalizedRequestFixture('req_pipeline', 'Хочу начать у торгового двора'));
  const result = await runNewGameRetrievalStages4To8(context, {
    historicalFrame,
    queryable: fakeWorldBase()
  });

  assert.equal(result.regional_context_package.schema, 'regional_context_package');
  assert.equal(result.start_candidate_set.candidate_summary.g4_count, 1);
  assert.equal(result.start_candidate_set.candidates[0].candidate_id, 'start_candidate_g4');
  assert.equal(result.candidate_place_template_set.candidate_template_links.length, 1);
  assert.equal(result.npc_candidate_set.npc_candidates[0].social_role.social_role_id, 'role_merchant');
  assert.equal(result.item_profile_candidate_set.container_profile_candidates[0].container_label, 'basket');
  assert.equal(context.getGateResult(8).pass, true);
});

test('runNewGamePipeline is opt-in and completes all 26 stages with explicit fixtures', async () => {
  await assert.rejects(runNewGamePipeline({ historicalFrame, queryable: fakeWorldBase() }), /opt-in/u);

  const result = await runNewGamePipeline({
    enableNewGamePipeline: true,
    requestId: 'req_partial',
    startText: 'Хочу начать у торгового двора',
    playerName: 'Онфим',
    env: {},
    queryable: fakeWorldBase(),
    historicalFrameCandidateSet: buildMinimalCandidateSet('req_partial'),
    llmStageExecutor: async ({ stage, context }) => llmOutputFor(stage.id, context.requestId),
    g5Materialize: async () => g5Draft(),
    g5Audit: async () => g5Audit(),
    stage24Builder: async () => validWritePlan(),
    currentPositionAfterCommit: {
      region_id: 'region_novgorod_land',
      place_id: 'place_market',
      location_id: 'location_market',
      minilocation_id: 'mini_stall',
      anchor_id: 'anchor_stall',
      last_route_id: null
    },
    partyPublicState: partyPublicState()
  });

  assert.equal(result.status, 'committed_ready_for_player');
  assert.equal(result.pipeline_runtime, 'new_lifecycle');
  assert.equal(result.snapshot.pipeline_runtime, 'new_lifecycle');
  assert.equal(result.snapshot.diagnostics.pipeline_runtime, 'new_lifecycle');
  assert.equal(result.final_world_start_bundle.pipeline_runtime, 'new_lifecycle');
  assert.equal(result.party_start_committed.schema, 'party_start_committed');
  assert.equal(result.first_game_screen.schema, 'first_game_screen');
  assert.equal(result.partyScreenPayload.firstGameScreen.schema, 'first_game_screen');
  assert.equal(result.snapshot.outputs[24].schema, 'party_db_write_plan_stage_output');
  assert.equal(result.snapshot.outputs[25].schema, 'party_start_committed');
  assert.equal(result.snapshot.outputs[26].schema, 'first_game_screen');
  assert.equal(result.snapshot.gates[25].pass, true);
});

test('retrieval stages block when critical candidate set is empty', async () => {
  const context = createNewGamePipelineContext({ requestId: 'req_empty' });
  await assert.rejects(
    runNewGameRetrievalStages4To8(context, {
      historicalFrame,
      queryable: fakeWorldBase({ emptyGraph: true })
    }),
    /route templates|canonical graph edges|stage gate failed/i
  );
  assert.equal(context.getGateResult(4).pass, false);
});

test('narrator temporal mismatch retries once inside lifecycle and then passes', async () => {
  let narratorCalls = 0;
  const result = await runNewGamePipeline({
    enableNewGamePipeline: true,
    requestId: 'req_temporal_retry',
    startText: 'Хочу начать у торгового двора',
    playerName: 'Онфим',
    env: {},
    queryable: fakeWorldBase(),
    historicalFrameCandidateSet: buildMinimalCandidateSet('req_temporal_retry'),
    llmStageExecutor: async ({ stage, context }) => {
      if (stage.id !== 22) return llmOutputFor(stage.id, context.requestId);
      narratorCalls += 1;
      return narratorCalls === 1
        ? {
            version: 1,
            schema: 'narrator_starting_prose',
            prose_status: 'drafted',
            prose: 'Двор молчит и ждёт.',
            action_options: [{ label: 'Осмотреться.', action_kind: 'inspect' }],
            narrator_output_id: 'opening_message_retry'
          }
        : {
            version: 1,
            schema: 'narrator_starting_prose',
            prose_status: 'drafted',
            prose: 'Темно: глубокая ночь держит торговый ряд в холодной тишине.',
            action_options: [{ label: 'Осмотреться.', action_kind: 'inspect' }],
            narrator_output_id: 'opening_message_retry'
          };
    },
    g5Materialize: async () => g5Draft(),
    g5Audit: async () => g5Audit(),
    stage24Builder: async () => validWritePlan(),
    currentPositionAfterCommit: {
      region_id: 'region_novgorod_land',
      place_id: 'place_market',
      location_id: 'location_market',
      minilocation_id: 'mini_stall',
      anchor_id: 'anchor_stall',
      last_route_id: null
    },
    partyPublicState: partyPublicState()
  });

  assert.equal(narratorCalls, 2);
  assert.equal(result.snapshot.outputs[22].narrator_output_id, 'opening_message_retry');
  assert.match(result.snapshot.outputs[22].prose, /глубокая ночь|темно/u);
});

test('repeated observable error signature escalates repair and records diagnostics', async () => {
  let stage20Calls = 0;
  const result = await runNewGamePipeline({
    enableNewGamePipeline: true,
    requestId: 'req_observable_retry',
    startText: 'Хочу начать у торгового двора',
    playerName: 'Онфим',
    env: {},
    queryable: fakeWorldBase(),
    historicalFrameCandidateSet: buildMinimalCandidateSet('req_observable_retry'),
    llmStageExecutor: async ({ stage, context }) => {
      if (stage.id !== 20) return llmOutputFor(stage.id, context.requestId);
      stage20Calls += 1;
      if (stage20Calls < 3) {
        return {
          version: 1,
          schema: 'visible_context_stage_output',
          observable_fact_ledger: {
            version: 1,
            schema: 'observable_fact_ledger',
            observed_npcs: [],
            observed_objects: [
              {
                observable_id: 'obs_obj_001',
                source_path: 'visibleObjects[0]',
                item_id: null,
                label: 'нож рабочий',
                count: 1,
                dedupe_key: 'knife|same',
                visibility: 'visible',
                anchor_id: 'anchor_stall',
                location_basis: 'explicit',
                interactable: false,
                needs_anchor_if_interactable: true,
                object_context: 'scene_object',
                projection_policy: { allow_in_visible_scene: true, allow_in_visible_npc: false, allow_in_visible_objects: true, allow_as_interactable: false, reason: 'visible' },
                duplicate_sources: []
              },
              {
                observable_id: stage20Calls === 1 ? 'obs_obj_002' : 'obs_obj_003',
                source_path: 'visibleObjects[0]',
                item_id: null,
                label: 'нож рабочий',
                count: 1,
                dedupe_key: 'knife|same',
                visibility: 'visible',
                anchor_id: 'anchor_stall',
                location_basis: 'explicit',
                interactable: false,
                needs_anchor_if_interactable: true,
                object_context: 'scene_object',
                projection_policy: { allow_in_visible_scene: true, allow_in_visible_npc: false, allow_in_visible_objects: true, allow_as_interactable: false, reason: 'visible' },
                duplicate_sources: []
              }
            ],
            sensory_cues: [],
            character_knowledge: [],
            uncertainties: [],
            rejected_or_unsafe_sources: []
          },
          observable_fact_ledger_audit: passAudit('observable_fact_ledger_audit'),
          observable_projection_report: {},
          observable_dedupe_report: { duplicate_object_paths: ['root.observable_fact_ledger.observed_objects[1]'], duplicate_sources: [] },
          rejected_or_unsafe_sources: [],
          visible_context_package: llmOutputFor(20, context.requestId).visible_context_package
        };
      }
      return llmOutputFor(20, context.requestId);
    },
    g5Materialize: async () => g5Draft(),
    g5Audit: async () => g5Audit(),
    stage24Builder: async () => validWritePlan(),
    currentPositionAfterCommit: {
      region_id: 'region_novgorod_land',
      place_id: 'place_market',
      location_id: 'location_market',
      minilocation_id: 'mini_stall',
      anchor_id: 'anchor_stall',
      last_route_id: null
    },
    partyPublicState: partyPublicState()
  });

  assert.equal(stage20Calls, 3);
  assert.equal(result.snapshot.repair_history[20][1].repeated_error_signature, true);
  assert.equal(result.snapshot.repair_history[20][1].model_tier, 'tier_3_senior');
  assert.equal(result.snapshot.diagnostics.repeated_error_signature, true);
});

function fakeWorldBase({ emptyGraph = false } = {}) {
  return buildStage4FakeQueryable({ emptyGraph });
}

function llmOutputFor(stageId, requestId = 'req_fixture') {
  switch (stageId) {
    case 2:
      return normalizedRequestFixture(requestId, 'Хочу начать у торгового двора');
    case 3:
      return buildStage3FixtureOutput(requestId);
    case 9:
      return {
        version: 1,
        schema: 'selected_start_node',
        selected_candidate_id: 'start_candidate_g4',
        selected_candidate_place_template_link_id: 'candidate_place_template_link:start_candidate_g4:pt_market',
        selected_candidate_place_id: 'place_market',
        selected_candidate_location_id: 'location_market'
      };
    case 11:
      return {
        version: 1,
        schema: 'player_character_game_profile',
        player_character_id: 'pc_001',
        character_id: 'pc_001',
        name_or_label: 'Онфим',
        age_range: 'молодой взрослый',
        status: 'торговый человек',
        origin: 'Новгородская земля',
        body: { build: 'обычный', condition: 'уставший от холода' },
        numeric_states: { health: 100, satiety: 75, vigor: 70 },
        active_states: ['мёрзнет'],
        attributes: { caution: 10, sociability: 9 },
        skills: ['торг', 'счёт'],
        knowledge: ['знает рынок и местные порядки'],
        memory: ['помнит, кому должен серебро'],
        goals: ['найти заработок до утра'],
        fears: ['быть ограбленным ночью'],
        obligations: ['вернуть долг артели'],
        inventory: ['поясной кошель'],
        property_outside_inventory: [],
        relationships: [{ target: 'рынок', relation: 'свой среди торговцев' }],
        reason_here: 'ищет безопасное место переждать ночь и шанс на сделку',
        risk_profile: { legal: 'low', violence: 'medium', exposure: 'medium' }
      };
    case 12:
      return passAudit('player_character_audit');
    case 15:
      return {
        version: 1,
        schema: 'initial_npc_placement_draft',
        background_npcs: [],
        scene_npcs: [{ label: 'сонный сторож' }],
        key_npcs: [],
        visibility: { public_labels: ['сонный сторож'] },
        witness_risk: { level: 'medium' },
        known_to_character: [],
        hidden_profiles: [],
        initial_npc_placement_audit: passAudit('initial_npc_placement_audit')
      };
    case 16:
      return {
        version: 1,
        schema: 'initial_item_placement_draft',
        visible_items: [],
        hidden_items_with_signs: [],
        containers: [],
        ownership_claims: [],
        access_rules: [],
        inventory_links: [],
        property_links: [],
        risk_notes: [],
        initial_item_placement_audit: passAudit('initial_item_placement_audit')
      };
    case 18:
      return {
        version: 1,
        schema: 'character_knowledge_map',
        known_nodes: [],
        known_edges: [],
        rough_directions: [],
        rumored_paths: [],
        unknown_but_existing_paths: [],
        false_beliefs: [],
        knowledge_sources: [],
        limits: ['не знает, кто за воротами'],
        character_knowledge_map_audit: passAudit('character_knowledge_map_audit')
      };
    case 19:
      return {
        version: 1,
        schema: 'full_hidden_scene_state',
        forbidden_output_rules: ['no_hidden_leaks'],
        hidden_entities: [],
        full_hidden_state_audit: passAudit('full_hidden_state_audit')
      };
    case 20:
      return {
        version: 1,
        schema: 'visible_context_stage_output',
        observable_fact_ledger: {
          version: 1,
          schema: 'observable_fact_ledger',
          observed_npcs: [{
            observable_id: 'obs_npc_001',
            source_path: 'materialized_npcs.scene_npcs[0]',
            npc_id: null,
            npc_origin: 'observed_background_npc',
            label: 'сонный сторож',
            observed_behavior: 'дремлет у торгового ряда',
            visibility: 'visible',
            confidence: 'direct_observation',
            forbidden_inferences: [],
            projection_policy: {
              allow_in_visible_scene: true,
              allow_in_visible_npc: true,
              allow_in_visible_objects: false,
              allow_as_interactable: false,
              reason: 'видимая фигура в текущей сцене'
            }
          }],
          observed_objects: [{
            observable_id: 'obs_obj_001',
            source_path: 'materialized_items.containers[0]',
            item_id: null,
            label: 'корзина с товаром',
            count: 1,
            dedupe_key: 'basket_goods_market',
            visibility: 'visible',
            anchor_id: 'anchor_stall',
            location_basis: 'explicit',
            interactable: false,
            needs_anchor_if_interactable: true,
            object_context: 'scene_object',
            projection_policy: {
              allow_in_visible_scene: true,
              allow_in_visible_npc: false,
              allow_in_visible_objects: true,
              allow_as_interactable: false,
              reason: 'видимый контейнер у прилавка'
            },
            duplicate_sources: []
          }],
          sensory_cues: [{ observable_id: 'obs_cue_001', source_path: 'scene_facts.sound', text: 'тихо' }],
          character_knowledge: [{
            text: 'ночью рынок пустеет',
            knowledge_type: 'social_common_knowledge',
            truth_status: 'confirmed',
            projection_label: 'персонаж знает'
          }],
          uncertainties: ['неясно, кто ещё рядом'],
          rejected_or_unsafe_sources: []
        },
        observable_fact_ledger_audit: passAudit('observable_fact_ledger_audit'),
        observable_projection_report: {
          observed_npc_count: 1,
          observed_object_count: 1,
          sensory_cue_count: 1
        },
        observable_dedupe_report: {
          duplicate_object_paths: [],
          duplicate_sources: []
        },
        rejected_or_unsafe_sources: [],
        visible_context_package: {
          version: 1,
          schema: 'visible_context_package',
          visible_context_status: 'formed',
          temporal_context: {
            moment: 'глубокая ночь',
            hour: 3,
            minute: 45,
            light_state: 'темно',
            time_markers_allowed: ['глубокая ночь', 'ночь', 'темно'],
            time_markers_forbidden: ['утро', 'день', 'вечер', 'полдень'],
            uncertainty_notes: []
          },
          visible_scene: { summary: 'ночной торговый ряд' },
          visible_position: { label: 'у торгового ряда' },
          visible_npc: [{ label: 'сонный сторож' }],
          visible_objects: [{ label: 'корзина с товаром' }],
          sensory_details: ['холодно', 'тихо'],
          known_context: ['ночью рынок пустеет'],
          uncertainties: ['неясно, кто ещё рядом'],
          do_not_imply: ['кто владеет корзиной', 'что скрыто в темноте'],
          public_position_label: 'у торгового ряда',
          public_time_label: 'глубокая ночь',
          public_light_label: 'темно, видимость ограничена',
          public_weather_label: 'холодно',
          public_character_label: 'Ты',
          public_visible_npcs: [{ label: 'сонный сторож' }],
          public_visible_items: [],
          public_visible_containers: [{ label: 'корзина с товаром' }],
          public_visible_exits: [{ label: 'проход к воротам' }],
          public_attention_targets: [{ label: 'можно прислушаться к рынку' }],
          public_context_hints: [{ label: 'ночью шум быстро привлекает внимание' }],
          public_visible_map: {
            known_current_node: { label: 'торговый ряд', certainty: 'known_current' },
            known_nearby_nodes: [],
            unknown_exits: [{ label: 'проход к воротам', certainty: 'visible_but_unknown' }]
          }
        }
      };
    case 21:
      return passAudit('visible_context_audit');
    case 22:
      return {
        version: 1,
        schema: 'narrator_starting_prose',
        prose_status: 'drafted',
        prose: 'Темно и холодно. Вдоль торгового ряда дремлет сторож, рядом стоит корзина с товаром.',
        action_options: [
          { label: 'Осмотреть корзину.', action_kind: 'inspect' },
          { label: 'Заговорить со сторожем.', action_kind: 'ask' }
        ],
        narrator_output_id: 'opening_message_001'
      };
    case 23:
      return {
        ...passAudit('narrator_prose_audit'),
        commit_permission: {
          can_show_to_player: true,
          can_write_player_visible_message: true,
          can_mark_opening_scene_presented: true
        }
      };
    default:
      throw new Error(`Unexpected fixture LLM stage ${stageId}`);
  }
}

function g5Draft() {
  return {
    materialization_reason: 'approved start scene',
    region_id: 'region_novgorod_land',
    place_id: 'place_market',
    location_id: 'location_market',
    minilocation_id: 'mini_stall',
    anchor_id: 'anchor_stall',
    minilocations: [{ temp_id: 'mini_stall' }],
    scene_anchors: [{ temp_id: 'anchor_stall' }],
    primary_anchor_temp_id: 'anchor_stall',
    required_categories_covered: ['entry'],
    visible_scene_logic: { visible_anchor_ids: ['anchor_stall'] },
    hidden_scene_logic: { hidden_anchor_ids: [] },
    template_limits_used: { template_id: 'tpl_market' }
  };
}

function g5Audit() {
  return {
    status: 'passed',
    blocking_issues: [],
    warnings: [],
    repair_targets: [],
    commit_allowed: true,
    visibility_leak_check: { pass: true },
    fk_plan_check: { pass: true },
    template_compliance_check: { pass: true }
  };
}

function validWritePlan() {
  return {
    version: 1,
    schema: 'party_db_write_plan',
    request_id: 'req_partial',
    plan_status: 'formed',
    transaction: {
      transaction_id: 'tx_001',
      party_id: 'party_001',
      idempotency_key: 'idem_001',
      is_atomic: true,
      is_dry_run_first: true,
      rollback_strategy: 'full_transaction_rollback',
      write_order: ['batch_party_state', 'batch_mark_party_ready']
    },
    preconditions: [
      {
        precondition_id: 'precond_all_audits',
        check_type: 'audit_passed',
        expected: true,
        on_fail: { action: 'block_transaction', error_code: 'WRITE_PLAN_PRECONDITION_FAILED' }
      }
    ],
    write_batches: [
      {
        batch_id: 'batch_party_state',
        order: 1,
        target_table: 'party_state',
        operation_mode: 'insert_only',
        depends_on_batches: [],
        records: [{
          party_id: 'party_001',
          save_slot: 'slot_001',
          status: 'initializing',
          start_year: 1237,
          current_year: 1237,
          current_day_index: 0,
          current_minute_of_day: 225,
          world_base_region_id: 'region_novgorod_land',
          player_character_id: 'pc_001',
          is_ready_for_player: false,
          current_phase: 'opening_commit'
        }],
        on_error: { action: 'rollback_transaction', error_code: 'WRITE_BATCH_FAILED' }
      },
      {
        batch_id: 'batch_mark_party_ready',
        order: 2,
        target_table: 'party_state',
        operation_mode: 'update_only',
        depends_on_batches: ['batch_party_state'],
        records: [{
          party_id: 'party_001',
          status: 'ready',
          is_ready_for_player: true,
          current_phase: 'awaiting_player_input',
          opening_scene_presented: false
        }],
        on_error: { action: 'rollback_transaction', error_code: 'WRITE_BATCH_FAILED' }
      }
    ],
    postconditions: [
      { postcondition_id: 'postcond_ready', check_type: 'party_ready_flag', expected: true }
    ],
    forbidden_writes: [
      { target: 'world_base.*', reason: 'party initialization cannot mutate canonical base' }
    ],
    rollback_plan: {
      strategy: 'full_transaction_rollback',
      rollback_order: ['reverse_write_order'],
      preserve_diagnostics: true
    },
    source_trace: [
      { record_table: 'party_state', record_id: 'party_001', source_schema: 'party_db_write_plan' }
    ],
    self_audit: {
      pass: true,
      concerns: [],
      evidence: ['fixture write plan is valid']
    }
  };
}

function normalizedRequestFixture(requestId, playerText) {
  const randomFields = [
    'era_request', 'year_request', 'season_request', 'time_of_day_request',
    'region_request', 'tone_request', 'difficulty_request'
  ];
  const output = {
    version: 1,
    schema: 'new_game_normalized_request',
    request_id: requestId,
    language: 'ru',
    start_mode: 'new_party',
    player_intent_summary: `Игрок: ${playerText}`,
    start_place_request: {
      value: null,
      selection_mode: 'random',
      source: 'missing',
      confidence: 'high',
      notes: 'Select from allowed start candidates after region is resolved.'
    },
    character_request: {
      occupation_text: playerText.includes('купц') ? 'купец' : null,
      selection_mode: playerText.includes('купц') ? 'constrained_random' : 'random',
      source: playerText.includes('купц') ? 'player_text' : 'missing',
      confidence: playerText.includes('купц') ? 'medium' : 'high',
      notes: 'Generate character after world_base context is loaded.'
    },
    hard_constraints: [],
    soft_preferences: [],
    forbidden_content: [],
    requires_clarification: false,
    clarification_questions: [],
    adaptation_flags: {
      requires_historical_adaptation: false,
      modern_terms_present: false,
      fantasy_or_impossible_terms_present: false,
      too_powerful_or_elite: false,
      requires_social_downgrade: false,
      requires_item_rights_check: false,
      requires_weapon_rights_check: false
    },
    invalid_or_unsafe_literals: [],
    audit: { pass: true, concerns: [], evidence: ['test fixture'] }
  };

  if (playerText.includes('торгов')) {
    output.start_place_request = {
      value: 'торговый двор',
      selection_mode: 'constrained_random',
      source: 'player_text',
      confidence: 'medium',
      notes: 'Resolve against allowed start candidates.'
    };
  }

  for (const field of randomFields) {
    output[field] = {
      value: null,
      selection_mode: 'random',
      source: 'missing',
      confidence: 'high',
      notes: `Resolve ${field} from available candidates.`
    };
  }

  output.unknowns_to_resolve = [
    ...randomFields.map((field) => ({
      field,
      resolution_stage: 'historical_frame_selector',
      policy: 'choose_from_available_candidates'
    })),
    {
      field: 'start_place_request',
      resolution_stage: 'start_candidate_retriever',
      policy: 'choose_from_allowed_start_nodes'
    },
    {
      field: 'character_request',
      resolution_stage: 'player_character_generator',
      policy: 'choose_from_allowed_social_roles_and_occupations'
    }
  ];
  return output;
}

function partyPublicState() {
  return {
    version: 1,
    schema: 'party_public_state',
    public_position_label: 'у торгового ряда',
    public_time_label: 'глубокая ночь',
    public_light_label: 'темно, видимость ограничена',
    public_weather_label: 'холодно',
    public_character_label: 'Ты',
    public_body_state_summary: [],
    public_inventory_summary: [],
    public_warning_badges: ['видимость ограничена'],
    public_visible_npcs: [{ label: 'сонный сторож' }],
    public_visible_items: [],
    public_visible_containers: [{ label: 'корзина с товаром' }],
    public_visible_exits: [{ label: 'проход к воротам' }],
    public_attention_targets: [{ label: 'можно прислушаться к рынку' }],
    public_context_hints: [{ label: 'ночью шум быстро привлекает внимание' }],
    public_visible_map: {
      known_current_node: { label: 'торговый ряд', certainty: 'known_current' },
      known_nearby_nodes: [],
      unknown_exits: [{ label: 'проход к воротам', certainty: 'visible_but_unknown' }]
    }
  };
}

function passAudit(schema) {
  return {
    version: 1,
    schema,
    pass: true,
    concerns: [],
    evidence: ['fixture audit passed']
  };
}
