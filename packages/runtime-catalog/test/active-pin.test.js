import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { RuntimeCatalogError } from '@rus/runtime-catalog';
import { buildProceduralFinalCandidateImportLedger, buildProceduralFinalV2ImportLedger } from
  '../../../tools/runtime-catalog-activation/src/procedural-v6-import.js';
import { buildProceduralFinalCurrentSchemaV1DevelopmentActivation } from
  '../../../tools/runtime-catalog-activation/src/procedural-final-development-activation.js';
import { buildProceduralFinalV2DevelopmentActivation, buildProceduralFinalCurrentSchemaV2DevelopmentActivation } from
  '../../../tools/runtime-catalog-activation/src/procedural-final-v2-development-activation.js';

const scope = 'item_container_materialization_v2';
const sqlSha256 = '4f44739323b75e33167525c6cd6542d3e75ebd0649dd5c2b23537edfd7bb584e';
const gate1Policy = {
  schema: 'rus.gate1_already_imported_registration.v1',
  activation_scope: 'new_development_parties_only', production_deploy_authorized: false,
  existing_party_migration_authorized: false, old_save_rematerialization_authorized: false,
  authoring_only_functional_allocation_runtime_selection: false,
  runtime_item_creation_authorized: false, import_authorized: false, zero_gameplay_row_writes: true
};

function row(overrides = {}) {
  return { event_id: 'event-fixture', event_sequence: 1, catalog_scope: scope,
    catalog_revision_id: 'approved-fixture', catalog_digest: '1'.repeat(64),
    import_id: 'import-fixture', import_audit_digest: '2'.repeat(64),
    record_registry_digest: '3'.repeat(64), runtime_contract_digest: '4'.repeat(64),
    compatible_world_revision_id: 'world-fixture', compatible_world_catalog_digest: '5'.repeat(64),
    compatible_world_pin_manifest_digest: '6'.repeat(64), provenance: {}, ...overrides };
}

function expectedPin(value, activationScope = null) {
  return { schema: 'rus.runtime_catalog_pin.v2', catalog_scope: value.catalog_scope,
    catalog_revision_id: value.catalog_revision_id, catalog_digest: value.catalog_digest,
    activation_event_id: value.event_id, import_id: value.import_id,
    import_audit_digest: value.import_audit_digest, record_registry_digest: value.record_registry_digest,
    runtime_contract_digest: value.runtime_contract_digest,
    compatible_world_revision_id: value.compatible_world_revision_id,
    compatible_world_catalog_digest: value.compatible_world_catalog_digest,
    compatible_world_pin_manifest_digest: value.compatible_world_pin_manifest_digest,
    activation_scope: activationScope };
}

function client(rows) {
  const calls = [];
  return { calls, async query(sql, params) {
    calls.push({ sql, params, receiver: this });
    return { rows };
  } };
}

const failures = [
  ['missing', [], 'RUNTIME_CATALOG_ACTIVE_PIN_MISSING',
    'Exactly one latest approved runtime-catalog activation is required.'],
  ['invalid digest', [row({ catalog_digest: 'wrong' })], 'RUNTIME_CATALOG_ACTIVE_PIN_INVALID',
    'Latest runtime-catalog activation has an invalid exact pin.'],
  ['Gate1 authority', [row({ provenance: { gate1_already_imported_registration:
    { ...gate1Policy, zero_gameplay_row_writes: false } } })], 'RUNTIME_CATALOG_ACTIVE_SCOPE_INVALID',
    'Gate1 activation exceeds exact development-only authority.'],
  ['procedural V1 metadata', [row({ catalog_revision_id: 'procedural_scene_final_candidate_v1_001' })],
    'RUNTIME_CATALOG_ACTIVE_SCOPE_INVALID', 'Final procedural activation lacks exact development-only metadata.'],
  ['procedural V2 attestation', [row({ catalog_revision_id: 'procedural_scene_final_candidate_v2_001' })],
    'RUNTIME_CATALOG_ACTIVE_SCOPE_INVALID', 'V2 activation lacks exact development-only attestation or predecessor.']
];

async function loader(kind) {
  const module = await import('@rus/runtime-catalog/active-pin');
  assert.equal(typeof module.loadActiveRuntimeCatalogPin, 'function');
  return module.loadActiveRuntimeCatalogPin;
}

