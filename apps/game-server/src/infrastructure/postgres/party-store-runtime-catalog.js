const PARTY_RUNTIME_V2_TABLES = new Set([
  'party_materialization_runs',
  'party_materialization_run_catalog_pins',
  'party_materialization_choices',
  'party_g5_nodes',
  'party_g5_anchors',
  'party_g5_edges',
  'party_npcs',
  'party_npc_traits',
  'party_npc_relations',
  'party_npc_knowledge',
  'party_npc_schedules',
  'party_containers',
  'party_items',
  'party_item_placements',
  'party_ownership',
  'party_state_snapshots',
  'party_decision_requests',
  'party_decision_options',
  'party_decision_results',
  'party_change_sets',
  'party_autonomous_updates'
]);

export function normalizeMaterializationPlan(materialization) {
  const plan = materialization?.physical_write_plan ?? materialization?.proposed_write_set;
  if (!plan || !Array.isArray(plan.write_batches)
      || !Array.isArray(plan.transaction?.write_order)) {
    fail(
      'MATERIALIZATION_WRITE_PLAN_REQUIRED',
      'Materializer must return an executable normalized write plan.'
    );
  }
  for (const batch of plan.write_batches) {
    if (!PARTY_RUNTIME_V2_TABLES.has(batch.target_table)
        || batch.target_schema !== 'party_runtime'
        || batch.operation_mode !== 'insert_only') {
      fail(
        'MATERIALIZATION_WRITE_TARGET_FORBIDDEN',
        `Forbidden materialization target ${batch.target_schema}.${batch.target_table}.`
      );
    }
  }
  return plan;
}

export async function loadPartyDomainPin(transaction, partyId, lockedParty = null) {
  const party = lockedParty ?? (await transaction.query(
    `SELECT party_id, world_revision_id, world_catalog_digest
     FROM party_runtime.parties
     WHERE party_id=$1
     FOR UPDATE`,
    [requiredText(partyId, 'partyId')]
  )).rows[0];
  if (!party) {
    fail(
      'PARTY_CATALOG_PIN_MISSING',
      'Party does not exist or has no item/container domain pin.'
    );
  }
  const result = await transaction.query(
    `SELECT catalog_scope, catalog_revision_id, catalog_digest, import_id,
            import_audit_digest, record_registry_digest, runtime_contract_digest,
            compatible_world_revision_id, compatible_world_catalog_digest,
            compatible_world_pin_manifest_digest, activation_event_id
     FROM party_runtime.party_catalog_pins
     WHERE party_id=$1 AND catalog_scope='item_container_materialization_v2'`,
    [party.party_id]
  );
  const row = result.rows[0];
  if (!row?.catalog_revision_id) {
    fail('PARTY_CATALOG_PIN_MISSING', 'Party has no item/container domain pin.');
  }
  if (row.catalog_scope !== 'item_container_materialization_v2'
      || row.compatible_world_revision_id !== party.world_revision_id
      || row.compatible_world_catalog_digest !== party.world_catalog_digest) {
    fail(
      'PARTY_CATALOG_PIN_MISMATCH',
      'Party domain pin is incompatible with its persisted world tuple.'
    );
  }
  return Object.freeze({
    schema: 'rus.runtime_catalog_pin.v2',
    catalog_scope: row.catalog_scope,
    catalog_revision_id: row.catalog_revision_id,
    catalog_digest: row.catalog_digest,
    import_id: row.import_id,
    import_audit_digest: row.import_audit_digest,
    record_registry_digest: row.record_registry_digest,
    runtime_contract_digest: row.runtime_contract_digest,
    compatible_world_revision_id: row.compatible_world_revision_id,
    compatible_world_catalog_digest: row.compatible_world_catalog_digest,
    compatible_world_pin_manifest_digest: row.compatible_world_pin_manifest_digest,
    activation_event_id: row.activation_event_id
  });
}

export function attachMaterializationRunCatalogPin({
  plan,
  materialization,
  identity,
  domainPin
}) {
  if (plan.write_batches.some(
    (batch) => batch.target_table === 'party_materialization_run_catalog_pins'
  )) {
    fail(
      'MATERIALIZATION_RUN_CATALOG_PIN_FORGED',
      'Materializer output cannot supply its own persisted catalog pin.'
    );
  }
  const runBatch = plan.write_batches.find(
    (batch) => batch.target_table === 'party_materialization_runs'
  );
  const runRecord = runBatch?.records?.[0];
  if (runRecord?.catalog_digest !== domainPin.catalog_digest
      || materialization?.trace?.catalog_digest !== domainPin.catalog_digest
      || materialization?.trace?.world_revision_id
        !== domainPin.compatible_world_revision_id) {
    fail(
      'PARTY_CATALOG_PIN_MISMATCH',
      'Materialization run is not bound to the persisted party domain pin.'
    );
  }
  const pinBatchId = 'materialization_party_materialization_run_catalog_pins';
  if (plan.write_batches.some((batch) => batch.batch_id === pinBatchId)) {
    fail(
      'MATERIALIZATION_RUN_CATALOG_PIN_FORGED',
      'Materialization plan reserves the runtime-owned catalog pin batch id.'
    );
  }
  const normalized = structuredClone(plan);
  const runBatchIndex = normalized.write_batches.findIndex(
    (batch) => batch.batch_id === runBatch.batch_id
  );
  const runOrderIndex = normalized.transaction.write_order.indexOf(runBatch.batch_id);
  if (runBatchIndex < 0 || runOrderIndex < 0) {
    fail(
      'MATERIALIZATION_WRITE_PLAN_REQUIRED',
      'Materialization run batch must be present in write order.'
    );
  }
  normalized.write_batches.splice(runBatchIndex + 1, 0, {
    batch_id: pinBatchId,
    target_schema: 'party_runtime',
    target_table: 'party_materialization_run_catalog_pins',
    operation_mode: 'insert_only',
    records: [{
      party_id: runRecord.party_id,
      run_id: identity.runId,
      catalog_scope: domainPin.catalog_scope,
      catalog_revision_id: domainPin.catalog_revision_id,
      catalog_digest: domainPin.catalog_digest,
      import_id: domainPin.import_id,
      import_audit_digest: domainPin.import_audit_digest,
      record_registry_digest: domainPin.record_registry_digest,
      runtime_contract_digest: domainPin.runtime_contract_digest,
      activation_event_id: domainPin.activation_event_id
    }]
  });
  normalized.transaction.write_order.splice(runOrderIndex + 1, 0, pinBatchId);
  return normalized;
}

function requiredText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new TypeError(`${label} is required.`);
  return text;
}

function fail(code, message) {
  throw Object.assign(new Error(message), { code });
}
