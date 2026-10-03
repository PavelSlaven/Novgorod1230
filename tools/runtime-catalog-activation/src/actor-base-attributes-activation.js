import { canonicalStringify } from '@rus/runtime-catalog';
import { RUNTIME_CATALOG_ACTIVATION_LOCK_KEY } from
  '@rus/runtime-catalog/runtime-contract';
import { validateActorBaseAttributesRuntimeActivationAttestation } from
  '../../../scripts/generate-actor-base-attributes-runtime-activation-request.mjs';
import { buildActivationEventFromVerifiedAttestation,
  digestEnvelope } from './artifact-contracts.js';
import { readActorBaseAttributesImport,
  validateActorBaseAttributesImportResult } from
  './actor-base-attributes-import.js';
import { isActorBaseAttributesSuccessor,
  validateActorBaseAttributesSuccessorActivationApproval,
  buildActorBaseAttributesSuccessorPreflight } from
  './actor-base-attributes-successor.js';

const ACTIVATOR = 'runtime_catalog_activator';

export async function activateActorBaseAttributes({ readPool, activationPool,
  request, attestation, importApproval, importResult, partyPool = null }) {
  validateApproval({ request, attestation });
  validateActorBaseAttributesImportResult({ result: importResult,
    ...importApproval });
  const successor = isActorBaseAttributesSuccessor(request);
  if (successor && (canonicalStringify(request.import_request)
      !== canonicalStringify(importApproval.request)
      || canonicalStringify(request.completed_import_readback)
        !== canonicalStringify(importResult))) {
    fail('ACTOR_BASE_ATTRIBUTES_ACTIVATION_IMPORT_MISMATCH',
      'Successor activation must bind the exact reviewed import.');
  }
  const activationEventCount = Number((await readPool.query(
    `SELECT count(*) AS count
       FROM world_base.runtime_catalog_activation_events
      WHERE catalog_scope=$1
        AND ($2::text IS NULL OR catalog_revision_id=$2)`,
    [request.target_binding.catalog_scope,
      successor ? request.target_binding.target_revision_id : null])).rows[0].count);
  if (![0, 1].includes(activationEventCount)) collision();
  const liveImport = await readActorBaseAttributesImport(readPool,
    { ...importApproval, expectedActivationEventCount: activationEventCount });
  if (canonicalStringify(liveImport) !== canonicalStringify(importResult)) {
    fail('ACTOR_BASE_ATTRIBUTES_ACTIVATION_IMPORT_MISMATCH',
      'Live import differs from approved activation source.');
  }
  const eventRequest = buildEventRequest({ request, attestation });
  return transaction(activationPool, async (client) => {
    await client.query('SELECT pg_advisory_xact_lock($1::bigint)',
      [RUNTIME_CATALOG_ACTIVATION_LOCK_KEY]);
    if (successor) {
      if (!partyPool) fail('ACTOR_SUCCESSOR_PARTY_PREFLIGHT_REQUIRED',
        'Production actor successor requires the current party preflight.');
      const counts = (await partyPool.query(`SELECT
        (SELECT count(*)::int FROM party_runtime.parties) AS party_count,
        (SELECT count(DISTINCT party_id)::int FROM party_runtime.party_catalog_pins
          WHERE catalog_scope='actor_base_attributes_v1') AS pinned_party_count,
        (SELECT count(*)::int FROM party_runtime.parties p
          WHERE NOT EXISTS (SELECT 1 FROM party_runtime.party_catalog_pins c
            WHERE c.party_id=p.party_id AND c.catalog_scope='actor_base_attributes_v1'))
          AS missing_domain_pin_count,
        (SELECT count(*)::int FROM party_runtime.commit_idempotency
          WHERE status IN ('reserved','transaction_committed')) AS inflight_count`)).rows[0];
      if (canonicalStringify(buildActorBaseAttributesSuccessorPreflight(counts))
          !== canonicalStringify(request.party_preflight)) {
        fail('ACTIVATION_PARTY_PREFLIGHT_STALE', 'Actor party preflight changed after approval.');
      }
    }
    await assertActivationSource(client, request);
    const principal = (await client.query(
      'SELECT current_user AS principal')).rows[0].principal;
    if (principal !== ACTIVATOR) {
      fail('ACTOR_BASE_ATTRIBUTES_ACTIVATION_PRINCIPAL_INVALID',
        'Exact runtime catalog activator principal is required.');
    }
    const latest = (await client.query(
      `SELECT event_id,event_sequence,event_type,catalog_scope,
              catalog_revision_id,catalog_digest,import_id,
              import_audit_digest,record_registry_digest,
              runtime_contract_digest,compatible_world_revision_id,
              compatible_world_catalog_digest,
              compatible_world_pin_manifest_digest,request_digest,
              attestation_digest,expected_previous_event_id,
              runtime_release_id,operator_principal,event_digest
         FROM world_base.runtime_catalog_activation_events
        WHERE catalog_scope=$1 ORDER BY event_sequence DESC LIMIT 1`,
      [request.target_binding.catalog_scope])).rows[0] ?? null;
    let previousEvent = null;
    const replay = latest?.request_digest === request.request_digest;
    if (successor) {
      if (request.expected_previous_event == null) {
        if (latest && !replay) {
          fail('ACTIVATION_PREVIOUS_EVENT_STALE', 'Actor successor predecessor changed.');
        }
        const item = (await client.query(
          `SELECT catalog_revision_id,catalog_digest
             FROM world_base.runtime_catalog_activation_events
            WHERE catalog_scope='item_container_materialization_v2'
            ORDER BY event_sequence DESC LIMIT 1`)).rows[0];
        if (request.party_preflight.party_count !== 0
            || item?.catalog_revision_id !== request.import_request.parent_catalog.catalog_revision_id
            || item?.catalog_digest !== request.import_request.parent_catalog.catalog_digest) {
          fail('ACTOR_SUCCESSOR_FIRST_ACTIVATION_BLOCKED',
            'First actor activation requires no parties and the active parent item catalog.');
        }
      } else {
        previousEvent = replay ? (await client.query(
          `SELECT event_id,event_sequence FROM world_base.runtime_catalog_activation_events
            WHERE event_id=$1 AND catalog_scope=$2`,
          [request.expected_previous_event.event_id,
            request.target_binding.catalog_scope])).rows[0] ?? null : latest;
        if (!previousEvent || previousEvent.event_id !== request.expected_previous_event.event_id
            || Number(previousEvent.event_sequence) !== request.expected_previous_event.event_sequence) {
          fail('ACTIVATION_PREVIOUS_EVENT_STALE', 'Actor successor predecessor changed.');
        }
      }
    }
    const event = buildActivationEventFromVerifiedAttestation({
      request: eventRequest,
      attestationDigest: attestation.attestation_digest,
      previousEvent,
      operatorPrincipal: principal
    });
    if (latest && (!successor || replay)) {
      if (canonicalStringify(normalizeEvent(latest)) !==
          canonicalStringify(eventRow(event))) collision();
      return activationResult({ request, attestation, event });
    }
    await client.query(
      `INSERT INTO world_base.runtime_catalog_activation_events
        (event_id,event_sequence,event_type,catalog_scope,catalog_revision_id,
         catalog_digest,import_id,import_audit_digest,record_registry_digest,
         runtime_contract_digest,compatible_world_revision_id,
         compatible_world_catalog_digest,compatible_world_pin_manifest_digest,
         request_digest,attestation_digest,expected_previous_event_id,
         runtime_release_id,operator_principal,event_digest)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,
         $18,$19)`, Object.values(eventRow(event)));
    return activationResult({ request, attestation, event });
  });
}

