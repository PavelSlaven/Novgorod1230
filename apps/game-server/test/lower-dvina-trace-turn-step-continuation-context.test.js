import assert from 'node:assert/strict';
import test from 'node:test';
import { fixture, loadScenarioBundle } from './lower-dvina-trace-phase-2-fixture.js';

test('bound semantic command keeps its unexecuted remainder through committed narration and replay', async () => {
  const bundle = await loadScenarioBundle(13);
  const remaining = 'После осмотра перейти к ивняку и поискать сухое место.';
  const f = fixture({ scenarioBundle: bundle, materializationBundle: bundle,
    rollValue: 0, turnStepModel(request) {
      const operation = request.available_domain_operations.find(op =>
        op.op === 'request_discovery' && op.discovery_kind === 'inspect');
      return { schema: 'turn_step_plan_v1', request_id: request.request_id,
        committed_state_version: request.committed_state_version,
        working_revision: request.working_revision, step_index: request.step_index,
        interpretation: { player_goal: request.root_player_action,
          grounded_attempt: 'осмотреть место крушения', adaptation: 'literal' },
        resolution: 'domain_request', goal_result: 'pending',
        activity: { owner: 'domain', duration_class: null, effort: null },
        operations: [structuredClone(operation)], check: null,
        continuation: { remaining_intent: remaining, depends_on_refs: [] },
        clarification: null, direct_result_kind: null, reason_code: 'inspect', reason: 'Осмотр перед дальнейшими действиями.' };
    } });
  const request = { request_id: 'continuation-context', idempotency_key: 'continuation-context',
    raw_text: `Осмотреть место крушения. ${remaining}` };
  const submit = () => f.runtime.submitTurn({ partyId: f.partyId, input: request });
  const result = await submit();
  assert.equal(f.lastWritePlan().command_trace.remaining_intent, remaining);
  const narrated = f.narratorInput().visible_context;
  assert.ok(narrated.uncertainties.some(value => value.includes(remaining)));
  assert.ok(narrated.visible_changes.length > 0);
  const count = f.turnStepCount();
  assert.deepEqual(await submit(), result);
  assert.equal(f.turnStepCount(), count);
});
