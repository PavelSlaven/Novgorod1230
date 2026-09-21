import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildProceduralFinalCandidateImportLedger,
  buildProceduralFinalV2ImportLedger } from
  '../src/procedural-v6-import.js';
import { buildProceduralFinalDevelopmentActivation } from
  '../src/procedural-final-development-activation.js';
import { assertDevelopmentActivationBoundary } from
  '../src/procedural-final-development-activation.js';
import { buildProceduralFinalV2DevelopmentActivation,
  assertProceduralFinalV2DevelopmentActivationBoundary } from
  '../src/procedural-final-v2-development-activation.js';
import { digestEnvelope } from '../src/artifact-contracts.js';
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
const [v2Pack, v2Approval] = await Promise.all([
  'final-candidate-pack-v2/candidate.json',
  'final-candidate-pack-v2/approval-attestation.json'
].map((path) => readFile(new URL(
  `../../../data/world-catalogs/novgorod/procedural-scene-v2/${path}`,
  import.meta.url), 'utf8').then(JSON.parse)));

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

test('resealed production authorization tamper is rejected', async () => {
  const ledger = buildProceduralFinalCandidateImportLedger({ baseline, pack });
  const bundle = structuredClone(await buildProceduralFinalDevelopmentActivation({
    worldPool: { async query() { return { rows: [] }; } },
    partyPool: { async query() { return { rows: [{ party_count: 0,
      pinned_party_count: 0, missing_domain_pin_count: 0,
      inflight_count: 0 }] }; } },
    pack, ledger, gitCommitSha: '8'.repeat(40), authorizationRef: 'test'
  }));
  bundle.attestation.production_deploy_authorized = true;
  const { attestation_digest: ignored, ...payload } = bundle.attestation;
  bundle.attestation.attestation_digest = digestEnvelope(payload);
  assert.throws(() => assertDevelopmentActivationBoundary(bundle),
    { code: 'PROCEDURAL_DEVELOPMENT_ACTIVATION_BOUNDARY_INVALID' });
});

test('V2 activation requires V1 predecessor and current user authorization',
  async () => {
    const ledger = v2Ledger();
    const predecessor = { event_id:
      'runtime_catalog_activation_94447901cebfed28716db756f089d0e4',
      event_sequence: 2,
      catalog_revision_id: 'procedural_scene_final_candidate_v1_001',
      catalog_digest:
        '4ece07fb44abff19490f998a8712144ff18c76daa3080489b51f1df3e705950c',
      import_audit_digest:
        'd5ab73748cd0f79a9064be2434899faa5eac70e96f011f2d09d48657031aa117',
      attestation_digest:
        'c81c4965fea835ed8f5769a0cb21fec3b4be50cbb9a87735808bf4020487f97a' };
    const input = { worldPool: { async query() { return { rows: [predecessor] }; } },
      partyPool: { async query() { return { rows: [{ party_count: 1,
        pinned_party_count: 1, missing_domain_pin_count: 0,
        inflight_count: 0 }] }; } }, v1Pack: pack, v2Pack,
      v2ApprovalAttestation: v2Approval, ledger, gitCommitSha: '8'.repeat(40) };
    const bundle = await buildProceduralFinalV2DevelopmentActivation(input);
    assert.equal(bundle.request.expected_previous_event_id, predecessor.event_id);
    assert.equal(bundle.attestation.attested_by,
      'user_authorization_current_task');
    assert.equal(bundle.attestation.production_deploy_authorized, false);
    const resealed = structuredClone(bundle);
    resealed.attestation.production_deploy_authorized = true;
    const { attestation_digest: ignored, ...payload } = resealed.attestation;
    resealed.attestation.attestation_digest = digestEnvelope(payload);
    assert.throws(() => assertProceduralFinalV2DevelopmentActivationBoundary(
      resealed), { code: 'PROCEDURAL_FINAL_V2_DEVELOPMENT_ACTIVATION_BOUNDARY_INVALID' });
    await assert.rejects(() => buildProceduralFinalV2DevelopmentActivation({
      ...input, worldPool: { async query() { return { rows: [{
        ...predecessor, catalog_revision_id: 'wrong' }] }; } }
    }), { code: 'PROCEDURAL_FINAL_V2_PREDECESSOR_INVALID' });
    await assert.rejects(() => buildProceduralFinalV2DevelopmentActivation({
      ...input, ledger: { ...ledger, root: { ...ledger.root,
        import_audit_digest: '0'.repeat(64) } }
    }), { code: 'PROCEDURAL_FINAL_V2_DEVELOPMENT_ACTIVATION_INPUT_INVALID' });
  });

