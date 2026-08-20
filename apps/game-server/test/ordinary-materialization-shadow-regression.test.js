import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { runTurnStepLoop } from '@rus/turn';
import { createLowerDvinaTraceTurnStepRuntimePorts } from '../src/runtime/lower-dvina-trace-turn-step-runtime-ports.js';
import { createLowerDvinaTracePlayerSafeWorkingProjectionAuthority } from '../src/runtime/lower-dvina-trace-player-safe-working.js';

const profiles = JSON.parse(await readFile(new URL('../../../data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-m1-content/turn-step-owner-profiles.json', import.meta.url)));

test('production composition keeps direct ordinary results and discovery shadow-only', async () => {
  const ports = createLowerDvinaTraceTurnStepRuntimePorts({
    ordinaryResultPolicy: profiles.ordinary_result_policy,
    workingProjectionAuthority: createLowerDvinaTracePlayerSafeWorkingProjectionAuthority()
  });
  const create = ports.executionRegistry.direct({ op: 'create_entity' });
  const direct = await create(execution(operation()));
  assert.equal(direct.write_fragments[0].value.payload.template_id, undefined);
  assert.equal(direct.write_fragments[0].value.payload.runtime_instance_mechanics_snapshot.provenance.source_kind, 'ordinary_direct_action_result');

  assert.equal(ports.executionRegistry.domain({ op: 'request_discovery' }), null);
  let plannerCalls = 0;
  await assert.rejects(() => runTurnStepLoop(loopInput(), {
    executionRegistry: ports.executionRegistry,
    turnStepModel: async (request) => {
      plannerCalls += 1;
      assert.equal(JSON.stringify(request).includes('ordinary_materialization'), false);
      return domainPlan(request);
    },
    projectPlayerSafeState: async ({ working_projection: value }) => value,
    revalidateCommittedState: async () => true
  }), { code: 'TURN_STEP_DOMAIN_HANDLER_MISSING' });
  assert.equal(plannerCalls, 1);

  for (const [semantic_type, name] of [['weapon', 'боевой меч'], ['currency', 'серебряная монета'], ['letter', 'чужое письмо'], ['clue', 'скрытая улика']]) {
    await assert.rejects(async () => create(execution({ ...operation(), temp_ref: `forbidden_${semantic_type}`, semantic_type, name, facts: [] })), { code: 'ITEM_ORDINARY_RESULT_POLICY_DATA_GAP' });
  }
});

function operation() { return { op: 'create_entity', temp_ref: 'sand', semantic_type: 'material_portion', name: 'горсть мокрого песка', origin: { kind: 'ambient_ordinary', source_refs: ['shore'] }, facts: [], mechanics: { mass_grams: 300, external_hand_cost: 1, carry_form: 'compact', packing_slot_cost: 1, quantity: { value: 1, unit: 'handful' }, container: null }, placement: { relation: 'held_by', target_ref: 'mikula' } }; }
function projection() { return { actor_id: 'mikula', position: { location_ref: 'shore' }, destination_refs: [], inventory: { items: [], total_weight: { grams: 0 }, load_category: 'light', occupied_hands: 0 }, items: [], knowledge: [{ fact_id: 'shore', text: 'доступный речной берег' }] }; }
function execution(value) { return { plan: {}, request: { root_turn_id: 'turn:shadow:1', step_index: 1, actor: actor() }, operation: value, working_projection: projection(), check_result: null }; }
function actor() { return { actor_id: 'mikula', attributes: { strength: { value: 9 } }, skills: {} }; }
function loopInput() { return { requestId: 'shadow', rootTurnId: 'turn:shadow:1', committedStateVersion: 1, rootPlayerAction: 'найти предмет', actor: actor(), initialWorkingProjection: projection(), maxInternalSteps: 8 }; }
function domainPlan(request) { return { schema: 'turn_step_plan_v1', request_id: request.request_id, committed_state_version: request.committed_state_version, working_revision: request.working_revision, step_index: request.step_index, interpretation: { player_goal: request.root_player_action, grounded_attempt: request.remaining_intent, adaptation: 'literal' }, resolution: 'domain_request', goal_result: 'pending', activity: { owner: 'domain', duration_class: null, effort: null }, operations: [{ op: 'request_discovery', actor_ref: 'mikula', discovery_kind: 'search', target_refs: ['shore'], query: 'найти заранее не существующий предмет' }], check: null, continuation: { remaining_intent: 'ожидать результата поиска', depends_on_refs: ['shore'] }, clarification: null, reason_code: 'shadow_discovery', reason: 'Existing discovery route only.' }; }
