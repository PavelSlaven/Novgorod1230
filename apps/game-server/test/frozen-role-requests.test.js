import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  createLowerDvinaTraceNpcSemanticModel,
  createLowerDvinaTraceNarrationService,
  createLowerDvinaTracePlayerConversationModel,
  createLowerDvinaTraceTurnStepModel
} from '../src/runtime/lower-dvina-trace-phase-2-llm.js';
import { requestTurnStepPlan } from '@rus/turn';
import { createLowerDvinaTraceNpcAutonomousModel } from
  '../src/runtime/lower-dvina-trace-autonomous-llm.js';
import { createLowerDvinaTraceNpcCombatModel } from
  '../src/runtime/lower-dvina-trace-combat-llm.js';
import { createLowerDvinaTraceWorldProcessStepModel } from
  '../src/runtime/lower-dvina-trace-world-process-llm.js';
import { buildOrdinaryMaterializationMessages } from
  '../src/runtime/ordinary-materialization-llm.js';

const frozenRoleRequestsUrl = new URL('../../../data/model-evals/llm-runtime/'
  + 'frozen-role-requests-v1.json', import.meta.url);

const models = {
  world_process_step: createLowerDvinaTraceWorldProcessStepModel,
  turn_step_planner: createLowerDvinaTraceTurnStepModel,
  turn_step_planner_repair: createLowerDvinaTraceTurnStepModel,
  npc_combat_decider: createLowerDvinaTraceNpcCombatModel,
  npc_combat_decider_format_repair: createLowerDvinaTraceNpcCombatModel,
  npc_autonomous_decider: createLowerDvinaTraceNpcAutonomousModel,
  npc_autonomous_decider_format_repair: createLowerDvinaTraceNpcAutonomousModel,
  player_conversation_interpreter: createLowerDvinaTracePlayerConversationModel,
  player_conversation_interpreter_format_repair:
    createLowerDvinaTracePlayerConversationModel,
  npc_conversation_responder: createLowerDvinaTraceNpcSemanticModel,
  npc_conversation_responder_format_repair: createLowerDvinaTraceNpcSemanticModel
};

test('frozen role fixtures ship exact production-built messages', async () => {
  const corpus = JSON.parse(await readFile(frozenRoleRequestsUrl, 'utf8'));
  for (const fixture of corpus.fixtures.filter(({ role_id }) =>
    role_id in models || role_id === 'ordinary_materialization' || role_id.startsWith('gameplay_narrator'))) {
    assert.deepEqual(await productionMessages(fixture), fixture.messages,
      fixture.id);
  }
});

test('frozen narration auditor prompts retain both validator-valid forms', async () => {
  const corpus = JSON.parse(await readFile(frozenRoleRequestsUrl, 'utf8'));
  for (const fixture of corpus.fixtures.filter(({ role_id }) =>
    role_id === 'gameplay_narrator_auditor')) {
    const prompt = fixture.messages[0].content;
    assert.equal(prompt.includes('"pass":true|false,"concerns":[],"evidence":[]'), false);
    assert.equal(prompt.includes('{"version":1,"schema":"narration_audit","pass":true,"concerns":[],"evidence":["visible facts only"]}'), true);
    assert.equal(prompt.includes('{"version":1,"schema":"narration_audit","pass":false,"concerns":[{"segment_id":"<supplied segment_id>","kind":"unsupported_fact","reason":"<brief reason>"}],"evidence":["<brief visible-context evidence>"]}'), true);
  }
});

test('Stage A frozen fixtures leave descriptor semantic while retaining code-owned assertions', async () => {
  const corpus = JSON.parse(await readFile(frozenRoleRequestsUrl, 'utf8'));
  for (const fixture of corpus.fixtures.filter(({ id }) =>
    id === 'ordinary-stage-a-seed-shore' || id === 'ordinary-stage-a-repair-seed-shore')) {
    assert.deepEqual(fixture.expected.required_refs, ['basis', 'property', 'disclosure']);
    assert.deepEqual(fixture.expected.required_values, {
      resolution: 'seeded', density_band_proposal: 'ordinary',
      'background_groups.0.functional_bucket': 'other_ordinary'
    });
  }
});

