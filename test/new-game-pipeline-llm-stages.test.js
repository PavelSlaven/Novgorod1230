import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createNewGamePipelineContext,
  NEW_GAME_LLM_STAGE_IDS,
  runStage2NormalizeRequest,
  runStage3HistoricalFrame,
  runStage9StartNodeSelection,
  runStage16ItemPlacement,
  runStage21VisibleContextAudit
} from '../src/world/new-game-pipeline/index.js';
import {
  buildMinimalCandidateSet,
  buildStage3FixtureOutput
} from './fixtures/new-game-pipeline-stage3.js';

test('LLM stage adapter list excludes G5 stages 13-14', () => {
  assert.deepEqual(NEW_GAME_LLM_STAGE_IDS, [2, 3, 9, 10, 11, 12, 15, 16, 18, 19, 20, 21, 22, 23]);
});

test('stages 2-3 accept mocked JSON executor and commit outputs', async () => {
  const candidateSet = buildMinimalCandidateSet('req_llm');
  const context = createNewGamePipelineContext({
    requestId: 'req_llm',
    startText: 'Хочу быть купцом',
    playerName: 'Онфим',
    historicalFrameCandidateSet: candidateSet
  });
  const executor = async ({ stage }) => JSON.stringify(
    stage.id === 2 ? normalizedRequest() : buildStage3FixtureOutput('req_llm')
  );

  await runStage2NormalizeRequest(context, { executor });
  await runStage3HistoricalFrame(context, { executor });

  assert.equal(context.requireStageOutput(2).schema, 'new_game_normalized_request');
  assert.equal(context.requireStageOutput(3).region.region_id, 'region_novgorod_land');
  assert.equal(context.getGateResult(3).pass, true);
});

test('stage 9 rejects start node IDs outside candidate sets', async () => {
  const context = createNewGamePipelineContext({ requestId: 'req_stage_9' });
  const input = {
    start_candidate_set: { candidates: [{ candidate_id: 'candidate_ok' }] },
    candidate_place_template_set: { candidate_template_links: [{ candidate_place_template_link_id: 'link_ok' }] }
  };

  await assert.rejects(
    runStage9StartNodeSelection(context, {
      input,
      executor: async () => ({
        version: 1,
        schema: 'selected_start_node',
        selected_candidate_id: 'candidate_missing',
        selected_candidate_place_template_link_id: 'link_ok'
      })
    }),
    /selected_candidate_id/u
  );
  assert.equal(context.getGateResult(9).pass, false);
});

test('stage 16 requires embedded item placement audit', async () => {
  const context = createNewGamePipelineContext({ requestId: 'req_stage_16' });
  context.setStageOutput(15, { schema: 'initial_npc_placement_draft' });
  context.freezeArtifact({
    artifact_id: 'npc:req_stage_16',
    stage_id: 15,
    schema: 'initial_npc_placement_draft',
    version: 1,
    hash: 'npc',
    frozen_paths: ['root.visible_npcs[0].npc_id'],
    produced_by: 'npc_placement',
    validation_status: 'passed',
    audit_status: 'passed',
    dependency_status: 'passed',
    artifact: { visible_npcs: [{ npc_id: 'npc_001', anchor_id: 'anchor_001' }] }
  });

  await runStage16ItemPlacement(context, {
    input: {},
    executor: async () => ({
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
      initial_item_placement_audit: {
        version: 1,
        schema: 'initial_item_placement_audit',
        pass: true,
        concerns: [],
        evidence: ['all item placements come from item_profile_candidate_set']
      }
    })
  });

  assert.equal(context.getGateResult(16).pass, true);
});

test('audit stages block failed pass-like audits', async () => {
  const context = createNewGamePipelineContext({ requestId: 'req_stage_21' });
  context.setStageOutput(20, { schema: 'visible_context_package' });

  await assert.rejects(
    runStage21VisibleContextAudit(context, {
      input: {},
      executor: async () => ({
        version: 1,
        schema: 'visible_context_audit',
        pass: false,
        checks: {},
        concerns: [{ code: 'LEAK', severity: 'hard_block' }],
        evidence: ['hidden fact leaked'],
        repair_route: { return_to_stage: 'visible_context_semantic_repair' }
      })
    }),
    /Audit stage did not approve output/u
  );
  assert.equal(context.getGateResult(21).pass, false);
});

function normalizedRequest() {
  return normalizedRequestFixture('req_llm', 'Хочу быть купцом');
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

function historicalFrame() {
  return buildStage3FixtureOutput('req_llm');
}
