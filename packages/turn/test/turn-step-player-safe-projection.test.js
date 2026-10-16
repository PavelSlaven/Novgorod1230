import assert from 'node:assert/strict';
import test from 'node:test';
import { projectAvailableDomainOperations } from
  '../src/turn-step-player-safe-projection.js';

test('code-owned projected operations join semantic bindings outside player-safe state', () => {
  const dynamic = { op: 'request_movement', actor_ref: 'actor:player',
    target_ref: 'local:shelter', movement_kind: 'local' };
  const projected = projectAvailableDomainOperations({ state: {
    actor_id: 'actor:player', available_domain_operations: [dynamic]
  }, operations: [], semanticBindings: [] });
  assert.deepEqual(projected.available_domain_operations, [dynamic]);
  assert.equal(projected.player_safe_state.available_domain_operations,
    undefined);
});
