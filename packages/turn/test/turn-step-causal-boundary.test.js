import assert from 'node:assert/strict';
import test from 'node:test';
import { createTurnStepDomainOwnerPreflight } from '../src/turn-step-admission.js';
import { createTurnStepExecutionRegistry, runTurnStepLoop } from '../src/turn-step-loop.js';
import { basePlan, input, ports, result } from './turn-step-loop-fixture.js';

test('authored investigation cannot leave the whole intent as a material prerequisite', () => {
  let audits = 0;
  const operation = { op: 'request_discovery', actor_ref: 'actor-1',
    discovery_kind: 'inspect', target_refs: ['shed'], query: 'Осмотреть зарубки.' };
  const validate = createTurnStepDomainOwnerPreflight({ externalRegistry: null,
    semanticBindings: [{ command: { option_id: 'inspect' }, binding: {
      operation: 'request_discovery', operation_dto: operation,
      matches: () => true } }], availableOptions: new Set(['inspect']), actor: {},
    committedState: {}, services: {
      turnStepSemanticGroundingValidator: () => { audits += 1; return true; }
    }, isDomainStepOperation: () => true });
  for (const intent of ['Ищу раненых под лодкой.', 'Проверяю, сухо ли под навесом.']) {
    const request = { remaining_intent: intent, player_safe_state: {},
      available_domain_operations: [operation] };
    assert.throws(() => validate({ request, plan: { operations: [operation],
      continuation: { remaining_intent: intent, depends_on_refs: [] } } }),
    (error) => error.code === 'TURN_STEP_PLAN_INVALID'
      && error.details.errors[0].code === 'continuation_progress');
  }
  assert.equal(audits, 0);
  assert.doesNotThrow(() => validate({ request: {
    remaining_intent: 'Осмотреть зарубки, затем проверить навес.',
    player_safe_state: {}, available_domain_operations: [operation] }, plan: {
    operations: [operation], continuation: {
      remaining_intent: 'затем проверить навес.', depends_on_refs: [] } } }));
  assert.equal(audits, 1);
});

test('ordinary material prerequisite keeps the complete later handling', () => {
  const validate = createTurnStepDomainOwnerPreflight({ externalRegistry: null,
    semanticBindings: [], availableOptions: new Set(), actor: {}, committedState: {},
    services: { turnStepOrdinaryDiscoveryResolver: () => {},
      turnStepSemanticGroundingValidator: ({ resolved_domain_operations: owners }) => {
        assert.equal(owners[0].owner_kind, 'ordinary_discovery');
      } }, isDomainStepOperation: () => true,
    isOrdinaryDiscoveryInScope: () => true });
  assert.doesNotThrow(() => validate({ request: {
    remaining_intent: 'Свить верёвку из волокон.', player_safe_state: {
      position: { location_ref: 'shed' }, ordinary_resolution: {
        discovery_available: true, container_resolution_available: false,
        scene_seed_available: false } } }, plan: {
    operations: [{ op: 'request_discovery', discovery_kind: 'inspect',
      target_refs: ['shed'], query: 'волокна' }],
    continuation: { remaining_intent: 'Свить верёвку из волокон.',
      depends_on_refs: [] } } }));
});

test('ownerless speech executes before discovery and keeps its lawful response boundary', async () => {
  const requests = [];
  const utterance = { speaker_ref: 'actor-1', utterance_text: 'Эй, отзовитесь!',
    input_mode: 'verbatim', delivery: { loudness: 4,
      duration_class: 'instant' } };
  const outcome = await runTurnStepLoop(input({ rootPlayerAction:
    'Кричу: «Эй, отзовитесь!» Осматриваю настил, затем иду дальше.' }), ports({
    executionRegistry: createTurnStepExecutionRegistry({
      applySemanticActivity: async ({ working_projection }) =>
        result(working_projection, 'короткая речь'), domain: {
      request_discovery: async ({ working_projection }) => result(working_projection,
        'настил осмотрен', { player_response_boundary: true })
    } }),
    turnStepModel: async (request) => {
      requests.push(request);
      if (request.step_index === 1) return basePlan(request, {
        activity: { owner: 'semantic', duration_class: 'moment', effort: 'none' },
        direct_result_kind: 'player_utterance', utterance, goal_result: 'pending',
        continuation: { remaining_intent: 'Осматриваю настил, затем иду дальше.',
          depends_on_refs: [] }
      });
      return basePlan(request, { resolution: 'domain_request', goal_result: 'pending',
        activity: { owner: 'domain', duration_class: null, effort: null },
        operations: [{ op: 'request_discovery', actor_ref: 'actor-1',
          discovery_kind: 'inspect', target_refs: ['stone-1'], query: 'Осматриваю настил' }],
        continuation: { remaining_intent: 'затем иду дальше.', depends_on_refs: [] }
      });
    }
  }));
  assert.equal(requests.length, 2);
  assert.equal(outcome.step_traces[0].applied, true);
  assert.deepEqual(outcome.step_traces[0].approved_plan.utterance, utterance);
  assert.equal(outcome.stop_reason, 'player_response');
  assert.equal(outcome.remaining_intent, 'затем иду дальше.');
  assert.deepEqual(outcome.write_fragments, []);
  assert.deepEqual(outcome.check_results, []);
});