for (const kind of ['package']) {
  test(`${kind} active pin has the exact read-only query and frozen projection`, async () => {
    const load = await loader(kind);
    const value = row();
    const queryClient = client([value]);
    const pin = await load(queryClient, scope);
    assert.deepEqual(pin, expectedPin(value));
    assert.ok(Object.isFrozen(pin));
    assert.equal(queryClient.calls.length, 1);
    const call = queryClient.calls[0];
    assert.equal(call.receiver, queryClient, 'injected query retains its client receiver');
    assert.deepEqual(call.params, [scope]);
    assert.equal(createHash('sha256').update(call.sql).digest('hex'), sqlSha256,
      'the mechanical move preserves SELECT, joins, filters and ordering byte for byte');
  });

  for (const [label, rows, code, message] of failures) {
    test(`${kind} active pin preserves error: ${label}`, async () => {
      const load = await loader(kind);
      await assert.rejects(load(client(rows), scope), (error) => {
        assert.equal(error.code, code);
        assert.equal(error.message, message);
        assert.ok(error instanceof RuntimeCatalogError);
        return true;
      });
    });
  }

  test(`${kind} active pin passes query errors through by identity`, async () => {
    const load = await loader(kind);
    const failure = Object.assign(new Error('fixture query failure'), { code: 'FIXTURE_QUERY_FAILED' });
    await assert.rejects(load({ async query() { throw failure; } }, scope), (error) => error === failure);
  });

  test(`${kind} active pin admits the existing Gate1 development-only policy`, async () => {
    const load = await loader(kind);
    const value = row({ provenance: { gate1_already_imported_registration: gate1Policy } });
    assert.deepEqual(await load(client([value]), scope), expectedPin(value, 'new_development_parties_only'));
  });

  test(`${kind} active pin admits exact V1 policy, rejects its manifest drift`, async () => {
    const load = await loader(kind);
    const value = row({ catalog_revision_id: 'procedural_scene_final_candidate_v1_001', provenance: {
      development_activation_policy: { schema: 'rus.procedural_final_development_activation_policy.v1',
        activation_scope: 'new_development_parties_only', production_deploy_authorized: false,
        existing_party_migration_authorized: false, old_save_rematerialization_authorized: false,
        compatible_world_pin_manifest_digest: '6'.repeat(64) }
    } });
    assert.deepEqual(await load(client([value]), scope), expectedPin(value, 'new_development_parties_only'));
    const changed = structuredClone(value);
    changed.provenance.development_activation_policy.compatible_world_pin_manifest_digest = '0'.repeat(64);
    await assert.rejects(load(client([changed]), scope), {
      code: 'RUNTIME_CATALOG_ACTIVE_SCOPE_INVALID',
      message: 'Final procedural activation lacks exact development-only metadata.'
    });
  });

  for (const chain of ['legacy', 'current-schema']) {
    test(`${kind} active pin preserves ${chain} V2 admission and predecessor rejection`, async () => {
      const load = await loader(kind);
      const value = await v2Row(chain);
      assert.deepEqual(await load(client([value]), scope), expectedPin(value, 'new_development_parties_only'));
      for (const changed of [
        { ...value, predecessor_activation_attestation_digest: '0'.repeat(64) },
        { ...value, event_sequence: value.event_sequence + 1 },
        { ...value, attestation_digest: '0'.repeat(64) }
      ]) {
        await assert.rejects(load(client([changed]), scope), {
          code: 'RUNTIME_CATALOG_ACTIVE_SCOPE_INVALID',
          message: 'V2 activation lacks exact development-only attestation or predecessor.'
        });
      }
    });
  }
}

