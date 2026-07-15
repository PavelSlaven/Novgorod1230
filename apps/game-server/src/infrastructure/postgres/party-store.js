import { executePhysicalWritePlan } from './sql-plan.js';
import { computeMaterializationResultDigest } from '@rus/contracts';
import { applyLogicalOperations, digestRunIdentity, executeOptionalTurnPlan } from './party-store-turn.js';
import { isCodeOwnedAutonomousUpdate } from '@rus/turn';
import { writePerceptionCycle as writePerceptionCyclePersistence } from './perception-persistence.js';

const PARTY_RUNTIME_V2_TABLES = new Set([
  'party_materialization_runs', 'party_materialization_choices', 'party_g5_nodes', 'party_g5_anchors', 'party_g5_edges',
  'party_npcs', 'party_npc_traits', 'party_npc_relations', 'party_npc_knowledge', 'party_npc_schedules',
  'party_containers', 'party_items', 'party_item_placements', 'party_ownership', 'party_state_snapshots',
  'party_decision_requests', 'party_decision_options', 'party_decision_results', 'party_change_sets', 'party_autonomous_updates'
]);

export function createPostgresPartyStore({ pool, catalogBundleLoader, materializerVersion = 'code_materializer_v2', rngVersion = 'mulberry32_v1', decisionSecret = null, decisionPreconditionEvaluator = null } = {}) {
  requirePool(pool);
  if (typeof catalogBundleLoader !== 'function') throw new TypeError('catalogBundleLoader is required.');
  const transact = async (callback) => {
    if (typeof callback !== 'function') throw new TypeError('transaction callback is required.');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally { client.release(); }
  };
  return Object.freeze({
    transact,

    async loadCommittedBaseline({ partyId, g4Id, transaction }) {
      requireTransaction(transaction);
      const lockKey = `party:${requiredText(partyId, 'partyId')}:g4:${requiredText(g4Id, 'g4Id')}`;
      await transaction.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [lockKey]);
      const { rows } = await transaction.query(`SELECT run_id, seed_digest, input_digest, catalog_digest
        FROM party_runtime.party_materialization_runs
        WHERE party_id=$1 AND g4_id=$2 AND run_kind='baseline' AND status='committed'
        ORDER BY committed_at NULLS LAST, created_at LIMIT 1`, [partyId, g4Id]);
      return rows[0] ?? null;
    },

    async buildMaterializationRequest({ partyId, g4Id, trigger, transaction }) {
      requireTransaction(transaction);
      const party = await transaction.query(`SELECT party_id, schema_version, world_revision_id, world_catalog_digest,
          materializer_version, rng_version, command_catalog_digest, profile_bundle_digest, state_version
        FROM party_runtime.parties WHERE party_id=$1 FOR UPDATE`, [partyId]);
      if (party.rows.length !== 1 || Number(party.rows[0].schema_version) !== 2) throw repositoryError('PARTY_RUNTIME_V2_REQUIRED', 'First-entry materialization requires a committed party_runtime_v2 party.');
      if (party.rows[0].materializer_version !== materializerVersion || party.rows[0].rng_version !== rngVersion) throw repositoryError('MATERIALIZER_VERSION_PIN_MISMATCH', 'Party materializer/RNG pins are not supported by this runtime.');
      const catalog = await catalogBundleLoader({ party: structuredClone(party.rows[0]), g4_id: g4Id, trigger, transaction });
      if (!catalog || catalog.world_revision_id !== party.rows[0].world_revision_id || catalog.catalog_digest !== party.rows[0].world_catalog_digest || !catalog.historical_frame || typeof catalog.historical_frame !== 'object' || typeof catalog.region_id !== 'string' || !catalog.region_id.trim() || typeof catalog.g1_id !== 'string' || !catalog.g1_id.trim() || !Array.isArray(catalog.catalog_bundle?.rules) || !Array.isArray(catalog.catalog_bundle?.candidates) || typeof catalog.catalog_bundle?.player_start_anchor_slot_key !== 'string' || !catalog.catalog_bundle.player_start_anchor_slot_key.trim()) {
        throw repositoryError('MATERIALIZATION_CATALOG_INVALID', 'Catalog bundle must match the party version pins.');
      }
      const occurrenceResult = await transaction.query('SELECT count(*)::int AS count FROM party_runtime.party_materialization_runs WHERE party_id=$1 AND g4_id=$2', [partyId, g4Id]);
      const occurrence = Number(occurrenceResult.rows[0].count);
      const runId = `baseline_${digestRunIdentity([partyId, g4Id, trigger, occurrence, party.rows[0].world_revision_id]).slice(0, 24)}`;
      const positionResult = await transaction.query('SELECT position_kind,g4_id,g5_node_id,g5_anchor_id,journey_id,journey_leg_id,edge_id,from_g4_id,to_g4_id,progress_permille,last_confirmed_g4_id,last_route_id,updated_at FROM party_runtime.party_positions WHERE party_id=$1', [partyId]);
      const snapshotResult = await transaction.query('SELECT state_version,state_digest FROM party_runtime.party_state_snapshots WHERE party_id=$1 ORDER BY state_version DESC LIMIT 1', [partyId]);
      const seedContext = {
        party_id: partyId,
        world_revision_id: party.rows[0].world_revision_id,
        g1_id: catalog.g1_id,
        g4_id: g4Id,
        trigger,
        occurrence,
        materializer_version: party.rows[0].materializer_version,
        rng_algorithm_id: party.rows[0].rng_version
      };
      return Object.freeze({
        version: 2, schema: 'world_materialization_request_v2', party_id: partyId, run_id: runId,
        world_revision_id: party.rows[0].world_revision_id, region_id: catalog.region_id, historical_frame: structuredClone(catalog.historical_frame), g1_id: catalog.g1_id, g4_id: g4Id, trigger, occurrence,
        materializer_version: party.rows[0].materializer_version, rng_algorithm_id: party.rows[0].rng_version, seed_context: seedContext,
        existing_party_state: { state_version: Number(party.rows[0].state_version), current_position: positionResult.rows[0] ?? null, latest_snapshot: snapshotResult.rows[0] ?? null, baseline_exists: false },
        catalog_digest: catalog.catalog_digest, catalog_bundle: structuredClone(catalog.catalog_bundle)
      });
    },

    async commitMovement({ partyId, g4Id, writePlan, baselineRunId, idempotencyKey }, { transaction } = {}) {
      requireTransaction(transaction);
      const replay = await claimTurnCommit(transaction, { partyId, idempotencyKey, writePlan, g4Id });
      if (replay) return replay;
      await executeOptionalTurnPlan(transaction, writePlan);
      await upsertPosition(transaction, partyId, g4Id, writePlan?.destination_position);
      return finishTurnCommit(transaction, idempotencyKey, { committed: true, materialized: false, baseline_run_id: baselineRunId });
    },

    async commitMaterializationAndMovement({ partyId, g4Id, materialization, writePlan, idempotencyKey }, { transaction } = {}) {
      requireTransaction(transaction);
      const plan = normalizeMaterializationPlan(materialization);
      const identity = validateMaterializationIdentity({ partyId, g4Id, materialization, plan, position: writePlan?.destination_position ?? materialization.player_start_position });
      const replay = await claimTurnCommit(transaction, { partyId, idempotencyKey, writePlan, g4Id });
      if (replay) return replay;
      await executePhysicalWritePlan(transaction, plan);
      await executeOptionalTurnPlan(transaction, writePlan);
      await upsertPosition(transaction, partyId, g4Id, writePlan?.destination_position ?? materialization.player_start_position);
      return finishTurnCommit(transaction, idempotencyKey, { committed: true, materialized: true, baseline_run_id: identity.runId });
    },

    async commitMaterializationRepair({ partyId, g4Id, previousRunId, previousResultDigest, materialization, idempotencyKey }) {
      return transact(async (transaction) => {
        const plan = normalizeMaterializationPlan(materialization);
        const identity = validateMaterializationIdentity({ partyId, g4Id, materialization, plan, position: null });
        if (computeMaterializationResultDigest(materialization) !== materialization?.trace?.result_digest) throw repositoryError('MATERIALIZATION_REPAIR_RESULT_TAMPERED', 'Repair result does not match its code-generated result digest.');
        const repair = materialization?.trace?.repair;
        if (!repair || repair.previous_run_id !== previousRunId || repair.previous_result_digest !== previousResultDigest) throw repositoryError('MATERIALIZATION_REPAIR_IDENTITY_MISMATCH', 'Repair trace is not bound to the persisted previous run.');
        const previous = await transaction.query(`SELECT r.result_digest,p.world_revision_id,r.materializer_version,r.rng_version,r.status
          FROM party_runtime.party_materialization_runs r
          JOIN party_runtime.parties p USING (party_id)
          WHERE r.party_id=$1 AND r.run_id=$2 AND r.g4_id=$3 FOR UPDATE`, [partyId, previousRunId, g4Id]);
        const row = previous.rows[0];
        if (!row || row.status !== 'committed' || row.result_digest !== previousResultDigest || row.world_revision_id !== materialization.trace.world_revision_id || row.materializer_version !== materialization.trace.materializer_version || row.rng_version !== materialization.trace.rng_version) throw repositoryError('MATERIALIZATION_REPAIR_PREVIOUS_RUN_MISMATCH', 'Persisted previous run or version pins do not match the repair request.');
        const runRecord = plan.write_batches.find((batch) => batch.target_table === 'party_materialization_runs')?.records?.[0];
        if (runRecord?.run_kind !== 'repair' || runRecord.supersedes_run_id !== previousRunId || runRecord.result_digest !== materialization.trace.result_digest) throw repositoryError('MATERIALIZATION_REPAIR_PLAN_INVALID', 'Repair write set does not preserve run history and result digest.');
        const replay = await claimTurnCommit(transaction, { partyId, idempotencyKey, writePlan: materialization, g4Id });
        if (replay) return replay;
        await executePhysicalWritePlan(transaction, plan);
        return finishTurnCommit(transaction, idempotencyKey, { committed: true, repaired: true, previous_run_id: previousRunId, repair_run_id: identity.runId });
      });
    },

    async commit(writePlan, { idempotencyKey } = {}) {
      return transact(async (transaction) => {
        const partyId = requiredText(writePlan?.party_id, 'writePlan.party_id');
        const replay = await claimTurnCommit(transaction, { partyId, idempotencyKey, writePlan, g4Id: writePlan?.destination_position?.g4_id ?? 'none' });
        if (replay) return replay;
        if (writePlan.perception_cycle) await writePerceptionCycle(transaction, { cycle: writePlan.perception_cycle, pins: writePlan.perception_pins, reactionDecisions: writePlan.perception_reaction_decisions, decisionSecret, decisionPreconditionEvaluator });
        await executeOptionalTurnPlan(transaction, writePlan);
        return finishTurnCommit(transaction, idempotencyKey, { committed: true, idempotency_key: idempotencyKey });
      });
    },

    async commitPerceptionCycle({ cycle, pins, reactionDecisions = [] }) {
      return transact(async (transaction) => {
        const result = await writePerceptionCycle(transaction, { cycle, pins, reactionDecisions, decisionSecret, decisionPreconditionEvaluator });
        return Object.freeze({ committed: true, ...result });
      });
    },

    async commitAutonomousUpdate(update) {
      if (!isCodeOwnedAutonomousUpdate(update)) throw repositoryError('AUTONOMOUS_UPDATE_NOT_CODE_OWNED', 'Repository accepts only an in-process code-owned autonomous update.');
      return transact(async (transaction) => {
        const partyId = requiredText(update?.party_id, 'update.party_id');
        const replay = await claimTurnCommit(transaction, { partyId, idempotencyKey: update.idempotency_key, writePlan: update, g4Id: 'autonomous' });
        if (replay) return replay;
        const changeSet = update.change_set;
        if (changeSet?.base_state_version !== update.base_state_version || changeSet?.result_state_version !== update.result_state_version || changeSet?.party_id !== partyId || changeSet?.idempotency_key !== update.idempotency_key || changeSet?.input_digest !== update.input_digest || changeSet?.catalog_digest !== update.catalog_digest || digestRunIdentity(update.trace?.input_basis) !== update.input_digest || changeSet?.validation_report?.pass !== true || update.validation_report?.pass !== true) throw repositoryError('AUTONOMOUS_UPDATE_INVALID', 'Autonomous update and change set bindings are invalid.');
        const party = await transaction.query('SELECT state_version,world_revision_id,world_catalog_digest,command_catalog_digest,profile_bundle_digest FROM party_runtime.parties WHERE party_id=$1 FOR UPDATE', [partyId]);
        if (party.rows.length !== 1) throw repositoryError('AUTONOMOUS_PARTY_NOT_FOUND', 'Autonomous update party does not exist.');
        const pins = update.version_pins;
        if (!pins || pins.world_revision_id !== party.rows[0].world_revision_id || update.catalog_digest !== party.rows[0].world_catalog_digest || pins.command_catalog_digest !== party.rows[0].command_catalog_digest || pins.profile_bundle_digest !== party.rows[0].profile_bundle_digest || JSON.stringify(pins) !== JSON.stringify(changeSet.version_pins)) throw repositoryError('AUTONOMOUS_VERSION_PINS_MISMATCH', 'Autonomous update version/catalog pins do not match the party.');
        if (Number(party.rows[0].state_version) !== update.base_state_version) throw repositoryError('AUTONOMOUS_STATE_STALE', 'Autonomous update base state version is stale.');
        const latest = await transaction.query('SELECT state_payload FROM party_runtime.party_state_snapshots WHERE party_id=$1 AND state_version=$2', [partyId, update.base_state_version]);
        if (latest.rows.length !== 1) throw repositoryError('AUTONOMOUS_BASE_SNAPSHOT_MISSING', 'Autonomous update requires the exact base snapshot.');
        const persistedInputState = { ...structuredClone(latest.rows[0].state_payload ?? {}), state_version: update.base_state_version };
        if (digestRunIdentity(persistedInputState) !== digestRunIdentity(update.trace?.input_basis?.base_state)) throw repositoryError('AUTONOMOUS_BASE_SNAPSHOT_MISMATCH', 'Autonomous input digest is not bound to the persisted base snapshot.');
        const nextPayload = applyLogicalOperations(latest.rows[0].state_payload, changeSet.operations);
        const plan = { transaction: { write_order: ['autonomous-change-set', 'autonomous-update', 'autonomous-snapshot'] }, write_batches: [
          { batch_id: 'autonomous-change-set', target_schema: 'party_runtime', target_table: 'party_change_sets', operation_mode: 'insert_only', records: [{ party_id: partyId, change_set_id: changeSet.change_set_id, idempotency_key: update.idempotency_key, rule_id: update.rule_id, rule_version: pins.rule_version, policy_id: pins.policy_id, policy_version: pins.policy_version, world_revision_id: pins.world_revision_id, catalog_digest: update.catalog_digest, command_catalog_digest: pins.command_catalog_digest, profile_bundle_digest: pins.profile_bundle_digest, input_digest: update.input_digest, base_state_version: changeSet.base_state_version, result_state_version: changeSet.result_state_version, source_kind: 'autonomous_rule', operations: changeSet.operations, validation_report: changeSet.validation_report, created_or_changed_refs: changeSet.created_or_changed_refs, trace: changeSet.trace }] },
          { batch_id: 'autonomous-update', target_schema: 'party_runtime', target_table: 'party_autonomous_updates', operation_mode: 'insert_only', records: [{ party_id: partyId, update_id: update.update_id, rule_id: update.rule_id, rule_version: pins.rule_version, policy_id: pins.policy_id, policy_version: pins.policy_version, world_revision_id: pins.world_revision_id, catalog_digest: update.catalog_digest, command_catalog_digest: pins.command_catalog_digest, profile_bundle_digest: pins.profile_bundle_digest, input_digest: update.input_digest, change_set_id: changeSet.change_set_id, idempotency_key: update.idempotency_key, base_state_version: update.base_state_version, result_state_version: update.result_state_version, scheduled_for: update.scheduled_for, status: 'committed', validation_report: update.validation_report, created_or_changed_refs: update.created_or_changed_refs, trace: update.trace }] },
          { batch_id: 'autonomous-snapshot', target_schema: 'party_runtime', target_table: 'party_state_snapshots', operation_mode: 'insert_only', records: [{ party_id: partyId, state_version: update.result_state_version, state_payload: nextPayload, state_digest: digestRunIdentity(nextPayload) }] }
        ] };
        await executePhysicalWritePlan(transaction, plan);
        const advanced = await transaction.query('UPDATE party_runtime.parties SET state_version=$2, updated_at=NOW() WHERE party_id=$1 AND state_version=$3', [partyId, update.result_state_version, update.base_state_version]);
        if (advanced.rowCount !== 1) throw repositoryError('AUTONOMOUS_STATE_STALE', 'Autonomous update lost the state-version race.');
        return finishTurnCommit(transaction, update.idempotency_key, { committed: true, autonomous_update_id: update.update_id, result_state_version: changeSet.result_state_version });
      });
    }
  });
}

