import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  createLowerDvinaTraceNpcSemanticModel,
  createLowerDvinaTracePlayerConversationModel,
  createLowerDvinaTraceTurnStepModel
} from '../src/runtime/lower-dvina-trace-phase-2-llm.js';
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
    role_id in models || role_id === 'ordinary_materialization')) {
    assert.deepEqual(await productionMessages(fixture), fixture.messages,
      fixture.id);
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

async function productionMessages(fixture) {
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
