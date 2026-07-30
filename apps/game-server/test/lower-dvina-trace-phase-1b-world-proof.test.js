import test from 'node:test';
import assert from 'node:assert/strict';
import {
  loadLowerDvinaTracePhase1BPublication
} from '../src/internal/lower-dvina-trace-phase-1b-publication.js';
import {
  loadLowerDvinaTraceMaterializationBundle,
  resolveLowerDvinaTraceStartTimestamp
} from '../src/internal/lower-dvina-trace-phase-1a.js';
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