export function validateActorBaseAttributesActivationResult({ result,
  request, attestation }) {
  validateApproval({ request, attestation });
  const event = buildActivationEventFromVerifiedAttestation({
    request: buildEventRequest({ request, attestation }),
    attestationDigest: attestation.attestation_digest,
    previousEvent: request.expected_previous_event ?? null,
    operatorPrincipal: ACTIVATOR
  });
  const expected = activationResult({ request, attestation, event });
  if (canonicalStringify(result) !== canonicalStringify(expected)) {
    fail('ACTOR_BASE_ATTRIBUTES_ACTIVATION_RESULT_INVALID',
      'Activation result differs from exact approved event.');
  }
  return true;
}

function buildEventRequest({ request, attestation }) {
  const binding = request.target_binding;
  return {
    catalog_scope: binding.catalog_scope,
    target_revision_id: binding.target_revision_id,
    target_catalog_digest: binding.target_catalog_digest,
    import_id: request.completed_import_readback.import_id,
    import_audit_digest: request.completed_import_readback.import_audit_digest,
    record_registry_digest: binding.record_registry_digest,
    runtime_contract_digest: binding.runtime_contract_digest,
    compatible_world_revision_id:
      binding.compatible_world.compatible_world_revision_id,
    compatible_world_catalog_digest:
      binding.compatible_world.compatible_world_catalog_digest,
    compatible_world_pin_manifest_digest:
      binding.compatible_world.compatible_world_pin_manifest_digest,
    activation_request_digest: request.request_digest,
    expected_previous_event_id: request.expected_previous_event?.event_id ?? null,
    runtime_release_id: digestEnvelope({
      schema: 'rus.actor_base_attributes_runtime_release.v1',
      activation_request_digest: request.request_digest,
      activation_attestation_digest: attestation.attestation_digest,
      activation_scope: request.activation_scope,
      runtime_capability: request.runtime_capability
    })
  };
}

