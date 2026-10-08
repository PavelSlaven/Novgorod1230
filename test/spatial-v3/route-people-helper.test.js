import assert from 'node:assert/strict';
import test from 'node:test';
import { createTraceExpansionCommands } from '../../apps/game-server/src/runtime/lower-dvina-trace-expansion-commands.js';
import { packageBase } from '../../apps/game-server/src/runtime/lower-dvina-trace-phase-3-command-shared.js';
import { pickMovementChoice } from './presence-rules-production-e2e-fixture.js';

test('route people fixture selects a canonical line by binding ref despite a same-label exit', () => {
  const label = 'Путь к воде';
  const exit = { op: 'request_movement', actor_ref: 'actor', target_ref: 'exit:water',
    movement_kind: 'route', route_ref: 'exit:water', description: label };
  const line = { op: 'request_movement', actor_ref: 'actor', target_ref: 'binding:water',
    movement_kind: 'route', route_ref: 'binding:water', description: label };
  const choice = pickMovementChoice({ root_player_action: label,
    available_domain_operations: [exit, line] }, new Map(), {
    exactMovement: true, expectedRouteRef: 'binding:water' });
  assert.deepEqual(choice.operation, line);
});

test('route-people follow-up selects generated exit owner after the named line and preserves legacy action traversal', async () => {
  const label = 'Путь к воде';
  const current = { party_id: 'party', actor_id: 'actor', party_state: { state_version: 1 },
    position: { position_id: 'position:source' } };
  const selectedOwners = [];
  const commands = await createTraceExpansionCommands({ state: current, requestId: 'route-people:turn',
    inputDigest: 'a'.repeat(64), spatialLocalSceneRuntime: { listLocalOptions: async () => [] },
    spatialExpansionRuntime: {
      async listExpansionOptions() { return [{ directional_exit_id: 'exit:generated', display_label: label }]; },
      async listApproachOptions() { return []; },
      async listConnectionOptions() { return [{ connection_binding_id: 'binding:water', display_label: label }]; },
      async listConnectionApproachOptions() { return []; },
      async prepareConnection() { selectedOwners.push('line-prepare');
        return { ok: true, connection_id: 'canonical:water', source_position_id: 'position:source' }; },
      async prepareConnectionTraversal() { selectedOwners.push('line-traversal');
        return packageBase({ inputDigest: 'a'.repeat(64), duration: 5, kind: 'movement' }); },
      async prepareExpansion() { selectedOwners.push('exit-prepare');
        return { ok: true, connection_id: 'generated:connection', source_position_id: 'position:source' }; },
      async prepareTraversal(input) {
        selectedOwners.push('exit-prepareTraversal');
        return packageBase({ inputDigest: 'b'.repeat(64), duration: 0, kind: 'movement',
          movement: { status: 'completed', cost_kind: 'action', action_units: 1 } });
      }
    } });

  const byOperation = (operation) => {
    const matches = commands.filter((command) => command.semantic_binding.matches({ operation }));
    assert.equal(matches.length, 1);
    return matches[0];
  };
  const lineChoice = pickMovementChoice({ root_player_action: label,
    available_domain_operations: commands.map((command) => command.semantic_binding.operation_dto) },
  new Map(), { exactMovement: true, expectedRouteRef: 'binding:water' });
  await byOperation(lineChoice.operation).consequence({ retrievedState: current,
    playerInput: { idempotency_key: 'route-people:line' } });

  const followUpChoice = pickMovementChoice({ root_player_action: 'Иду по видимому пути.',
    available_domain_operations: commands.map((command) => command.semantic_binding.operation_dto) }, new Map());
  assert.equal(followUpChoice.operation.target_ref, 'exit:generated');
  const followUp = await byOperation(followUpChoice.operation).consequence({ retrievedState: current,
    playerInput: { idempotency_key: 'route-people:generated' } });
  assert.equal(followUp.movement.cost_kind, 'action');
  assert.equal(followUp.duration_minutes, 0);
  assert.deepEqual(selectedOwners, ['line-prepare', 'line-traversal', 'exit-prepare', 'exit-prepareTraversal']);
});
