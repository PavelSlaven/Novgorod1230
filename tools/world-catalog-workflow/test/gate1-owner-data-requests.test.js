import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

import { buildGate1OwnerDataArtifacts,
  validateGate1OwnerDataAuthoringAttestation,
  validatePendingGate1OwnerDataArtifacts } from
  '../../../scripts/generate-gate1-owner-data-requests.mjs';
import { buildGate1SourceReconciliationArtifacts,
  validateGate1SourceReconciliationAuthoringAttestation,
  validatePendingGate1SourceReconciliation } from
  '../../../scripts/generate-gate1-source-reconciliation-request.mjs';

const root = 'data/world-catalogs/novgorod/runtime-catalog/gate1-owner-data-v1';

test('Gate1 owner-data requests reproduce exact checked-in pending artifacts',
  async () => {
    const generated = await buildGate1OwnerDataArtifacts();
    const checkedIn = {
      parent: JSON.parse(await readFile(`${root}/parent-import-request.json`,
        'utf8')),
      activation: JSON.parse(await readFile(`${root}/activation-request.json`,
        'utf8'))
    };
    assert.deepEqual(generated, checkedIn);
    assert.equal(generated.parent.graph_node_transitions.length, 9);
    assert.equal(new Set(generated.parent.graph_node_transitions
      .map(({ graph_node_id }) => graph_node_id)).size, 9);
    assert.deepEqual(generated.parent.exact_dependencies
      .region_place_templates.map(({ source_row }) => source_row.id), [
      'rpt_novgorod_administrative_court',
      'rpt_novgorod_city_major_center',
      'rpt_novgorod_market_place',
      'rpt_novgorod_monastery',
      'rpt_novgorod_posad_suburb',
      'rpt_novgorod_river_landing'
    ]);
  });

test('pending Gate1 requests grant no import, activation or runtime authority',
  async () => {
    const artifacts = await buildGate1OwnerDataArtifacts();
    for (const artifact of Object.values(artifacts)) {
      assert.equal(artifact.authority.approval_attestation_present, false);
      assert.equal(artifact.authority.import_authorized, false);
      assert.equal(artifact.authority.activation_authorized, false);
      assert.equal(artifact.authority.production_authorized, false);
      assert.equal(artifact.authority.existing_party_migration_authorized, false);
      assert.equal(artifact.authority.runtime_item_creation_authorized, false);
    }
    assert.deepEqual(artifacts.activation.requested_permissions, {
      import_approved_item_container_catalog: true,
      activate_for_new_development_parties_only: true,
      production_activation: false,
      existing_party_migration: false,
      old_save_rematerialization: false,
      authoring_only_functional_allocation_runtime_selection: false,
      runtime_item_creation: false
    });
    assert.deepEqual(artifacts.activation.compatible_worlds.map((world) =>
      world.current_production_activation), [false, false]);
    assert.equal(artifacts.parent.requested_authoring_promotions
      .grants_runtime_activation, false);
    assert.equal(artifacts.parent.requested_import.grants_runtime_activation,
      false);
    assert.equal(artifacts.activation.operational_request_schema,
      'rus.runtime_catalog_activation_request.v2');
    assert.equal(artifacts.activation.operational_request_status,
      'blocked_until_approved_import_and_exact_readback');
  });

test('Gate1 validator rejects authority added to a pending request', async () => {
  const artifacts = structuredClone(await buildGate1OwnerDataArtifacts());
  artifacts.activation.authority.activation_authorized = true;
  assert.throws(() => validatePendingGate1OwnerDataArtifacts(artifacts),
    /GATE1_PENDING_ARTIFACT_AUTHORITY_FORBIDDEN/u);
});

test('Gate1 validator rejects runtime item creation and authoring allocation',
  async () => {
    for (const field of ['runtime_item_creation',
      'authoring_only_functional_allocation_runtime_selection']) {
      const artifacts = structuredClone(await buildGate1OwnerDataArtifacts());
      artifacts.activation.requested_permissions[field] = true;
      assert.throws(() => validatePendingGate1OwnerDataArtifacts(artifacts),
        /GATE1_RUNTIME_SCOPE_FORBIDDEN/u);
  }
});

