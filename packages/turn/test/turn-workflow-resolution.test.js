import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createTurnAvailableActionSet,
  createTurnCommandRegistry,
  resolveTurnSemanticIntent,
  runTurnWorkflow
} from '../src/index.js';
import { createServices, input } from './turn-workflow-fixture.js';

test('available action set is committed-state-driven, complete, sorted and raw-text independent', async () => {
  const seen = [];
  const pin = {
    id: 'approved.inspect',
    version: 1,
    digest: 'a'.repeat(64)
  };
  const definition = (optionId, matches, visible = true) => ({
    command_id: `command:${optionId}`,
    option_id: optionId,
    label: optionId,
    approved_record: pin,
    matches,
    mode: {
      selected_primary_mode: 'attention',
      resolution_plan: {
        state_blocks_to_load: ['party_state'],
        subsystems: [],
        checks_to_run: [],
        expected_writes: []
      }
    },
    availability(context) {
      seen.push(context);
      return {
        version: 1,
        schema: 'turn_availability_decision',
        status: visible ? 'available' : 'blocked',
        can_attempt: visible,
        reasons: [],
        check_requests: []
      };
    },
    consequence() {},
    writeTargets() { return []; }
  });
  const registry = createTurnCommandRegistry([
    definition('z-option', () => false),
    definition('a-option', () => false),
    definition('hidden-option', () => true, false)
  ]);
  const state = {
    party_state: { state_version: 7 },
    visible_context: { scene: 'shore' },
    relevant_hidden_state: { culprit: 'must-not-be-projected' }
  };
  const left = await createTurnAvailableActionSet({
    registry,
    committedState: state,
    actorId: 'actor-1',
    policyPins: [pin]
  });
  const right = await createTurnAvailableActionSet({
    registry,
    committedState: state,
    actorId: 'actor-1',
    policyPins: [pin]
  });
  assert.deepEqual(left.options.map(({ option_id }) => option_id), [
    'a-option',
    'z-option'
  ]);
  assert.equal(left.options_digest, right.options_digest);
  assert.equal(JSON.stringify(left).includes('culprit'), false);
  assert.equal(seen.every((entry) => !('raw_text' in entry)), true);
  assert.equal(seen[0], seen[1]);
  assert.throws(() => { seen[0].committed_state.party_state.state_version = 8; },
    TypeError);
});

test('zero regex matches invokes bounded semantic resolver and preserves the approved option_id', async () => {
  const pin = {
    id: 'approved.inspect',
    version: 1,
    digest: 'b'.repeat(64)
  };
  const registry = createTurnCommandRegistry([{
    command_id: 'inspect-command',
    option_id: 'inspect_wreck_in_detail',
    label: 'Осмотреть крушение',
    approved_record: pin,
    matches: () => false,
    mode: {},
    availability: () => ({
      status: 'available',
      can_attempt: true,
      check_requests: []
    }),
    consequence() {},
    writeTargets() {}
  }]);
  const set = await createTurnAvailableActionSet({
    registry,
    committedState: { state_version: 3 },
    actorId: 'mikula',
    policyPins: [pin]
  });
  let semanticInput;
  const resolved = await resolveTurnSemanticIntent({
    rawText: 'Хочу внимательно изучить повреждения судна.',
    actionSet: set,
    semanticResolver: async (input) => {
      semanticInput = input;
      return { option_id: input.action_set[0].option_id };
    },
    stateVersion: 3,
    policyVersion: '1',
    requestId: 'semantic-1',
    partyId: 'party-1',
    decisionSecret: 'semantic-secret',
    issuedAt: '2026-07-12T10:00:00.000Z',
    expiresAt: '2026-07-12T10:05:00.000Z',
    decisionNow: () => '2026-07-12T10:01:00.000Z'
  });
  assert.equal(resolved.option_id, 'inspect_wreck_in_detail');
  assert.equal(semanticInput.action_set.length, 1);
  assert.equal(JSON.stringify(semanticInput).includes('culprit'), false);
  assert.equal(
    semanticInput.action_set_digest,
    set.options_digest
  );
  assert.equal('bounded_decision_request' in semanticInput, false);
  assert.equal('command_token' in semanticInput.action_set[0], false);
});

test('exact command remains ahead of an opted-in semantic step model', async () => {
  let plannerCalls = 0;
  const { services } = createServices([], {
    command: {
      matches: () => true,
      semantic_binding: {
        binding_id: 'inspect-place',
        operation: 'request_discovery',
        matches: () => true
      }
    },
    playerSafeStateProjector: async () => {
      throw new Error('projector must not run');
    },
    turnStepModel: async () => {
      plannerCalls += 1;
      throw new Error('planner must not run');
    }
  });
  const result = await runTurnWorkflow(input(), services);
  assert.equal(result.status, 'resolved');
  assert.equal(plannerCalls, 0);
});

