import assert from 'node:assert/strict';
import test from 'node:test';
import { createLowerDvinaTraceTurnStepRuntimePorts } from
  '../src/runtime/lower-dvina-trace-turn-step-runtime-ports.js';
import { createLowerDvinaTracePlayerSafeWorkingProjectionAuthority } from
  '../src/runtime/lower-dvina-trace-player-safe-working.js';

test('installed O2b resolver rejects committed-state accessors before runtime initialization', () => {
  let reads = 0;
  const state = {};
  Object.defineProperty(state, 'items', { enumerable: true,
    get() { reads += 1; return []; } });
  assert.throws(() => createLowerDvinaTraceTurnStepRuntimePorts({
    committedState: state, ordinaryContainerContentsResolver: async () => ({}),
    workingProjectionAuthority: createLowerDvinaTracePlayerSafeWorkingProjectionAuthority()
  }), { code: 'TRACE_TURN_STEP_CONTAINER_ORDINARY_CONTEXT_INVALID' });
  assert.equal(reads, 0);
});

test('installed O2b resolver never reads a raw Phase 9 materialization trace accessor', () => {
  let reads = 0;
  const state = { actor_id: 'actor', items: [] };
  Object.defineProperty(state, 'materialization_trace', { enumerable: true,
    get() { reads += 1; return []; } });
  assert.throws(() => createLowerDvinaTraceTurnStepRuntimePorts({
    committedState: state, ordinaryContainerContentsResolver: async () => ({}),
    workingProjectionAuthority: createLowerDvinaTracePlayerSafeWorkingProjectionAuthority()
  }), { code: 'TRACE_TURN_STEP_CONTAINER_ORDINARY_CONTEXT_INVALID' });
  assert.equal(reads, 0);
});

test('installed O2b resolver does not gate a restarted non-container inspection', async () => {
  const sharedRestartValue = { status: 'committed' };
  const legacyValue = Object.assign(Object.create({ historical: true }), {
    optional: undefined
  });
  const inspectResult = { pass: true, route: 'non_container_inspection' };
  const ports = createLowerDvinaTraceTurnStepRuntimePorts({
    committedState: {
      actor_id: 'actor',
      items: [],
      materialization_trace: {
        seed_context: { scenario_definition_revision: 20 }
      },
      restart_metadata: {
        first: sharedRestartValue,
        second: sharedRestartValue,
        legacy: legacyValue
      }
    },
    ordinaryContainerContentsResolver: async () => ({}),
    ordinaryDiscoveryResolver: async () => inspectResult,
    workingProjectionAuthority:
      createLowerDvinaTracePlayerSafeWorkingProjectionAuthority()
  });

  assert.deepEqual(await ports.ordinaryDiscoveryResolver({
    discovery_kind: 'inspect'
  }), inspectResult);
});

test('revision 21 Phase 9 keeps authored container access ahead of O2b', () => {
  const ports = createLowerDvinaTraceTurnStepRuntimePorts({
    committedState: {
      actor_id: 'actor', items: [], phase9: { status: 'bag_recovered' },
      materialization_trace: {
        seed_context: { scenario_definition_revision: 21 }
      }
    },
    ordinaryContainerContentsResolver: async () => {
      throw new Error('authored Phase 9 must keep priority');
    },
    workingProjectionAuthority:
      createLowerDvinaTracePlayerSafeWorkingProjectionAuthority()
  });

  assert.equal(ports.executionRegistry.domain({
    op: 'request_container_access'
  }), null);
});

test('installed O2b resolver rejects a hostile committed container context pre-model', () => {
  let reads = 0;
  let resolverCalls = 0;
  const ordinaryContentsContext = {};
  Object.defineProperty(ordinaryContentsContext, 'container_ref', {
    enumerable: true,
    get() { reads += 1; return 'pouch'; }
  });
  assert.throws(() => createLowerDvinaTraceTurnStepRuntimePorts({
    committedState: {
      actor_id: 'actor',
      items: [{
        item_id: 'pouch',
        template_id: 'pouch-template',
        mechanics_profile_ref: 'pouch-mechanics',
        ordinary_contents_context: ordinaryContentsContext
      }]
    },
    ordinaryContainerContentsResolver: async () => {
      resolverCalls += 1;
      return {};
    },
    workingProjectionAuthority:
      createLowerDvinaTracePlayerSafeWorkingProjectionAuthority()
  }), { code: 'TRACE_TURN_STEP_CONTAINER_ORDINARY_CONTEXT_INVALID' });
  assert.equal(reads, 0);
  assert.equal(resolverCalls, 0);
});

test('legacy composition does not pre-snapshot committed state for a dormant O2b port', () => {
  let reads = 0;
  const state = {};
  Object.defineProperty(state, 'items', { enumerable: true,
    get() { reads += 1; return []; } });
  assert.doesNotThrow(() => createLowerDvinaTraceTurnStepRuntimePorts({
    committedState: state,
    workingProjectionAuthority: createLowerDvinaTracePlayerSafeWorkingProjectionAuthority()
  }));
  assert.equal(reads > 0, true);
});