async function writePerceptionCycle(transaction, { cycle, pins, reactionDecisions = [], decisionSecret = null, decisionPreconditionEvaluator = null }) {
  return writePerceptionCyclePersistence(transaction, { cycle, pins, reactionDecisions, decisionSecret, decisionPreconditionEvaluator, errorFactory: repositoryError });
}

function validateMaterializationIdentity({ partyId, g4Id, materialization, plan, position }) {
  const expectedPartyId = requiredText(partyId, 'partyId');
  const expectedG4Id = requiredText(g4Id, 'g4Id');
  const actualPartyId = materialization?.party_id ?? materialization?.materialization_run?.seed_context?.party_id;
  const actualG4Id = materialization?.g4_id ?? materialization?.parent_location?.g4_node_id ?? materialization?.materialization_run?.seed_context?.g4_id;
  const runId = materialization?.run_id ?? materialization?.materialization_run?.run_id;
  if (actualPartyId !== expectedPartyId || actualG4Id !== expectedG4Id || !runId) throw repositoryError('MATERIALIZATION_IDENTITY_MISMATCH', 'Materialization party, G4 and run identity must match the requested transition.');
  const nodeIds = new Set();
  const anchorIds = new Set();
  let runRows = 0;
  for (const batch of plan.write_batches) for (const record of batch.records ?? []) {
    if (record.party_id != null && record.party_id !== expectedPartyId) throw repositoryError('MATERIALIZATION_IDENTITY_MISMATCH', `Batch ${batch.batch_id} contains a record for another party.`);
    if (record.run_id != null && record.run_id !== runId) throw repositoryError('MATERIALIZATION_IDENTITY_MISMATCH', `Batch ${batch.batch_id} contains another materialization run.`);
    for (const key of ['g4_id', 'parent_g4_id']) if (record[key] != null && record[key] !== expectedG4Id) throw repositoryError('MATERIALIZATION_IDENTITY_MISMATCH', `Batch ${batch.batch_id} contains another G4 identity.`);
    if (batch.target_table === 'party_materialization_runs') runRows += 1;
    if (batch.target_table === 'party_g5_nodes') nodeIds.add(record.g5_node_id);
    if (batch.target_table === 'party_g5_anchors') anchorIds.add(record.anchor_id);
  }
  if (runRows !== 1) throw repositoryError('MATERIALIZATION_IDENTITY_MISMATCH', 'Materialization write set must contain exactly one matching run record.');
  const positionNode = position?.g5_node_id ?? position?.minilocation_id;
  const positionAnchor = position?.g5_anchor_id ?? position?.anchor_id;
  if ((positionNode && !nodeIds.has(positionNode)) || (positionAnchor && !anchorIds.has(positionAnchor))) throw repositoryError('MATERIALIZATION_IDENTITY_MISMATCH', 'Destination position must belong to the same materialization write set.');
  return { runId, materializationDigest: digestRunIdentity(materialization) };
}

