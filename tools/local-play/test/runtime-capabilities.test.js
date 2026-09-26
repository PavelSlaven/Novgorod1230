import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LOCAL_PLAY_RUNTIME_CAPABILITIES_V1,
  PROCEDURAL_FINAL_PACK_REBUILD_REQUIRED,
  requireLocalPlayRuntimeCapability
} from '../runtime-capabilities.js';

test('local play exposes M2 and keeps M3 procedural equipment as a typed gap', () => {
  assert.equal(Object.isFrozen(LOCAL_PLAY_RUNTIME_CAPABILITIES_V1), true);
  assert.equal(Object.isFrozen(LOCAL_PLAY_RUNTIME_CAPABILITIES_V1.capabilities),
    true);
  assert.deepEqual(requireLocalPlayRuntimeCapability('m2_runtime'), {
    status: 'available'
  });
  assert.throws(() => requireLocalPlayRuntimeCapability(
    'm3_procedural_equipment'), {
    code: PROCEDURAL_FINAL_PACK_REBUILD_REQUIRED
  });
});

test('capability guard rejects unknown and unversioned contracts', () => {
  assert.throws(() => requireLocalPlayRuntimeCapability('missing'), {
    code: 'LOCAL_PLAY_CAPABILITY_UNKNOWN'
  });
  assert.throws(() => requireLocalPlayRuntimeCapability('m2_runtime', {}), {
    code: 'LOCAL_PLAY_CAPABILITY_CONTRACT_INVALID'
  });
});
