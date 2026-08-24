import assert from 'node:assert/strict';
import test from 'node:test';
import { projectLowerDvinaTraceS1Capability } from
  '../src/runtime/releases/lower-dvina-trace-s1-production.js';

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
