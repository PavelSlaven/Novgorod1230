import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildProceduralFinalCandidateImportLedger } from
  '../src/procedural-v6-import.js';
import { buildProceduralFinalDevelopmentActivation } from
  '../src/procedural-final-development-activation.js';
import { buildPartyCatalogPinRecord } from
  '../../../packages/new-game/src/stages/stage-24-party-db-write-plan/code/runtime-catalog-pins.js';
import { loadActiveRuntimeCatalogPin } from
  '../../../apps/game-server/src/infrastructure/postgres/runtime-catalog-pin-loader.js';

const pack = JSON.parse(await readFile(new URL(
  '../../../data/world-catalogs/novgorod/procedural-scene-v2/'
    + 'final-candidate-pack-v1/candidate.json', import.meta.url), 'utf8'));
const baseline = { request: { parent_revision_id: 'baseline',
  parent_catalog_digest: '1'.repeat(64),
  parent_snapshot_manifest_digest: '2'.repeat(64) },
compatibilityManifest: pack.compatibility_manifest };

test('development activation binds audited/imported identities and preserves old pin',
  async () => {
    const ledger = buildProceduralFinalCandidateImportLedger({ baseline, pack });
    const oldPin = { schema: 'rus.runtime_catalog_pin.v2',
      catalog_scope: 'item_container_materialization_v2',
      catalog_revision_id: 'old-revision', catalog_digest: '3'.repeat(64),
      import_id: 'old-import', import_audit_digest: '4'.repeat(64),
      record_registry_digest: '5'.repeat(64),
      runtime_contract_digest: '6'.repeat(64),
      compatible_world_revision_id: pack.compatible_world_tuple
        .compatible_world_revision_id,
      compatible_world_catalog_digest: pack.compatible_world_tuple
        .compatible_world_catalog_digest,
      compatible_world_pin_manifest_digest: '7'.repeat(64),
      activation_event_id: 'old-event' };
    const bundle = await buildProceduralFinalDevelopmentActivation({
      worldPool: { async query() { return { rows: [{ event_id: 'old-event' }] }; } },
      partyPool: { async query() { return { rows: [{ party_count: 1,
        pinned_party_count: 1, missing_domain_pin_count: 0,
        inflight_count: 0 }] }; } },
      pack, ledger, gitCommitSha: '8'.repeat(40),
      authorizationRef: 'bounded development cutover task'
    });
    assert.equal(bundle.activation_scope, 'new_development_parties_only');
    assert.equal(bundle.attestation.audited_candidate_digest,
      pack.independent_attestation.candidate_digest);
    assert.equal(bundle.attestation
      .independent_import_approval_attestation_digest,
    pack.independent_attestation.attestation_digest);
    assert.equal(bundle.attestation.import_audit_digest,
      ledger.root.import_audit_digest);
    assert.equal(bundle.attestation.production_deploy_authorized, false);
    assert.equal(bundle.attestation.existing_party_migration_authorized, false);
    const oldRecord = buildPartyCatalogPinRecord('old-party', oldPin);
    const newPin = { ...oldPin,
      catalog_revision_id: pack.target_revision_id,
      catalog_digest: pack.target_catalog_digest,
      import_id: ledger.root.import_id,
      import_audit_digest: ledger.root.import_audit_digest,
      activation_event_id: 'new-event' };
    const newRecord = buildPartyCatalogPinRecord('new-party', newPin);
    assert.equal(oldRecord.catalog_revision_id, 'old-revision');
    assert.equal(newRecord.catalog_revision_id, pack.target_revision_id);
  });

test('development activation rejects an unpinned existing party', async () => {
  const ledger = buildProceduralFinalCandidateImportLedger({ baseline, pack });
  await assert.rejects(() => buildProceduralFinalDevelopmentActivation({
    worldPool: { async query() { return { rows: [] }; } },
    partyPool: { async query() { return { rows: [{ party_count: 1,
      pinned_party_count: 0, missing_domain_pin_count: 1,
      inflight_count: 0 }] }; } },
    pack, ledger, gitCommitSha: '8'.repeat(40), authorizationRef: 'test'
  }), { code: 'ACTIVATION_PARTY_PREFLIGHT_BLOCKED' });
});

test('active pin loader fails closed for missing or malformed activation',
  async () => {
    await assert.rejects(() => loadActiveRuntimeCatalogPin({
      async query() { return { rows: [] }; }
    }, 'item_container_materialization_v2'),
    { code: 'RUNTIME_CATALOG_ACTIVE_PIN_MISSING' });
    await assert.rejects(() => loadActiveRuntimeCatalogPin({
      async query() { return { rows: [{ event_id: 'event',
        catalog_scope: 'item_container_materialization_v2',
        catalog_revision_id: 'revision', catalog_digest: 'wrong',
        import_id: 'import', import_audit_digest: '1'.repeat(64),
        record_registry_digest: '2'.repeat(64),
        runtime_contract_digest: '3'.repeat(64),
        compatible_world_revision_id: 'world',
        compatible_world_catalog_digest: '4'.repeat(64),
        compatible_world_pin_manifest_digest: '5'.repeat(64) }] }; }
    }, 'item_container_materialization_v2'),
    { code: 'RUNTIME_CATALOG_ACTIVE_PIN_INVALID' });
  });
