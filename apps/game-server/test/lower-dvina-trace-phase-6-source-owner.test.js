import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createTracePhase6CarryCommand,
  tracePhase6PreconditionSatisfied
} from '../src/runtime/lower-dvina-trace-phase-6-carry.js';
import { lowerDvinaTraceTemporalSourceRegistrations } from
  '../src/runtime/lower-dvina-trace-phase-6-temporal-source.js';
import { lowerDvinaTracePhase6TemporalEffectRegistrations } from
  '../src/runtime/lower-dvina-trace-phase-6-temporal-effect-owner.js';
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

test('Phase 6 progress adds fractional slices as a reduced exact rational', () => {
  const [progress] = lowerDvinaTracePhase6TemporalEffectRegistrations();
  const at = (numerator, denominator = '1') => ({
    whole_minutes: '100',
    subminute_numerator: numerator,
    subminute_denominator: denominator
  });
  const first = progress.resolve({
    slice: { slice_id: 'phase6-a', from_timestamp: at('0'),
      to_timestamp: at('1', '3') },
    context: { projection: {
      cumulative_elapsed_minutes: { numerator: '0', denominator: '1' }
    } }
  });
  const second = progress.resolve({
    slice: { slice_id: 'phase6-b', from_timestamp: at('1', '3'),
      to_timestamp: at('1', '2') },
    context: { projection: first.state_projection }
  });

  assert.deepEqual(first.state_projection.cumulative_elapsed_minutes,
    { numerator: '1', denominator: '3' });
  assert.deepEqual(second.state_projection.cumulative_elapsed_minutes,
    { numerator: '1', denominator: '2' });
});
