import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createNewGamePipelineContext,
  isG5RuntimeEnabled,
  runG5MaterializationAdapter,
  runNewGameG5Stages13To14,
  runStage14G5Audit,
  validateRequiredContractFields
} from '../src/world/new-game-pipeline/index.js';

const VALID_G5_DRAFT = {
  materialization_reason: 'approved LLM materialization inside selected G4',
  minilocations: [{ temp_id: 'mini_1' }],
  scene_anchors: [{ temp_id: 'anchor_1' }],
  primary_anchor_temp_id: 'anchor_1',
  required_categories_covered: ['entry'],
  visible_scene_logic: { visible_anchor_ids: ['anchor_1'] },
  hidden_scene_logic: { hidden_anchor_ids: [] },
  template_limits_used: { template_id: 'tpl_yard' }
};

const VALID_G5_AUDIT = {
  status: 'passed',
  blocking_issues: [],
  warnings: [],
  repair_targets: [],
  commit_allowed: true,
  visibility_leak_check: { pass: true },
  fk_plan_check: { pass: true },
  template_compliance_check: { pass: true }
};

test('g5 runtime stays opt-in', async () => {
  assert.equal(isG5RuntimeEnabled({ env: {} }), false);
  assert.equal(isG5RuntimeEnabled({ env: { NEW_GAME_G5_RUNTIME: 'true' } }), true);

  await assert.rejects(
    runG5MaterializationAdapter({}, { materialize: async () => VALID_G5_DRAFT, env: {} }),
    /G5 runtime is opt-in only/u
  );
});

test('g5 contract validation blocks missing required fields', () => {
  assert.throws(
    () => validateRequiredContractFields({ title: 'Fixture', required: ['scene_anchors'] }, {}),
    /scene_anchors/u
  );
});

test('g5 stages 13-14 call adapters and store outputs', async () => {
  const calls = [];
  const context = createNewGamePipelineContext({ requestId: 'req_g5', env: {} });

  const result = await runNewGameG5Stages13To14(context, {
    historicalFrame: { schema: 'historical_frame' },
    selectedStartNode: { schema: 'selected_start_node' },
    startPlaceAudit: { pass: true },
    playerCharacter: { schema: 'player_character_game_profile' },
    playerCharacterAudit: { pass: true },
    allowedG5TemplateSet: { allowed_g5_templates: [{ template_id: 'tpl_yard' }] },
    npcCandidateSet: { npc_candidates: [] },
    itemProfileCandidateSet: { item_profile_candidates: [] }
  }, {
    enableG5Runtime: true,
    materialize: async ({ input, tool, contract, step_id }) => {
      calls.push({ step_id, tool_id: tool.id, contract: contract.title, request_id: input.request_id });
      return VALID_G5_DRAFT;
    },
    audit: async ({ input, tool, contract, step_id }) => {
      calls.push({
        step_id,
        tool_id: tool.id,
        contract: contract.title,
        draft_anchor: input.g5_scene_graph_draft.primary_anchor_temp_id
      });
      return VALID_G5_AUDIT;
    }
  });

  assert.equal(result.g5_scene_graph_draft.schema, 'g5_scene_graph_draft');
  assert.equal(result.g5_scene_audit.pass, true);
  assert.equal(context.getGateResult(13).pass, true);
  assert.equal(context.getGateResult(14).pass, true);
  assert.deepEqual(calls.map((call) => call.contract), ['G5SceneGraphDraft', 'G5AuditReport']);
  assert.equal(calls[0].tool_id, 'start_g5_materialization_v1');
  assert.equal(calls[0].request_id, 'req_g5');
});

test('g5 stage 14 blocks audit without commit approval', async () => {
  const context = createNewGamePipelineContext({ requestId: 'req_g5_blocked', env: {} });

  await assert.rejects(
    runStage14G5Audit(context, { g5_scene_graph_draft: VALID_G5_DRAFT }, {
      enableG5Runtime: true,
      audit: async () => ({ ...VALID_G5_AUDIT, commit_allowed: false })
    }),
    /G5 audit did not allow commit/u
  );
  assert.equal(context.getGateResult(14).pass, false);
});