test('semantic decision expiry uses resolved time while exact fast path does not', async () => {
  const definition = (matches) => ({
    command_id: 'inspect-command',
    option_id: 'inspect_wreck_in_detail',
    matches,
    mode: {},
    availability: () => ({
      status: 'available',
      can_attempt: true,
      check_requests: []
    }),
    consequence() {},
    writeTargets() {}
  });
  const semanticRegistry = createTurnCommandRegistry([
    definition(() => false)
  ]);
  const semanticSet = await createTurnAvailableActionSet({
    registry: semanticRegistry,
    committedState: { state_version: 3 },
    actorId: 'mikula',
    policyPins: []
  });
  await assert.rejects(
    () => resolveTurnSemanticIntent({
      rawText: 'Хочу внимательно осмотреть крушение.',
      actionSet: semanticSet,
      semanticResolver: async (request) => ({
        option_id: request.action_set[0].option_id
      }),
      stateVersion: 3,
      policyVersion: '1',
      requestId: 'semantic-expired',
      partyId: 'party-1',
      decisionSecret: 'semantic-secret',
      issuedAt: '2026-07-12T10:00:00.000Z',
      expiresAt: '2026-07-12T10:05:00.000Z',
      decisionNow: () => '2026-07-12T10:06:00.000Z'
    }),
    { code: 'TURN_SEMANTIC_DECISION_EXPIRED' }
  );

  const exactRegistry = createTurnCommandRegistry([
    definition(() => true)
  ]);
  const exactSet = await createTurnAvailableActionSet({
    registry: exactRegistry,
    committedState: { state_version: 3 },
    actorId: 'mikula',
    policyPins: []
  });
  const exact = await resolveTurnSemanticIntent({
    rawText: 'Осмотреть крушение.',
    actionSet: exactSet,
    semanticResolver: async () => {
      throw new Error('exact fast path must not invoke resolver');
    },
    stateVersion: 3,
    policyVersion: '1',
    requestId: 'semantic-exact',
    partyId: 'party-1',
    decisionSecret: 'semantic-secret',
    issuedAt: '2026-07-12T10:00:00.000Z',
    expiresAt: '2026-07-12T10:05:00.000Z',
    decisionNow: () => {
      throw new Error('exact fast path must not read decision clock');
    }
  });
  assert.equal(exact.option_id, 'inspect_wreck_in_detail');
});

test('semantic resolution rejects invented, stale, tampered and overpowered results', async () => {
  const registry = createTurnCommandRegistry([{
    command_id: 'inspect-command',
    option_id: 'inspect_wreck_in_detail',
    matches: () => false,
    mode: {},
    availability: () => ({
      status: 'available',
      can_attempt: true,
      check_requests: []
    }),
    consequence() {},
    writeTargets() {}
  }]);
  const build = () => createTurnAvailableActionSet({
    registry,
    committedState: { state_version: 2 },
    actorId: 'mikula',
    policyPins: []
  });
  const args = (actionSet, semanticResolver, overrides = {}) => ({
    rawText: 'свободная формулировка',
    actionSet,
    semanticResolver,
    stateVersion: 2,
    policyVersion: '1',
    requestId: 'semantic-invalid',
    partyId: 'party-1',
    decisionSecret: 'semantic-secret',
    issuedAt: '2026-07-12T10:00:00.000Z',
    expiresAt: '2026-07-12T10:05:00.000Z',
    decisionNow: () => '2026-07-12T10:01:00.000Z',
    ...overrides
  });
  const inventedSet = await build();
  await assert.rejects(
    () => resolveTurnSemanticIntent(args(inventedSet, async () => ({
      option_id: 'invented'
    }))),
    { code: 'TURN_SEMANTIC_OPTION_INVALID' }
  );
  const staleSet = await build();
  await assert.rejects(
    () => resolveTurnSemanticIntent(args(staleSet, async () => ({
      status: 'unknown'
    }), { stateVersion: 3 })),
    { code: 'TURN_SEMANTIC_STATE_STALE' }
  );
  const excessiveSet = await build();
  await assert.rejects(
    () => resolveTurnSemanticIntent(args(excessiveSet, async () => ({
      option_id: 'inspect_wreck_in_detail',
      consequence: { elapsed: 15 }
    }))),
    { code: 'TURN_SEMANTIC_RESULT_INVALID' }
  );
  const tamperedSet = await build();
  assert.throws(
    () => {
      tamperedSet.options[0].reason_visible_to_actor = 'tampered';
    },
    TypeError,
    'the digest-bound action set is deeply immutable'
  );
});

test('semantic resolution fails closed when an offered precondition cannot be revalidated', async () => {
  const registry = createTurnCommandRegistry([{
    command_id: 'inspect-command',
    option_id: 'inspect_wreck_in_detail',
    matches: () => false,
    mode: {},
    preconditions: [{ kind: 'committed_location', location_ref: 'shore' }],
    availability: () => ({
      status: 'available',
      can_attempt: true,
      check_requests: []
    }),
    consequence() {},
    writeTargets() {}
  }]);
  const set = await createTurnAvailableActionSet({
    registry,
    committedState: { state_version: 2, position: { location_ref: 'shore' } },
    actorId: 'mikula',
    policyPins: []
  });
  const invoke = (evaluatePrecondition) => resolveTurnSemanticIntent({
    rawText: 'осмотреть место',
    actionSet: set,
    semanticResolver: async (input) => {
      return { option_id: input.action_set[0].option_id };
    },
    stateVersion: 2,
    policyVersion: '1',
    requestId: 'semantic-precondition',
    partyId: 'party-1',
    decisionSecret: 'semantic-secret',
    issuedAt: '2026-07-12T10:00:00.000Z',
    expiresAt: '2026-07-12T10:05:00.000Z',
    decisionNow: () => '2026-07-12T10:01:00.000Z',
    evaluatePrecondition
  });
  await assert.rejects(() => invoke(undefined), {
    code: 'TURN_SEMANTIC_OPTION_INVALID'
  });
  await assert.rejects(() => invoke(() => false), {
    code: 'TURN_SEMANTIC_OPTION_INVALID'
  });
  assert.equal((await invoke((precondition, state) =>
    state.position.location_ref === precondition.location_ref)).option_id,
  'inspect_wreck_in_detail');
});