async function claimTurnCommit(transaction, { partyId, idempotencyKey, writePlan, g4Id }) {
  const key = requiredText(idempotencyKey, 'idempotencyKey');
  const payloadHash = digestRunIdentity({ party_id: partyId, g4_id: g4Id });
  const planDigest = digestRunIdentity(writePlan ?? {});
  const existing = await transaction.query('SELECT payload_hash,physical_plan_digest,status,committed_result FROM party_runtime.commit_idempotency WHERE idempotency_key=$1 FOR UPDATE', [key]);
  if (existing.rows[0]) return resolveExistingCommit(existing.rows[0], payloadHash, planDigest);
  const inserted = await transaction.query(`INSERT INTO party_runtime.commit_idempotency
    (idempotency_key,request_id,payload_hash,physical_plan_digest,status,committed_result)
    VALUES ($1,$2,$3,$4,'pending',NULL) ON CONFLICT (idempotency_key) DO NOTHING RETURNING idempotency_key`, [key, key, payloadHash, planDigest]);
  if (inserted.rows?.length === 1) return null;
  const raced = await transaction.query('SELECT payload_hash,physical_plan_digest,status,committed_result FROM party_runtime.commit_idempotency WHERE idempotency_key=$1 FOR UPDATE', [key]);
  return resolveExistingCommit(raced.rows[0], payloadHash, planDigest);
}

