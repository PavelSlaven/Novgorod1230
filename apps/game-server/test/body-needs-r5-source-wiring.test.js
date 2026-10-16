import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { loadTargetBodyNeedsProfile } from '../src/internal/target-runtime-profiles.js';
import { createBodyNeedsTemporalAdapter } from '../src/runtime/body-needs-temporal.js';

const worldRevisionId = 'novgorod_spatial_v3_target_contract_approval_001';
const source = async (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('body-needs adapter exposes the exact loaded approved profile', async () => {
  const trustedBodyNeedsProfile = await loadTargetBodyNeedsProfile({ worldRevisionId });
  const adapter = createBodyNeedsTemporalAdapter({
    body_needs_profile: trustedBodyNeedsProfile
  });
  assert.equal(adapter.trustedBodyNeedsProfile, trustedBodyNeedsProfile);
});

test('runtime repositories and factual-context readers pass explicit profile alongside pin', async () => {
  const [runtime, binding, composition, phase1b, factual, phase2, normalized] =
    await Promise.all([
      source('../src/runtime/releases/spatial-v3-production-trace-runtime.js'),
      source('../src/runtime/releases/spatial-v3-production-binding-shared.js'),
      source('../src/composition/production-spatial-v3.js'),
      source('../src/infrastructure/postgres/lower-dvina-trace-phase-1b.js'),
      source('../src/infrastructure/postgres/target-current-factual-context.js'),
      source('../src/infrastructure/postgres/lower-dvina-trace-phase-2.js'),
      source('../src/infrastructure/postgres/lower-dvina-trace-turn-step-read.js')
    ]);
  assert.match(runtime, /trustedBodyNeedsProfile:\s*bodyTimeEffectAdapter\?\.trustedBodyNeedsProfile/u);
  assert.match(binding, /trustedBodyNeedsProfile:\s*targetRuntimeProfiles\?\.body_needs_profile/u);
  assert.match(composition, /trustedBodyNeedsProfile:\s*targetProfiles\?\.body_needs_profile/u);
  assert.match(phase1b, /trustedBodyNeedsBindingPin,\s*trustedBodyNeedsProfile/u);
  assert.match(factual, /trustedBodyNeedsBindingPin,\s*trustedBodyNeedsProfile/u);
  assert.match(phase2, /trustedBodyNeedsBindingPin,\s*trustedBodyNeedsProfile/u);
  assert.match(normalized, /trustedBodyNeedsBindingPin,\s*trustedBodyNeedsProfile/u);
});

test('continuous history and readback reject missing trusted profile context', async () => {
  const [history, readback] = await Promise.all([
    source('../src/infrastructure/postgres/lower-dvina-trace-turn-step-body-history.js'),
    source('../src/infrastructure/postgres/lower-dvina-trace-turn-step-body-read.js')
  ]);
  assert.match(history, /trusted_body_profile_missing/u);
  assert.match(readback, /trusted_body_profile_missing/u);
});