test('V2 pin loader rejects resealed wrong predecessor and attestation',
  async () => {
    const ledger = v2Ledger();
    const predecessor = { event_id:
      'runtime_catalog_activation_94447901cebfed28716db756f089d0e4',
      event_sequence: 2,
      catalog_revision_id: 'procedural_scene_final_candidate_v1_001',
      catalog_digest:
        '4ece07fb44abff19490f998a8712144ff18c76daa3080489b51f1df3e705950c',
      import_audit_digest:
        'd5ab73748cd0f79a9064be2434899faa5eac70e96f011f2d09d48657031aa117',
      attestation_digest:
        'c81c4965fea835ed8f5769a0cb21fec3b4be50cbb9a87735808bf4020487f97a' };
    const bundle = await buildProceduralFinalV2DevelopmentActivation({
      worldPool: { async query() { return { rows: [predecessor] }; } },
      partyPool: { async query() { return { rows: [{ party_count: 0,
        pinned_party_count: 0, missing_domain_pin_count: 0,
        inflight_count: 0 }] }; } }, v1Pack: pack, v2Pack,
      v2ApprovalAttestation: v2Approval, ledger, gitCommitSha: '8'.repeat(40) });
    const row = { event_id: 'v2-event', event_sequence: 3,
      catalog_scope: 'item_container_materialization_v2',
      catalog_revision_id: v2Pack.target_revision_id,
      catalog_digest: v2Pack.target_catalog_digest, import_id: ledger.root.import_id,
      import_audit_digest: ledger.root.import_audit_digest,
      record_registry_digest: ledger.root.record_registry_digest,
      runtime_contract_digest: bundle.request.runtime_contract_digest,
      compatible_world_revision_id: ledger.root.compatible_world_revision_id,
      compatible_world_catalog_digest: ledger.root.compatible_world_catalog_digest,
      compatible_world_pin_manifest_digest:
        ledger.root.compatible_world_pin_manifest_digest,
      request_digest: bundle.request.activation_request_digest,
      attestation_digest: bundle.attestation.attestation_digest,
      expected_previous_event_id: predecessor.event_id,
      runtime_release_id: bundle.request.runtime_release_id,
      provenance: {},
      predecessor_event_sequence: predecessor.event_sequence,
      predecessor_revision_id: predecessor.catalog_revision_id,
      predecessor_catalog_digest: predecessor.catalog_digest,
      predecessor_import_audit_digest: predecessor.import_audit_digest,
      predecessor_activation_attestation_digest: predecessor.attestation_digest };
    const loader = (value) => loadActiveRuntimeCatalogPin({
      async query() { return { rows: [value] }; }
    }, 'item_container_materialization_v2');
    const pin = await loader(row);
    assert.equal(pin.catalog_revision_id,
      v2Pack.target_revision_id);
    assert.equal(pin.activation_scope, 'new_development_parties_only');
    await assert.rejects(loader({ ...row, import_id: 'fake-import' }),
    { code: 'RUNTIME_CATALOG_ACTIVE_SCOPE_INVALID' });
    await assert.rejects(loader({ ...row,
      import_audit_digest: '0'.repeat(64) }),
    { code: 'RUNTIME_CATALOG_ACTIVE_SCOPE_INVALID' });
    await assert.rejects(loader({ ...row,
      expected_previous_event_id: 'fake-event' }),
    { code: 'RUNTIME_CATALOG_ACTIVE_SCOPE_INVALID' });
    await assert.rejects(loader({ ...row,
      predecessor_catalog_digest: '0'.repeat(64) }),
    { code: 'RUNTIME_CATALOG_ACTIVE_SCOPE_INVALID' });
    await assert.rejects(loader({ ...row,
      predecessor_activation_attestation_digest: '0'.repeat(64) }),
    { code: 'RUNTIME_CATALOG_ACTIVE_SCOPE_INVALID' });
    await assert.rejects(loader({ ...row,
      attestation_digest: '0'.repeat(64) }),
    { code: 'RUNTIME_CATALOG_ACTIVE_SCOPE_INVALID' });
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
    await assert.rejects(() => loadActiveRuntimeCatalogPin({
      async query() { return { rows: [{ event_id: 'event',
        catalog_scope: 'item_container_materialization_v2',
        catalog_revision_id: 'procedural_scene_final_candidate_v1_001',
        catalog_digest:
          '4ece07fb44abff19490f998a8712144ff18c76daa3080489b51f1df3e705950c',
        import_id: 'import', import_audit_digest: '1'.repeat(64),
        record_registry_digest: '2'.repeat(64),
        runtime_contract_digest: '3'.repeat(64),
        compatible_world_revision_id: 'world',
        compatible_world_catalog_digest: '4'.repeat(64),
        compatible_world_pin_manifest_digest: '5'.repeat(64),
        provenance: {} }] }; }
    }, 'item_container_materialization_v2'),
    { code: 'RUNTIME_CATALOG_ACTIVE_SCOPE_INVALID' });
});

function v2Ledger() {
  const ledger = structuredClone(buildProceduralFinalV2ImportLedger({ baseline,
    v1Pack: pack, v2Pack, attestation: v2Approval }));
  ledger.root.import_id =
    'procedural_final_v2_import_2917b993a9e9c63e1989725cee35e63b';
  ledger.root.import_audit_digest =
    '6ad18c6f40185fa540bf7e3ec3bbb5d5b96e95c370b5e70c657a0db73c29f3b2';
  return ledger;
}