async function assertActivationSource(client, request) {
  const binding = request.target_binding;
  const revision = (await client.query(
    `SELECT catalog_revision_id,catalog_scope,target_catalog_digest,
            compatible_world_revision_id,compatible_world_catalog_digest,
            compatible_world_pin_manifest_digest,record_registry_digest,
            runtime_contract_digest,status
       FROM world_base.domain_catalog_revisions
      WHERE catalog_revision_id=$1`, [binding.target_revision_id])).rows;
  const imported = (await client.query(
    `SELECT import_id,catalog_scope,target_revision_id,target_catalog_digest,
            compatible_world_revision_id,compatible_world_catalog_digest,
            compatible_world_pin_manifest_digest,record_registry_digest,
            import_audit_digest,approval_status
       FROM world_base.catalog_imports WHERE import_id=$1`,
    [request.completed_import_readback.import_id])).rows;
  const compatible = binding.compatible_world;
  if (revision.length !== 1 || imported.length !== 1
      || canonicalStringify(revision[0]) !== canonicalStringify({
        catalog_revision_id: binding.target_revision_id,
        catalog_scope: binding.catalog_scope,
        target_catalog_digest: binding.target_catalog_digest,
        compatible_world_revision_id: compatible.compatible_world_revision_id,
        compatible_world_catalog_digest:
          compatible.compatible_world_catalog_digest,
        compatible_world_pin_manifest_digest:
          compatible.compatible_world_pin_manifest_digest,
        record_registry_digest: binding.record_registry_digest,
        runtime_contract_digest: binding.runtime_contract_digest,
        status: 'approved'
      })
      || canonicalStringify(imported[0]) !== canonicalStringify({
        import_id: request.completed_import_readback.import_id,
        catalog_scope: binding.catalog_scope,
        target_revision_id: binding.target_revision_id,
        target_catalog_digest: binding.target_catalog_digest,
        compatible_world_revision_id: compatible.compatible_world_revision_id,
        compatible_world_catalog_digest:
          compatible.compatible_world_catalog_digest,
        compatible_world_pin_manifest_digest:
          compatible.compatible_world_pin_manifest_digest,
        record_registry_digest: binding.record_registry_digest,
        import_audit_digest:
          request.completed_import_readback.import_audit_digest,
        approval_status: 'approved'
      })) {
    fail('ACTOR_BASE_ATTRIBUTES_ACTIVATION_SOURCE_MISMATCH',
      'Exact imported actor catalog is unavailable.');
  }
}

function activationResult({ request, attestation, event }) {
  const successor = isActorBaseAttributesSuccessor(request);
  const payload = {
    schema: successor ? 'rus.actor_base_attributes_runtime_activation_result.v2'
      : 'rus.actor_base_attributes_runtime_activation_result.v1',
    status: 'activated_exact_readback_verified',
    activation_scope: request.activation_scope,
    runtime_capability: request.runtime_capability,
    activation_request_digest: request.request_digest,
    activation_attestation_digest: attestation.attestation_digest,
    event_id: event.event_id,
    event_sequence: event.event_sequence,
    event_digest: event.event_digest,
    catalog_revision_id: event.catalog_revision_id,
    catalog_digest: event.catalog_digest,
    import_id: event.import_id,
    import_audit_digest: event.import_audit_digest,
    profile_id: request.target_binding.profile_id,
    profile_digest: request.target_binding.profile_digest,
    activation_event_count: 1,
    runtime_authorized: true,
    activation_authorized: true,
    actor_base_attributes_runtime_selection_authorized: true,
    new_development_party_activation_authorized: !successor,
    import_authorized: false,
    production_authorized: successor,
    equipment_allocation_activation_authorized: false,
    functional_allocation_runtime_selection_authorized: false,
    runtime_item_creation_authorized: false,
    existing_party_migration_authorized: false,
    old_save_rematerialization_authorized: false,
    world_schema_migration_authorized: false,
    party_schema_migration_authorized: false,
    broader_m3_attested: false
  };
  return Object.freeze({ ...payload, result_digest: digestEnvelope(payload) });
}

function validateApproval(approval) {
  return isActorBaseAttributesSuccessor(approval.request)
    ? validateActorBaseAttributesSuccessorActivationApproval(approval)
    : validateActorBaseAttributesRuntimeActivationAttestation(approval);
}

function eventRow(event) {
  return {
    event_id: event.event_id,
    event_sequence: event.event_sequence,
    event_type: event.event_type,
    catalog_scope: event.catalog_scope,
    catalog_revision_id: event.catalog_revision_id,
    catalog_digest: event.catalog_digest,
    import_id: event.import_id,
    import_audit_digest: event.import_audit_digest,
    record_registry_digest: event.record_registry_digest,
    runtime_contract_digest: event.runtime_contract_digest,
    compatible_world_revision_id: event.compatible_world_revision_id,
    compatible_world_catalog_digest: event.compatible_world_catalog_digest,
    compatible_world_pin_manifest_digest:
      event.compatible_world_pin_manifest_digest,
    request_digest: event.request_digest,
    attestation_digest: event.attestation_digest,
    expected_previous_event_id: event.expected_previous_event_id,
    runtime_release_id: event.runtime_release_id,
    operator_principal: event.operator_principal,
    event_digest: event.event_digest
  };
}

function normalizeEvent(row) {
  return { ...row, event_sequence: Number(row.event_sequence) };
}

async function transaction(pool, operation) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

function collision() {
  fail('ACTOR_BASE_ATTRIBUTES_ACTIVATION_EVENT_COLLISION',
    'Existing actor activation differs from approved deterministic event.');
}
function fail(code, message) {
  throw Object.assign(new Error(message), { code });
}