async function v2Row(chain) {
  const base = new URL('../../../data/world-catalogs/novgorod/procedural-scene-v2/', import.meta.url);
  const [pack, v2Pack, approval] = await Promise.all([
    'final-candidate-pack-v1/candidate.json', 'final-candidate-pack-v2/candidate.json',
    'final-candidate-pack-v2/approval-attestation.json'
  ].map(async (path) => JSON.parse(await readFile(new URL(path, base), 'utf8'))));
  const baseline = { request: { parent_revision_id: 'baseline', parent_catalog_digest: '1'.repeat(64),
    parent_snapshot_manifest_digest: '2'.repeat(64) }, compatibilityManifest: pack.compatibility_manifest };
  const ledger = structuredClone(buildProceduralFinalV2ImportLedger({ baseline, v1Pack: pack,
    v2Pack, attestation: approval }));
  ledger.root.import_id = 'procedural_final_v2_import_2917b993a9e9c63e1989725cee35e63b';
  ledger.root.import_audit_digest = '6ad18c6f40185fa540bf7e3ec3bbb5d5b96e95c370b5e70c657a0db73c29f3b2';
  const partyPool = client([{ party_count: 0, pinned_party_count: 0, missing_domain_pin_count: 0, inflight_count: 0 }]);
  let predecessor = {
    event_id: 'runtime_catalog_activation_94447901cebfed28716db756f089d0e4', event_sequence: 2,
    catalog_revision_id: 'procedural_scene_final_candidate_v1_001',
    catalog_digest: '4ece07fb44abff19490f998a8712144ff18c76daa3080489b51f1df3e705950c',
    import_audit_digest: 'd5ab73748cd0f79a9064be2434899faa5eac70e96f011f2d09d48657031aa117',
    attestation_digest: 'c81c4965fea835ed8f5769a0cb21fec3b4be50cbb9a87735808bf4020487f97a'
  };
  if (chain === 'current-schema') {
    const v1Ledger = structuredClone(buildProceduralFinalCandidateImportLedger({ baseline, pack }));
    v1Ledger.root.import_id = 'procedural_final_import_0204d109cbe18d06aed0957be3c10d12';
    v1Ledger.root.import_audit_digest = predecessor.import_audit_digest;
    const v1 = await buildProceduralFinalCurrentSchemaV1DevelopmentActivation({
      worldPool: client([{ event_id: 'fixture-dev-v13' }]), partyPool, pack,
      ledger: v1Ledger, gitCommitSha: '8'.repeat(40)
    });
    predecessor = { ...predecessor, event_id: 'fixture-current-v1', event_sequence: 4,
      request_digest: v1.request.activation_request_digest, attestation_digest: v1.attestation.attestation_digest,
      runtime_release_id: v1.runtimeRelease.runtime_release_id,
      runtime_contract_digest: v1.request.runtime_contract_digest };
  }
  const build = chain === 'legacy' ? buildProceduralFinalV2DevelopmentActivation
    : buildProceduralFinalCurrentSchemaV2DevelopmentActivation;
  const bundle = await build({ worldPool: client([predecessor]), partyPool, v1Pack: pack, v2Pack,
    v2ApprovalAttestation: approval, ledger, gitCommitSha: '8'.repeat(40) });
  return row({ event_id: `fixture-${chain}-v2`, event_sequence: predecessor.event_sequence + 1,
    catalog_revision_id: v2Pack.target_revision_id, catalog_digest: v2Pack.target_catalog_digest,
    import_id: ledger.root.import_id, import_audit_digest: ledger.root.import_audit_digest,
    record_registry_digest: ledger.root.record_registry_digest,
    runtime_contract_digest: bundle.request.runtime_contract_digest,
    compatible_world_revision_id: ledger.root.compatible_world_revision_id,
    compatible_world_catalog_digest: ledger.root.compatible_world_catalog_digest,
    compatible_world_pin_manifest_digest: ledger.root.compatible_world_pin_manifest_digest,
    request_digest: bundle.request.activation_request_digest, attestation_digest: bundle.attestation.attestation_digest,
    expected_previous_event_id: predecessor.event_id, runtime_release_id: bundle.request.runtime_release_id,
    predecessor_event_sequence: predecessor.event_sequence, predecessor_revision_id: predecessor.catalog_revision_id,
    predecessor_catalog_digest: predecessor.catalog_digest,
    predecessor_import_audit_digest: predecessor.import_audit_digest,
    predecessor_activation_attestation_digest: predecessor.attestation_digest,
    predecessor_request_digest: predecessor.request_digest,
    predecessor_runtime_release_id: predecessor.runtime_release_id,
    predecessor_runtime_contract_digest: predecessor.runtime_contract_digest });
}