function resolveExistingCommit(row, payloadHash, planDigest) {
  if (!row || row.payload_hash !== payloadHash || row.physical_plan_digest !== planDigest) throw repositoryError('TURN_IDEMPOTENCY_CONFLICT', 'Idempotency key is already bound to another turn payload or write plan.');
  if (row.status === 'committed') return Object.freeze({ ...structuredClone(row.committed_result), replayed: true });
  throw repositoryError('TURN_IDEMPOTENCY_IN_PROGRESS', 'The same turn commit is already in progress.');
}

async function finishTurnCommit(transaction, idempotencyKey, result) {
  await transaction.query(`UPDATE party_runtime.commit_idempotency SET status='committed', committed_result=$2, updated_at=NOW() WHERE idempotency_key=$1`, [idempotencyKey, result]);
  return result;
}

function normalizeMaterializationPlan(materialization) {
  const plan = materialization?.physical_write_plan ?? materialization?.proposed_write_set;
  if (!plan || !Array.isArray(plan.write_batches) || !Array.isArray(plan.transaction?.write_order)) throw repositoryError('MATERIALIZATION_WRITE_PLAN_REQUIRED', 'Materializer must return an executable normalized write plan.');
  for (const batch of plan.write_batches) {
    if (!PARTY_RUNTIME_V2_TABLES.has(batch.target_table) || batch.target_schema !== 'party_runtime' || batch.operation_mode !== 'insert_only') throw repositoryError('MATERIALIZATION_WRITE_TARGET_FORBIDDEN', `Forbidden materialization target ${batch.target_schema}.${batch.target_table}.`);
  }
  return plan;
}

