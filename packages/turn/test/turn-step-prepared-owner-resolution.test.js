import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveTurnStepDomainOwner } from '../src/turn-step-domain-owner-resolution.js';

test('prepared chain resolves only the binding that offered the exact operation', () => {
  const operation = {
    op: 'emit_interaction',
    interaction_kind: 'request',
    target_actor_refs: ['npc:eremey', 'npc:fisher']
  };
  const owner = resolveTurnStepDomainOwner({
    operation,
    plan: {},
    request: { available_domain_operations: [operation] },
    actor: {},
    playerSafeState: {},
    committedState: {},
    externalRegistry: { domain: () => null },
    semanticBindings: [{
      command: { option_id: 'broad-phase-3' },
      binding: {
        operation: operation.op,
        operation_dto: { ...operation, target_actor_refs: ['npc:eremey'] },
        matches: () => true
      }
    }, {
      command: { option_id: 'exact-prepared-followup' },
      binding: {
        operation: operation.op,
        operation_dto: operation,
        matches: () => true
      }
    }],
    availableOptions: new Set(),
    preparedChainContext: { prior_effect_count: 1 },
    services: {},
    isOrdinaryDiscoveryInScope: () => false,
    isSpatialSemanticRemainderInScope: () => false,
    isBackgroundNpcSemanticRemainderInScope: () => false,
    isActionProductionOwnerInScope: () => false
  });
  assert.equal(owner.kind, 'binding');
  assert.equal(owner.command.option_id, 'exact-prepared-followup');
  assert.deepEqual(owner.bound_operation, operation);
});