test('unowned domain intent uses one direct planner step', async () => {
  const request = {
    schema: 'turn_step_request_v1', request_id: 'unowned-domain-probe',
    root_turn_id: 'turn:probe', committed_state_version: 1,
    working_revision: 0, step_index: 1, max_internal_steps: 8,
    root_player_action: 'unowned-domain-probe',
    remaining_intent: 'unowned-domain-probe', completed_steps: [],
    actor: { actor_ref: 'actor:probe' }, player_safe_state: {}
  };
  let calls = 0;
  const model = createLowerDvinaTraceTurnStepModel({ roleRunner: {
    async run(call) {
      calls += 1;
      assert.match(call.messages[0].content,
        /domain_request only when player_safe_state contains the exact/u);
      return { output: {
        schema: 'turn_step_plan_v1', request_id: request.request_id,
        committed_state_version: 1, working_revision: 0, step_index: 1,
        interpretation: { player_goal: request.root_player_action,
          grounded_attempt: request.remaining_intent, adaptation: 'literal' },
        resolution: 'direct', goal_result: 'achieved',
        activity: { owner: 'semantic', duration_class: 'moment', effort: 'none' },
        operations: [], check: null, continuation: null, clarification: null,
        reason_code: 'unowned_domain_capability', reason: 'No owner.'
      } };
    }
  } });
  const plan = await requestTurnStepPlan({ request, turnStepModel: model });
  assert.equal(plan.resolution, 'direct');
  assert.deepEqual(plan.operations, []);
  assert.equal(calls, 1);
});

async function productionMessages(fixture) {
  if (fixture.role_id.startsWith('gameplay_narrator')) return narrationMessages(fixture);
  if (fixture.role_id === 'ordinary_materialization') {
    const request = fixture.repair
      ? fixture.request.request
      : JSON.parse(fixture.messages.at(-1).content);
    return buildOrdinaryMaterializationMessages(request, { repair: fixture.repair
      ? { schema: 'ordinary_materialization_repair_context_v1',
        original_output: fixture.request.original_output,
        validation_errors: fixture.request.validation_errors }
      : null });
  }
  let call;
  const model = models[fixture.role_id]({ roleRunner: { async run(next) {
    call = next;
    return { output: {} };
  } } });
  const payload = JSON.parse(fixture.messages.at(-1).content);
  if (!fixture.repair) await model(payload);
  else if (fixture.role_id === 'turn_step_planner_repair') await model(
    payload.request, { structural_errors: payload.structural_errors });
  else await model(payload.request, { repair: {
    original_output: payload.original_output,
    validation_errors: payload.validation_errors
  } });
  return call.messages;
}

async function narrationMessages(fixture) {
  const target = fixture.role_id;
  const payload = JSON.parse(fixture.messages.at(-1).content);
  const request = target === 'gameplay_narrator_format_repair' ? payload.request : {
    version: 1, schema: 'narration_request', request_id: payload.output?.output_id ?? 'narration-eval-1',
    surface: 'turn', visible_context: payload.visible_context ?? payload.request?.visible_context,
    style_policy: payload.style_policy ?? payload.request?.style_policy ?? {},
    ...(payload.context == null ? {} : { context: payload.context })
  };
  const draft = target === 'gameplay_narrator_auditor' ? payload.output : {
    version: 1, schema: 'narration_output', output_id: request.request_id,
    prose: 'Сначала видны ворота. Телега скрипит у ворот. Потом всё тихо.',
    action_options: [], used_references: [], self_check: {}
  };
  let call, auditCalls = 0;
  const narration = createLowerDvinaTraceNarrationService({ roleRunner: { async run(next) {
    if (next.role_id === target) call = next;
    if (next.role_id === 'gameplay_narrator') {
      return { output: target === 'gameplay_narrator_format_repair' ? payload.invalid_output
        : target === 'gameplay_narrator_auditor' || target === 'gameplay_narrator_semantic_repair'
          ? draft : fixture.expected_output };
    }
    if (next.role_id === 'gameplay_narrator_format_repair') return { output: fixture.expected_output };
    if (next.role_id === 'gameplay_narrator_semantic_repair') return { output: fixture.expected_output };
    auditCalls += 1;
    return { output: target === 'gameplay_narrator_auditor' ? fixture.expected_output
      : target === 'gameplay_narrator_semantic_repair' && auditCalls === 1
        ? { version: 1, schema: 'narration_audit', pass: false,
        concerns: payload.concerns, evidence: ['Unsupported sound.'] }
        : { version: 1, schema: 'narration_audit', pass: true, concerns: [], evidence: ['Grounded.'] } };
  } } });
  await narration.run(request);
  if (!call) throw new Error(`narration role was not called: ${target}`);
  return call.messages;
}
