import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createTracePhase6CarryCommand,
  tracePhase6PreconditionSatisfied
} from '../src/runtime/lower-dvina-trace-phase-6-carry.js';
import { lowerDvinaTraceTemporalSourceRegistrations } from
  '../src/runtime/lower-dvina-trace-phase-6-temporal-source.js';
import { boundary, contracts, createPhase6TestTemporalOwner, state } from
  './lower-dvina-trace-phase-6-fixtures.js';

test('Phase 6 invokes a source owner only during factual consequence', () => {
  const committed = state();
  committed.temporal_boundary_candidates.push(boundary('source', 105));
  let calls = 0;
  const temporalAdvanceOwner = createPhase6TestTemporalOwner({
    state: committed,
    resolve(_candidate, { projection }) {
      calls += 1;
      return { disposition: 'execute', proposals: [],
        state_projection: projection, follow_up_candidates: [] };
    }
  });
  const command = createTracePhase6CarryCommand({ contracts,
    inputDigest: 'source-owner-once',
    temporalAdvanceOwner });

  assert.equal(tracePhase6PreconditionSatisfied(
    { kind: 'phase6_exact_carry_state' }, committed, contracts
  ), true);
  assert.equal(command.availability({ committed_state: committed }).can_attempt,
    true);
  assert.equal(command.availability({ retrievedState: committed }).can_attempt,
    true);
  assert.equal(calls, 0);

  const consequence = command.consequence({ retrievedState: committed,
    playerInput: { idempotency_key: 'turn-key' } });
  assert.equal(consequence.status, 'resolved');
  assert.equal(calls, 1);
});

test('production temporal source registration rejects an unpersisted NPC projection', () => {
  const committed = state();
  const candidate = boundary('source', 105);
  const [registration] = lowerDvinaTraceTemporalSourceRegistrations([{
    rule_ref: candidate.rule_ref,
    policy_ref: candidate.policy_ref,
    resolve(_candidate, { projection }) {
      const next = structuredClone(projection);
      next.phase6_state.npcs.find((npc) =>
        npc.instance_id === 'background_fisher_2'
      ).anchor_id = 'another-anchor';
      return { disposition: 'execute', proposals: [],
        state_projection: next, follow_up_candidates: [] };
    }
  }]);

  assert.throws(() => registration.resolve(candidate, {
    projection: { phase6_state: committed }
  }), (error) =>
    error.code === 'TRACE_PHASE_6_TEMPORAL_SOURCE_PROJECTION_WRITE_GAP');
});