async function upsertPosition(transaction, partyId, g4Id, position = {}) {
  const positionKind = position?.position_kind ?? 'node';
  const nodeId = position?.g5_node_id ?? position?.minilocation_id ?? null;
  const anchorId = position?.g5_anchor_id ?? position?.anchor_id ?? null;
  if ((nodeId == null) !== (anchorId == null)) throw repositoryError('POSITION_G5_PAIR_INVALID', 'G5 node and anchor must be supplied together or both omitted.');
  if (positionKind !== 'node') throw repositoryError('POSITION_KIND_UNSUPPORTED', 'Generic movement commit accepts only stationary node positions.');
  await transaction.query(`INSERT INTO party_runtime.party_positions (party_id,position_kind,g4_id,g5_node_id,g5_anchor_id,journey_id,journey_leg_id,edge_id,from_g4_id,to_g4_id,progress_permille,last_confirmed_g4_id,last_route_id,updated_at)
    VALUES ($1,'node',$2,$3,$4,NULL,NULL,NULL,NULL,NULL,NULL,NULL,$5,NOW()) ON CONFLICT (party_id) DO UPDATE SET position_kind=EXCLUDED.position_kind,
      g4_id=EXCLUDED.g4_id,g5_node_id=EXCLUDED.g5_node_id,g5_anchor_id=EXCLUDED.g5_anchor_id,journey_id=NULL,journey_leg_id=NULL,edge_id=NULL,
      from_g4_id=NULL,to_g4_id=NULL,progress_permille=NULL,last_confirmed_g4_id=NULL,last_route_id=EXCLUDED.last_route_id,updated_at=NOW()`,
  [partyId, g4Id, nodeId, anchorId, position?.last_route_id ?? null]);
}

function requirePool(pool) { if (!pool || typeof pool.connect !== 'function') throw new TypeError('PostgreSQL pool is required.'); }
function requireTransaction(transaction) { if (!transaction || typeof transaction.query !== 'function') throw new TypeError('Active PostgreSQL transaction is required.'); }
function requiredText(value, label) { const text = String(value ?? '').trim(); if (!text) throw new TypeError(`${label} is required.`); return text; }
function repositoryError(code, message) { return Object.assign(new Error(message), { code }); }
