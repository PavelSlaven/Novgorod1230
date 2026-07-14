import { createHash } from 'node:crypto';
import { isCodeOwnedTurnWritePlan, TURN_ALLOWED_WRITE_TARGETS } from '@rus/turn';
import { executePhysicalWritePlan } from './sql-plan.js';

export async function executeOptionalTurnPlan(transaction, writePlan) {
  if (writePlan == null || Object.keys(writePlan).length === 0) return;
  if (!isCodeOwnedTurnWritePlan(writePlan)) throw repositoryError('TURN_WRITE_PLAN_NOT_CODE_OWNED', 'Repository accepts only an in-process code-owned sealed turn plan.');
  const forbidden = ['physical_write_plan', 'write_batches', 'target_schema', 'target_table'].some((key) => Object.hasOwn(writePlan, key));
  if (forbidden) throw repositoryError('TURN_WRITE_TARGET_FORBIDDEN', 'Turn plans cannot supply physical SQL targets.');
  const stateVersion = Number(writePlan.base_state_version) + 1;
  if (!Number.isInteger(stateVersion) || stateVersion <= 0) throw repositoryError('TURN_STATE_VERSION_INVALID', 'Turn write plan requires a valid base state version.');
  const party = await transaction.query('SELECT state_version FROM party_runtime.parties WHERE party_id=$1 FOR UPDATE', [writePlan.party_id]);
  if (party.rows.length !== 1 || Number(party.rows[0].state_version) !== writePlan.base_state_version) throw repositoryError('TURN_STATE_VERSION_STALE', 'Turn write plan base state version is stale.');
  const base = await transaction.query('SELECT state_payload FROM party_runtime.party_state_snapshots WHERE party_id=$1 AND state_version=$2', [writePlan.party_id, writePlan.base_state_version]);
  if (base.rows.length !== 1) throw repositoryError('TURN_BASE_SNAPSHOT_MISSING', 'Turn commit requires the exact full base snapshot.');
  const payload = applyLogicalOperations(base.rows[0].state_payload, writePlan.write_targets);
  const decisionBatches = buildTurnDecisionBatches(writePlan);
  await executePhysicalWritePlan(transaction, {
    transaction: { write_order: [...decisionBatches.map((batch) => batch.batch_id), 'turn_party_state_snapshot'] },
    write_batches: [...decisionBatches, { batch_id: 'turn_party_state_snapshot', target_schema: 'party_runtime', target_table: 'party_state_snapshots', operation_mode: 'insert_only', records: [{ party_id: writePlan.party_id, state_version: stateVersion, state_payload: payload, state_digest: digestRunIdentity(payload) }] }]
  });
  const advanced = await transaction.query('UPDATE party_runtime.parties SET state_version=$2, updated_at=NOW() WHERE party_id=$1 AND state_version=$3', [writePlan.party_id, stateVersion, writePlan.base_state_version]);
  if (advanced.rowCount !== 1) throw repositoryError('TURN_STATE_VERSION_STALE', 'Turn write plan lost the state-version race.');
}

function buildTurnDecisionBatches(writePlan) {
  const trace = writePlan.command_trace?.bounded_decision_trace;
  if (!trace) return [];
  const request = trace.request;
  const result = trace.result;
  if (request?.party_id !== writePlan.party_id || trace.validation_report?.pass !== true || !result || result.request_id !== request.request_id || result.state_version !== request.state_version) throw repositoryError('TURN_DECISION_TRACE_INVALID', 'Bounded turn decision trace is invalid or unbound.');
  return [
    { batch_id: 'turn-decision-request', target_schema: 'party_runtime', target_table: 'party_decision_requests', operation_mode: 'insert_only', records: [{ party_id: writePlan.party_id, request_id: request.request_id, policy_id: request.policy_id, policy_version: request.policy_version, actor_id: request.actor_id, state_version: request.state_version, issued_at: request.issued_at, expires_at: request.expires_at, options_digest: request.options_digest, idempotency_key: `decision:${writePlan.party_id}:${request.request_id}`, status: 'resolved', input_digest: digestRunIdentity(request), validation_report: trace.validation_report }] },
    { batch_id: 'turn-decision-options', target_schema: 'party_runtime', target_table: 'party_decision_options', operation_mode: 'insert_only', records: request.options.map((option) => ({ party_id: writePlan.party_id, request_id: request.request_id, option_id: option.option_id, command_id: option.command_id, command_token_digest: digestRunIdentity(option.command_token), ordinal: option.ordinal, metadata: { actor_id: option.actor_id, target_id: option.target_id, preconditions: option.preconditions, expected_cost: option.expected_cost, known_risks: option.known_risks, reason_visible_to_actor: option.reason_visible_to_actor, state_version: option.state_version, metadata: option.metadata } })) },
    { batch_id: 'turn-decision-result', target_schema: 'party_runtime', target_table: 'party_decision_results', operation_mode: 'insert_only', records: [{ party_id: writePlan.party_id, request_id: request.request_id, option_id: result.option_id, state_version: result.state_version, response_digest: result.response_digest }] }
  ];
}

export function digestRunIdentity(value) { return createHash('sha256').update(stableJson(value)).digest('hex'); }
export function applyLogicalOperations(state, operations) {
  const next = structuredClone(state ?? {});
  for (const operation of operations ?? []) {
    if (!operation || typeof operation.target !== 'string' || !TURN_ALLOWED_WRITE_TARGETS.includes(operation.target) || Object.keys(operation).some((key) => !['target', 'value'].includes(key))) throw repositoryError('AUTONOMOUS_OPERATION_INVALID', 'Autonomous change sets may contain only allowlisted logical target/value operations.');
    next[operation.target] = structuredClone(operation.value);
  }
  return next;
}
function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
function repositoryError(code, message) { return Object.assign(new Error(message), { code }); }
