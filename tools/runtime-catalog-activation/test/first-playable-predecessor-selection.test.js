import assert from 'node:assert/strict';
import test from 'node:test';

import { selectExactActivationPredecessor } from
  '../src/first-playable-v2-activation.js';

const targetRevisionId = 'runtime_catalog_same_target_001';
const latest = Object.freeze({
  event_id: 'runtime_catalog_activation_latest',
  event_sequence: 4,
  event_type: 'activate',
  catalog_scope: 'item_container_materialization_v2',
  catalog_revision_id: targetRevisionId,
  catalog_digest: 'a'.repeat(64),
  import_id: 'catalog_import_exact',
  import_audit_digest: 'b'.repeat(64),
  record_registry_digest: 'c'.repeat(64),
  runtime_contract_digest: 'd'.repeat(64),
  compatible_world_revision_id: 'world_v6',
  compatible_world_catalog_digest: 'e'.repeat(64),
  compatible_world_pin_manifest_digest: 'f'.repeat(64),
  request_digest: '1'.repeat(64),
  attestation_digest: '2'.repeat(64),
  expected_previous_event_id: 'runtime_catalog_activation_previous',
  runtime_release_id: '3'.repeat(64),
  operator_principal: 'postgres',
  event_digest: '4'.repeat(64)
});

test('exact same-target activation replay keeps its stored predecessor', () => {
  assert.equal(selectExactActivationPredecessor({ latestEvent: latest,
    targetRevisionId, replayEvent: eventFrom(latest) }),
  latest.expected_previous_event_id);
});

test('new same-target activation request advances from latest event', () => {
  assert.equal(selectExactActivationPredecessor({ latestEvent: latest,
    targetRevisionId, replayEvent: eventFrom({ ...latest,
      request_digest: '5'.repeat(64), attestation_digest: '6'.repeat(64),
      event_digest: '7'.repeat(64) }) }),
  latest.event_id);
});

test('same request identity with event drift is a collision', () => {
  assert.throws(() => selectExactActivationPredecessor({ latestEvent: latest,
    targetRevisionId, replayEvent: eventFrom({ ...latest,
      compatible_world_pin_manifest_digest: '8'.repeat(64),
      event_digest: '9'.repeat(64) }) }), { code: 'ACTIVATION_EVENT_COLLISION' });
});

function eventFrom(value) {
  return {
    event_id: value.event_id,
    event_sequence: value.event_sequence,
    event_type: value.event_type,
    catalog_scope: value.catalog_scope,
    catalog_revision_id: value.catalog_revision_id,
    catalog_digest: value.catalog_digest,
    import_id: value.import_id,
    import_audit_digest: value.import_audit_digest,
    record_registry_digest: value.record_registry_digest,
    runtime_contract_digest: value.runtime_contract_digest,
    compatible_world_revision_id: value.compatible_world_revision_id,
    compatible_world_catalog_digest: value.compatible_world_catalog_digest,
    compatible_world_pin_manifest_digest:
      value.compatible_world_pin_manifest_digest,
    request_digest: value.request_digest,
    attestation_digest: value.attestation_digest,
    expected_previous_event_id: value.expected_previous_event_id,
    runtime_release_id: value.runtime_release_id,
    operator_principal: value.operator_principal,
    event_digest: value.event_digest
  };
}
