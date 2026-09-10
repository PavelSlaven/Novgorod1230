import assert from 'node:assert/strict';
import test from 'node:test';
import { projectLowerDvinaTraceS1Capability } from
  '../src/runtime/releases/lower-dvina-trace-s1-production.js';
import { npcRoutineCandidate } from '../src/runtime/npc-routine-temporal.js';

test('live future NPC routine candidates preserve the S1 capability without shared refs', () => {
  const candidates = ['npc-one', 'npc-two'].map((npc_id) => npcRoutineCandidate({
    npc_id, party_id: 'party', state_version: 1, causal_state_ref: { routine_state: {
      status: 'active', phase_index: 0, profile: { phases: [{ state_id: 'work' }] },
      phase_started_at: { whole_minutes: '10', subminute_numerator: '0', subminute_denominator: '1' },
      next_transition_at: { whole_minutes: '130', subminute_numerator: '0', subminute_denominator: '1' }
    } }
  }));
  assert.notStrictEqual(candidates[0].policy_ref, candidates[0].visibility_policy_ref);
  assert.notStrictEqual(candidates[0].rule_ref, candidates[1].rule_ref);
  const projected = projectLowerDvinaTraceS1Capability({
    playerSafeState: {}, resolverAvailable: true, committedState: {
      position: { position_id: 'camp' }, temporal_boundary_candidates: candidates,
      spatial_semantic: [{ envelope_ref: 'envelope', status: 'committed',
        envelope: { position_ref: 'camp' }, capacity_total: 1, consumed_count: 0,
        resolutions: [] }]
    }
  });
  assert.deepEqual(projected.spatial_semantic, {
    semantic_grounding_available: true, position_ref: 'camp'
  });
});

test('S1 player-safe projection rejects hostile committed snapshots without reads',
  async () => {
    const base = { visible_objects: [{ entity_ref: 'visible' }] };
    let reads = 0;
    const getter = {};
    Object.defineProperty(getter, 'spatial_semantic', { enumerable: true,
      get() { reads += 1; return []; } });
    const withSymbol = { position: null, [Symbol('hidden')]: true };
    const custom = Object.create(null); custom.position = null;
    const cycle = {}; cycle.self = cycle;
    const shared = {}; const alias = { first: shared, second: shared };
    for (const committedState of [getter, withSymbol, custom, cycle, alias]) {
      const projected = projectLowerDvinaTraceS1Capability({
        playerSafeState: base, committedState,
        resolverAvailable: true });
      assert.deepEqual(projected, base);
      assert.equal(projected.spatial_semantic, undefined);
    }
    assert.equal(reads, 0);
  });
