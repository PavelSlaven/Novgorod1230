import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createTurnAvailableActionSet,
  createTurnCommandRegistry
} from '../src/index.js';

test('semantic-bound registry permits an empty registered action set', async () => {
  const unavailable = () => ({ status: 'blocked', can_attempt: false,
    check_requests: [] });
  const definition = (semantic_binding = undefined) => ({
    command_id: 'world-process-command', option_id: 'world_process',
    matches: () => false, semantic_binding, availability: unavailable,
    consequence() {}, writeTargets() {}
  });
  const semanticRegistry = createTurnCommandRegistry([definition({
    binding_id: 'world-process', operation: 'request_world_process',
    matches: () => true
  })]);
  const actionSet = await createTurnAvailableActionSet({ registry: semanticRegistry,
    committedState: { state_version: 3 }, actorId: 'mikula', policyPins: [] });
  assert.deepEqual(actionSet.options, []);

  const closedRegistry = createTurnCommandRegistry([definition()]);
  await assert.rejects(() => createTurnAvailableActionSet({ registry: closedRegistry,
    committedState: { state_version: 3 }, actorId: 'mikula', policyPins: [] }),
  { code: 'TURN_AVAILABLE_ACTION_SET_EMPTY' });
});
