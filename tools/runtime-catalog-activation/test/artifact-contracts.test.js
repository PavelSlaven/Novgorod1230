import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  RuntimeCatalogArtifactError,
  buildActivationEvent,
  buildActivationRequest,
  buildBaseWorldCompatibilityManifest,
  buildBaselineRegistrationId,
  buildBaselineRegistrationRequest,
  buildOperatorBaselineSnapshotManifest,
  buildPartyPreflight,
  buildRuntimeReleaseIdentity,
  digestEnvelope
} from '../src/artifact-contracts.js';
import { comparePr17OverlaySemantics } from '../src/semantic-equivalence.js';
import { runRuntimeCatalogOperatorCli } from '../src/cli.js';

const sha = (letter) => letter.repeat(64);

test('runtime catalog JSON Schema covers every persisted/operator envelope and resolves local refs', async () => {
  const schema = JSON.parse(await readFile(
    new URL('../../../schemas/runtime-catalog/runtime-catalog-artifacts-v2.schema.json', import.meta.url),
    'utf8'
  ));
  const serialized = JSON.stringify(schema);
  const refs = [...serialized.matchAll(/#\/\$defs\/([A-Za-z0-9]+)/gu)]
    .map((match) => match[1]);
  for (const ref of refs) assert.ok(schema.$defs[ref], `missing schema ref ${ref}`);
  for (const name of [
    'operatorBaselineSnapshot',
    'baseWorldCompatibility',
    'baselineRegistrationRequest',
    'baselineRegistrationAttestation',
    'overlayCandidate',
    'promotionManifest',
    'overlayApprovalRequest',
    'overlayApprovalAttestation',
    'catalogImportAudit',
    'runtimeCatalogPin',
    'partyPreflight',
    'activationRequest',
    'activationAttestation',
    'activationEvent',
    'runtimeRelease'
  ]) {
    assert.ok(schema.$defs[name], `missing artifact schema ${name}`);
  }
});

test('baseline manifest and registration request bind exact schema, registry, records and world tuple', () => {
  const registry = {
    schema: 'rus.catalog_record_registry.v1',
    catalog_scope: 'item_container_materialization_v2',
    entries: [{
      table_name: 'example_records',
      operation_domain: 'catalog_membership',
      primary_key_fields: ['id'],
      canonical_columns: ['id', 'title'],
      excluded_operational_columns: [],
      column_normalizers: { id: 'text_nfc', title: 'text_nfc' },
      canonical_row_schema_version: 'rus.catalog_record_projection.v2',
      dependency_order: 0,
      reader_adapter_id: 'read_example_v1',
      writer_adapter_id: 'write_example_v1'
    }]
  };
  const baseline = buildOperatorBaselineSnapshotManifest({
    schemaFingerprint: sha('a'),
    registry,
    rowsByTable: { example_records: [{ id: 'one', title: 'Один' }] }
  });
  const request = buildBaselineRegistrationRequest({
    parentRevisionId: 'operator-baseline-v1',
    parentCatalogDigest: baseline.records_aggregate_digest,
    baselineManifest: baseline,
    compatibleWorldTuple: {
      compatible_world_revision_id: 'world-v1',
      compatible_world_catalog_digest: sha('c'),
      compatible_world_pin_manifest_digest: sha('d')
    }
  });
  assert.equal(baseline.included_tables[0].record_count, 1);
  assert.match(baseline.parent_snapshot_manifest_digest, /^[a-f0-9]{64}$/u);
  assert.equal(request.parent_snapshot_manifest_digest, baseline.parent_snapshot_manifest_digest);
  assert.equal(request.parent_catalog_digest, baseline.records_aggregate_digest);
  assert.match(request.registration_request_digest, /^[a-f0-9]{64}$/u);
  assert.match(buildBaselineRegistrationId(request), /^catalog_baseline_/u);

  assert.throws(
    () => buildBaselineRegistrationRequest({
      parentRevisionId: 'operator-baseline-v1',
      parentCatalogDigest: sha('f'),
      baselineManifest: baseline,
      compatibleWorldTuple: {
        compatible_world_revision_id: 'world-v1',
        compatible_world_catalog_digest: sha('c'),
        compatible_world_pin_manifest_digest: sha('d')
      }
    }),
    (error) => error.code === 'BASELINE_MANIFEST_MISMATCH'
  );
});

test('compatible-world manifest binds the production configuration provenance', () => {
  const manifest = buildBaseWorldCompatibilityManifest({
    compatibleWorldRevisionId: 'world-v1',
    compatibleWorldCatalogDigest: sha('a'),
    sourceRuntimeConfigurationDigest: sha('b'),
    sourceArtifactPaths: ['config/world.json', 'packages/new-game/src/index.js'],
    sourceCommitSha: 'c'.repeat(40),
    validationContractVersion: 'base_world_compatibility_v1'
  });
  assert.equal(manifest.schema, 'rus.base_world_compatibility_manifest.v1');
  assert.deepEqual(manifest.source_artifact_paths, [
    'config/world.json',
    'packages/new-game/src/index.js'
  ]);
  assert.match(manifest.compatible_world_pin_manifest_digest, /^[a-f0-9]{64}$/u);
});

test('runtime release identity binds build provenance but remains separate from contract identity', () => {
  const release = buildRuntimeReleaseIdentity({
    gitCommitSha: 'a'.repeat(40),
    buildReleaseManifestDigest: sha('b'),
    supportedRuntimeContractDigests: [sha('d'), sha('c')]
  });
  assert.deepEqual(release.supported_runtime_contract_digests, [sha('c'), sha('d')]);
  assert.match(release.runtime_release_id, /^[a-f0-9]{64}$/u);
});

test('semantic comparator permits only explicit technical paths and exact nine-way G4 mapping', () => {
  const mapping = Array.from({ length: 9 }, (_, index) => ({
    source_transition_id: `transition-${index}`,
    graph_node_record_key: `["g4-${index}"]`,
    asserted_status: 'approved',
    source_transition_semantic_digest: sha('a'),
    historical_approval_basis_digest: sha('b')
  }));
  const report = comparePr17OverlaySemantics({
    sourceDocuments: {
      manifest: { parent_revision_id: 'legacy', semantic: { quantity: 2 } }
    },
    rebuiltDocuments: {
      manifest: { parent_revision_id: 'operator-baseline', semantic: { quantity: 2 } }
    },
    allowlist: [{
      document_kind: 'manifest',
      json_pointer: '/parent_revision_id',
      normalizer_id: 'replace_parent_revision_id',
      reason_code: 'operator_baseline_rebind'
    }],
    transitionAssertionMapping: mapping
  });
  assert.equal(report.result, 'PASS');
  assert.deepEqual(report.all_differences, []);

  assert.throws(
    () => comparePr17OverlaySemantics({
      sourceDocuments: {},
      rebuiltDocuments: {},
      allowlist: [{
        document_kind: 'manifest',
        json_pointer: '/digests/*',
        normalizer_id: 'remove_derived_digest',
        reason_code: 'too_broad'
      }],
      transitionAssertionMapping: mapping
    }),
    (error) => error.code === 'SEMANTIC_NORMALIZATION_RULE_INVALID'
  );
});

test('activation artifacts enforce empty-party preflight, attestation binding and CAS sequence', () => {
  const preflight = buildPartyPreflight({
    partyCount: 0,
    pinnedPartyCount: 0,
    missingDomainPinCount: 0,
    inflightStage24Stage25Count: 0,
    runtimeReleaseId: sha('a'),
    runtimeContractDigest: sha('b'),
    checkedAt: '2026-07-23T00:00:00.000Z'
  });
  const request = buildActivationRequest({
    fields: {
      parent_revision_id: 'parent-v1',
      parent_catalog_digest: sha('c'),
      parent_snapshot_manifest_digest: sha('d'),
      compatible_world_revision_id: 'world-v1',
      compatible_world_catalog_digest: sha('e'),
      compatible_world_pin_manifest_digest: sha('f'),
      target_revision_id: 'domain-v2',
      target_catalog_digest: sha('1'),
      record_registry_digest: sha('2'),
      runtime_contract_digest: sha('b'),
      import_id: 'import-v2',
      import_audit_digest: sha('3'),
      promotion_manifest_digest: sha('4'),
      approval_request_digest: sha('5'),
      approval_attestation_digest: sha('6'),
      expected_previous_event_id: null,
      runtime_release_id: sha('a')
    },
    partyPreflight: preflight
  });
  const attestationPayload = {
    schema: 'rus.runtime_catalog_activation_attestation.v2',
    activation_request_digest: request.activation_request_digest,
    catalog_scope: request.catalog_scope,
    target_revision_id: request.target_revision_id,
    target_catalog_digest: request.target_catalog_digest,
    import_id: request.import_id,
    import_audit_digest: request.import_audit_digest,
    runtime_contract_digest: request.runtime_contract_digest,
    runtime_release_id: request.runtime_release_id,
    decision: 'approve_activation',
    attested_by: 'operator'
  };
  const attestation = {
    ...attestationPayload,
    attestation_digest: digestEnvelope(attestationPayload),
    attested_at: '2026-07-23T00:01:00.000Z'
  };
  const event = buildActivationEvent({
    request,
    attestation,
    previousEvent: null,
    operatorPrincipal: 'runtime_operator'
  });
  assert.equal(event.event_sequence, 1);
  assert.match(event.event_id, /^runtime_catalog_activation_/u);

  const changedAttestation = {
    ...attestation,
    import_id: 'another-import'
  };
  const {
    attestation_digest: ignored,
    attested_at: ignoredAt,
    ...changedPayload
  } = changedAttestation;
  changedAttestation.attestation_digest = digestEnvelope(changedPayload);
  assert.throws(
    () => buildActivationEvent({
      request,
      attestation: changedAttestation,
      previousEvent: null,
      operatorPrincipal: 'runtime_operator'
    }),
    (error) => error.code === 'ATTESTATION_MISMATCH'
  );

  assert.throws(
    () => buildPartyPreflight({
      partyCount: 1,
      pinnedPartyCount: 0,
      missingDomainPinCount: 1,
      inflightStage24Stage25Count: 0,
      runtimeReleaseId: sha('a'),
      runtimeContractDigest: sha('b')
    }),
    (error) => error instanceof RuntimeCatalogArtifactError
      && error.code === 'ACTIVATION_PARTY_PREFLIGHT_BLOCKED'
  );
});

test('operator CLI refuses write confirmation without the exact request digest', async () => {
  await assert.rejects(
    () => runRuntimeCatalogOperatorCli([
      'migrate',
      '--confirm',
      '--expected-request-digest',
      sha('f')
    ], { stdout: { write() {} } }),
    (error) => error.code === 'OPERATOR_EXPECTED_REQUEST_DIGEST_MISMATCH'
  );
});
