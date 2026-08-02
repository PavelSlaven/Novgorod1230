import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadLowerDvinaTracePhase1BPublication
} from '../src/internal/lower-dvina-trace-phase-1b-publication.js';
import {
  loadLowerDvinaTraceMaterializationBundle,
  resolveLowerDvinaTraceStartTimestamp
} from '../src/internal/lower-dvina-trace-phase-1a.js';
import { loadLowerDvinaTraceRevision12Bundle } from
  '../src/internal/lower-dvina-trace-phase-6-bundle.js';
import {
  MATERIALIZER_VERSION,
  RNG_VERSION
} from '@rus/materialization';
import {
  materializeLowerDvinaTracePartyInstance
} from '@rus/materialization/internal/lower-dvina-trace-phase-1a';
import {
  lowerDvinaTracePhase1ADomainPin
} from '../../../test/fixtures/lower-dvina-trace-phase-1a-domain-pin.mjs';

test('direct Phase 1A materializer rejects a fabricated descendant world proof', async () => {
  const [publication, bundle] = await Promise.all([
    loadLowerDvinaTracePhase1BPublication(),
    loadLowerDvinaTraceMaterializationBundle()
  ]);
  const world = publication.binding.world_compatibility;
  const base = {
    party_id: 'trace-phase-1b-world-proof',
    scenario_id: 'lower_dvina_trace_v1',
    scenario_definition_revision: 7,
    scenario_manifest_digest: bundle.manifest_digest,
    world_revision_id: world.production_world_revision_id,
    world_catalog_digest: world.production_world_catalog_digest,
    world_compatibility: structuredClone(world),
    domain_catalog_pin: {
      ...lowerDvinaTracePhase1ADomainPin(bundle),
      compatible_world_revision_id: world.production_world_revision_id,
      compatible_world_catalog_digest: world.production_world_catalog_digest
    },
    materializer_version: MATERIALIZER_VERSION,
    rng_algorithm_id: RNG_VERSION,
    seed_context: 'lower_dvina_trace_phase_1a_mikula_v1',
    idempotency_key: 'trace-phase-1b-world-proof',
    trigger: 'new_game',
    occurrence: 0,
    existing_party_state: { baseline_exists: false },
    scenario_bundle: bundle,
    resolve_timestamp: resolveLowerDvinaTraceStartTimestamp
  };
  assert.doesNotThrow(() =>
    materializeLowerDvinaTracePartyInstance(base));
  const fabricated = {
    ...base,
    world_compatibility: structuredClone(base.world_compatibility)
  };
  fabricated.world_compatibility.lineage = [{
    path: 'invented/unapproved-manifest.json',
    world_revision_id: base.world_revision_id,
    parent_revision_id:
      fabricated.world_compatibility.source_world_revision_id,
    world_catalog_digest: base.world_catalog_digest,
    status: 'approved',
    digest: 'f'.repeat(64)
  }];
  assert.throws(
    () => materializeLowerDvinaTracePartyInstance(fabricated),
    { code: 'TRACE_WORLD_PIN_INCOMPATIBLE' }
  );
});

test('revision 12 fails closed when the v8 reused binding ref is tampered', async (t) => {
  const root = await copyRevision12BundleClosure();
  t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root,
    'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-1a-v8',
    'materialization-bindings.json');
  const bindings = JSON.parse(await readFile(path, 'utf8'));
  bindings.reused_immutable_binding_ref.digest = '0'.repeat(64);
  await writeFile(path, `${JSON.stringify(bindings, null, 2)}\n`);

  await assert.rejects(() => loadLowerDvinaTraceRevision12Bundle({
    rootDir: root,
    historicalBundle: revision11BundleStub(),
    fail: (code) => { throw Object.assign(new Error(code), { code }); },
    freezeDeep: (value) => value,
    validateDefinitionPins() {}
  }), { code: 'TRACE_PHASE_6_CONTENT_INVALID' });
});

async function copyRevision12BundleClosure() {
  const root = await mkdtemp(join(tmpdir(), 'trace-phase-6-bundle-'));
  for (const relative of [
    'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-6-content',
    'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-1a-v8',
    'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-1a-v7/materialization-bindings.json',
    'data/world-catalogs/common/inventory-archetypes.json'
  ]) {
    await cp(relative, join(root, relative), { recursive: true });
  }
  return root;
}

function revision11BundleStub() {
  return {
    artifact_pins: {
      definition: { digest: '65ea080f3ba0897b47fd9ac6ed4ce92b7831ba3cc04de965bcbe7f956d2f7cd9' },
      phase_1a_manifest: { digest: '5cc5a06136b2f4cbdb8b842558b0d749a2c70c3eff0f1c088aca9a7e0395d1a9' },
      materialization_bindings: { digest: '8d6af94cd5f89577bf55211b1262b81266c7d2646f09e7807475f8c6f1d86565' }
    }
  };
}