test('authoring attestation approves only exact transactional import/readback',
  async () => {
    const artifacts = await buildGate1OwnerDataArtifacts();
    const attestation = JSON.parse(await readFile(
      `${root}/authoring-approval-attestation.json`, 'utf8'));
    assert.equal(validateGate1OwnerDataAuthoringAttestation({
      ...artifacts, attestation
    }), true);
    assert.equal(artifacts.activation.status,
      'pending_independent_runtime_approval');
    for (const field of ['activation_authorized', 'production_authorized',
      'existing_party_migration_authorized',
      'authoring_only_functional_allocation_runtime_selection',
      'runtime_item_creation_authorized']) {
      assert.equal(attestation.authority[field], false);
    }
    const widened = structuredClone(attestation);
    widened.authority.runtime_item_creation_authorized = true;
    assert.throws(() => validateGate1OwnerDataAuthoringAttestation({
      ...artifacts, attestation: widened
    }), /GATE1_AUTHORING_ATTESTATION_INVALID/u);
  });

test('Gate1 source reconciliation reproduces append-only pending artifacts',
  async () => {
    const generated = await buildGate1SourceReconciliationArtifacts();
    const reconciliationRoot = `${root}/source-record-reconciliation-v1`;
    const checkedIn = {
      embeddedRows: JSON.parse(await readFile(
        `${reconciliationRoot}/source-records-embedded.json`, 'utf8')),
      candidate: JSON.parse(await readFile(
        `${reconciliationRoot}/candidate.json`, 'utf8')),
      request: JSON.parse(await readFile(
        `${reconciliationRoot}/request.json`, 'utf8'))
    };
    assert.deepEqual(generated, checkedIn);
    assert.deepEqual(generated.candidate.collisions.map(({ id,
      canonical_parent_row: row, requested_transition: transition }) => ({
      id, source_type: row.source_type, source_status: row.status,
      requested_status: transition.to_status
    })), [{
      id: 'src_novgorod_agriculture', source_type: 'web',
      source_status: 'usable_with_caution', requested_status: 'approved'
    }, {
      id: 'src_novgorod_promysly', source_type: 'web',
      source_status: 'usable_with_caution', requested_status: 'approved'
    }]);
    assert.equal(generated.embeddedRows.length, 17);
    assert.equal(generated.candidate.amended_stage3c_manifest.datasets
      .find(({ table }) => table === 'source_records').record_count, 17);
  });

test('pending source reconciliation grants no import or runtime authority',
  async () => {
    const artifacts = await buildGate1SourceReconciliationArtifacts();
    assert.equal(validatePendingGate1SourceReconciliation(artifacts), true);
    for (const artifact of [artifacts.candidate, artifacts.request]) {
      assert.deepEqual(Object.values(artifact.authority),
        Object.values(artifact.authority).map(() => false));
    }
    assert.equal(artifacts.request.requested_import_effect
      .original_stage3c_attestation_does_not_authorize_amendment, true);
    assert.equal(artifacts.request.requested_import_effect
      .grants_runtime_activation, false);
    const widened = structuredClone(artifacts);
    widened.request.authority.import_authorized = true;
    assert.throws(() => validatePendingGate1SourceReconciliation(widened),
      /GATE1_SOURCE_RECONCILIATION_AUTHORITY_FORBIDDEN/u);
  });

test('source reconciliation attestation approves import/readback only',
  async () => {
    const artifacts = await buildGate1SourceReconciliationArtifacts();
    const attestation = JSON.parse(await readFile(`${root}/`
      + 'source-record-reconciliation-v1/authoring-approval-attestation.json',
    'utf8'));
    assert.equal(validateGate1SourceReconciliationAuthoringAttestation({
      ...artifacts, attestation
    }), true);
    assert.equal(attestation.original_stage3c_attestation_transfer_authorized,
      false);
    for (const field of ['activation_authorized', 'production_authorized',
      'existing_party_migration_authorized',
      'old_save_rematerialization_authorized',
      'authoring_only_functional_allocation_runtime_selection',
      'runtime_item_creation_authorized']) {
      assert.equal(attestation.authority[field], false);
    }
    const widened = structuredClone(attestation);
    widened.authority
      .authoring_only_functional_allocation_runtime_selection = true;
    assert.throws(() =>
      validateGate1SourceReconciliationAuthoringAttestation({
        ...artifacts, attestation: widened
      }), /GATE1_SOURCE_RECONCILIATION_ATTESTATION_INVALID/u);
  });
