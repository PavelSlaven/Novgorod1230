import { createHash } from 'node:crypto';
import { isCodeOwnedTurnWritePlan, TURN_ALLOWED_WRITE_TARGETS } from '@rus/turn';
import { executePhysicalWritePlan } from './sql-plan.js';

const NORMALIZED_TRAVEL_TARGETS = new Set(['party_journeys', 'party_journey_legs', 'party_current_position']);

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
  const travel = buildTravelPersistencePlan(writePlan.write_targets, { party_id: writePlan.party_id, base_state_version: writePlan.base_state_version });
  const payload = applyLogicalOperations(base.rows[0].state_payload, writePlan.write_targets);
  const decisionBatches = buildTurnDecisionBatches(writePlan);
  if (travel) await persistTravelChangeSet(transaction, travel);
  await executePhysicalWritePlan(transaction, {
    transaction: { write_order: [...decisionBatches.map((batch) => batch.batch_id), 'turn_party_state_snapshot'] },
    write_batches: [...decisionBatches, { batch_id: 'turn_party_state_snapshot', target_schema: 'party_runtime', target_table: 'party_state_snapshots', operation_mode: 'insert_only', records: [{ party_id: writePlan.party_id, state_version: stateVersion, state_payload: payload, state_digest: digestRunIdentity(payload) }] }]
  });
  const advanced = await transaction.query('UPDATE party_runtime.parties SET state_version=$2, updated_at=NOW() WHERE party_id=$1 AND state_version=$3', [writePlan.party_id, stateVersion, writePlan.base_state_version]);
  if (advanced.rowCount !== 1) throw repositoryError('TURN_STATE_VERSION_STALE', 'Turn write plan lost the state-version race.');
}

export function buildTravelPersistencePlan(writeTargets, { party_id, base_state_version } = {}) {
  const relevant = (writeTargets ?? []).filter((entry) => ['party_journeys', 'party_journey_legs', 'party_current_position'].includes(entry?.target));
  if (relevant.length === 0) return null;
  const expected = ['party_journeys', 'party_journey_legs', 'party_current_position'];
  if (relevant.length !== expected.length || new Set(relevant.map((entry) => entry.target)).size !== expected.length) throw repositoryError('TRAVEL_WRITE_SET_INCOMPLETE', 'Travel persistence requires exactly one journey, legs and position write target.');
  const byTarget = new Map(relevant.map((entry) => [entry.target, entry.value]));
  const journey = requiredObject(byTarget.get('party_journeys'), 'party_journeys');
  const legs = requiredArray(byTarget.get('party_journey_legs'), 'party_journey_legs');
  const position = requiredObject(byTarget.get('party_current_position'), 'party_current_position');
  if (journey.party_id !== party_id || !Number.isInteger(base_state_version) || journey.state_version !== base_state_version) throw repositoryError('TRAVEL_STATE_VERSION_MISMATCH', 'Travel journey must be bound to the exact party and base state version.');
  if (digestRunIdentity(journey.legs) !== digestRunIdentity(legs) || digestRunIdentity(journey.actual_position) !== digestRunIdentity(position)) throw repositoryError('TRAVEL_WRITE_SET_MISMATCH', 'Travel journey, legs and actual position must be one immutable change set.');
  validateJourneyRecord(journey);
  for (const leg of legs) validateJourneyLeg(leg, journey);
  validateTravelPosition(position, journey);
  return Object.freeze({ party_id, base_state_version, next_state_version: base_state_version + 1, journey: structuredClone(journey), legs: structuredClone(legs), position: structuredClone(position) });
}

export async function persistTravelChangeSet(transaction, plan) {
  const journey = plan.journey;
  await transaction.query(`INSERT INTO party_runtime.party_journeys
    (party_id,journey_id,actor_id,status,mode,origin_g4_id,target_ref,intended_direction,pace_profile_id,movement_method,current_leg_id,elapsed_minutes,actual_position_state,perceived_position_state,orientation_confidence,deviation_level,started_at,updated_at,world_revision_id,travel_rules_digest,environment_catalog_digest,algorithm_version,rng_version,state_version,idempotency_key)
    VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12,$13::jsonb,$14::jsonb,$15,$16,$17::timestamptz,$18::timestamptz,$19,$20,$21,$22,$23,$24,$25)
    ON CONFLICT (party_id,journey_id) DO UPDATE SET actor_id=EXCLUDED.actor_id,status=EXCLUDED.status,mode=EXCLUDED.mode,origin_g4_id=EXCLUDED.origin_g4_id,target_ref=EXCLUDED.target_ref,intended_direction=EXCLUDED.intended_direction,pace_profile_id=EXCLUDED.pace_profile_id,movement_method=EXCLUDED.movement_method,current_leg_id=EXCLUDED.current_leg_id,elapsed_minutes=EXCLUDED.elapsed_minutes,actual_position_state=EXCLUDED.actual_position_state,perceived_position_state=EXCLUDED.perceived_position_state,orientation_confidence=EXCLUDED.orientation_confidence,deviation_level=EXCLUDED.deviation_level,updated_at=EXCLUDED.updated_at,world_revision_id=EXCLUDED.world_revision_id,travel_rules_digest=EXCLUDED.travel_rules_digest,environment_catalog_digest=EXCLUDED.environment_catalog_digest,algorithm_version=EXCLUDED.algorithm_version,rng_version=EXCLUDED.rng_version,state_version=EXCLUDED.state_version`, [
    plan.party_id, journey.journey_id, journey.actor_id, journey.status, journey.mode, journey.origin_g4_id, JSON.stringify(journey.target_ref), journey.intended_direction, journey.pace_profile_id, journey.movement_method, journey.current_leg_id, journey.elapsed_minutes, JSON.stringify(journey.actual_position), JSON.stringify(journey.perceived_position), journey.orientation_confidence, journey.deviation_level, journey.started_at, journey.updated_at, journey.world_revision_id, journey.travel_rules_digest, journey.environment_catalog_digest, journey.algorithm_version, journey.rng_version, plan.next_state_version, journey.idempotency_key
  ]);
  for (const leg of plan.legs) {
    await transaction.query(`INSERT INTO party_runtime.party_journey_legs
      (party_id,journey_id,leg_id,sequence,edge_id,from_node_id,to_node_id,status,base_gu,base_time_minutes,route_profile_id,progress_permille,elapsed_minutes,started_at,completed_at,interruption_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::timestamptz,$15::timestamptz,$16)
      ON CONFLICT (party_id,journey_id,leg_id) DO UPDATE SET sequence=EXCLUDED.sequence,edge_id=EXCLUDED.edge_id,from_node_id=EXCLUDED.from_node_id,to_node_id=EXCLUDED.to_node_id,status=EXCLUDED.status,base_gu=EXCLUDED.base_gu,base_time_minutes=EXCLUDED.base_time_minutes,route_profile_id=EXCLUDED.route_profile_id,progress_permille=EXCLUDED.progress_permille,elapsed_minutes=EXCLUDED.elapsed_minutes,started_at=EXCLUDED.started_at,completed_at=EXCLUDED.completed_at,interruption_id=EXCLUDED.interruption_id`, [
      plan.party_id, journey.journey_id, leg.leg_id, leg.sequence, leg.edge_id, leg.from_g4_id, leg.to_g4_id, leg.status, leg.base_gu ?? null, leg.base_time_minutes, leg.route_profile_id, leg.progress_permille, leg.elapsed_minutes, leg.started_at, leg.completed_at, leg.interruption_id
    ]);
  }
  const position = plan.position;
  await transaction.query(`INSERT INTO party_runtime.party_positions
    (party_id,position_kind,g4_id,g5_node_id,g5_anchor_id,journey_id,journey_leg_id,edge_id,from_g4_id,to_g4_id,progress_permille,last_confirmed_g4_id,last_route_id,updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::timestamptz)
    ON CONFLICT (party_id) DO UPDATE SET position_kind=EXCLUDED.position_kind,g4_id=EXCLUDED.g4_id,g5_node_id=EXCLUDED.g5_node_id,g5_anchor_id=EXCLUDED.g5_anchor_id,journey_id=EXCLUDED.journey_id,journey_leg_id=EXCLUDED.journey_leg_id,edge_id=EXCLUDED.edge_id,from_g4_id=EXCLUDED.from_g4_id,to_g4_id=EXCLUDED.to_g4_id,progress_permille=EXCLUDED.progress_permille,last_confirmed_g4_id=EXCLUDED.last_confirmed_g4_id,last_route_id=EXCLUDED.last_route_id,updated_at=EXCLUDED.updated_at`, [
    plan.party_id, position.position_kind, position.g4_id ?? null, position.g5_node_id ?? null, position.g5_anchor_id ?? null, position.journey_id ?? null, position.journey_leg_id ?? null, position.edge_id ?? null, position.from_g4_id ?? null, position.to_g4_id ?? null, position.progress_permille ?? null, position.last_confirmed_g4_id ?? null, position.last_route_id ?? null, journey.updated_at
  ]);
}

function validateJourneyRecord(value) {
  for (const key of ['journey_id','actor_id','status','mode','origin_g4_id','pace_profile_id','movement_method','elapsed_minutes','orientation_confidence','deviation_level','started_at','updated_at','world_revision_id','travel_rules_digest','environment_catalog_digest','algorithm_version','rng_version','idempotency_key']) requiredText(value[key], `journey.${key}`);
  requiredObject(value.target_ref, 'journey.target_ref');
  requiredObject(value.actual_position, 'journey.actual_position');
  requiredObject(value.perceived_position, 'journey.perceived_position');
  if (!['planned','active','interrupted','camped','blocked','arrived','abandoned'].includes(value.status) || !['route','course'].includes(value.mode) || !Number.isInteger(value.elapsed_minutes) || value.elapsed_minutes < 0) throw repositoryError('TRAVEL_JOURNEY_INVALID', 'Journey record is invalid.');
  if (value.mode === 'course' ? !text(value.intended_direction) : value.intended_direction != null) throw repositoryError('TRAVEL_JOURNEY_INVALID', 'Journey intended_direction does not match mode.');
}

function validateJourneyLeg(leg, journey) {
  requiredObject(leg, 'journey_leg');
  for (const key of ['leg_id','edge_id','from_g4_id','to_g4_id','status','route_profile_id']) requiredText(leg[key], `journey_leg.${key}`);
  if (!Number.isInteger(leg.sequence) || leg.sequence <= 0 || !Number.isInteger(leg.base_time_minutes) || leg.base_time_minutes <= 0 || !Number.isInteger(leg.progress_permille) || leg.progress_permille < 0 || leg.progress_permille > 1000 || !Number.isInteger(leg.elapsed_minutes) || leg.elapsed_minutes < 0) throw repositoryError('TRAVEL_JOURNEY_LEG_INVALID', 'Journey leg numeric fields are invalid.');
  if (leg.status === 'completed' && (leg.progress_permille !== 1000 || !text(leg.completed_at))) throw repositoryError('TRAVEL_JOURNEY_LEG_INVALID', 'Completed journey leg requires full progress and completed_at.');
  if (!['pending','active','completed','interrupted','blocked','superseded'].includes(leg.status) || leg.journey_id != null && leg.journey_id !== journey.journey_id) throw repositoryError('TRAVEL_JOURNEY_LEG_INVALID', 'Journey leg state is invalid.');
}

function validateTravelPosition(position, journey) {
  if (position.position_kind === 'node') {
    requiredText(position.g4_id, 'travel_position.g4_id');
    if (position.journey_id != null || position.journey_leg_id != null || position.edge_id != null || position.progress_permille != null) throw repositoryError('TRAVEL_POSITION_INVALID', 'Node position cannot contain travel-edge fields.');
    return;
  }
  if (position.position_kind !== 'edge_progress') throw repositoryError('TRAVEL_POSITION_INVALID', 'Unknown travel position kind.');
  for (const key of ['journey_id','journey_leg_id','edge_id','from_g4_id','to_g4_id','last_confirmed_g4_id']) requiredText(position[key], `travel_position.${key}`);
  if (position.journey_id !== journey.journey_id || !Number.isInteger(position.progress_permille) || position.progress_permille < 0 || position.progress_permille > 1000 || position.g4_id != null || position.g5_node_id != null || position.g5_anchor_id != null) throw repositoryError('TRAVEL_POSITION_INVALID', 'Edge-progress position is invalid.');
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
    if (NORMALIZED_TRAVEL_TARGETS.has(operation.target)) continue;
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
function requiredText(value, label) { const normalized = text(value); if (!normalized) throw repositoryError('TRAVEL_WRITE_SET_INVALID', `${label} is required.`); return normalized; }
function requiredObject(value, label) { if (!value || typeof value !== 'object' || Array.isArray(value)) throw repositoryError('TRAVEL_WRITE_SET_INVALID', `${label} must be an object.`); return value; }
function requiredArray(value, label) { if (!Array.isArray(value) || value.length === 0) throw repositoryError('TRAVEL_WRITE_SET_INVALID', `${label} must be a non-empty array.`); return value; }
function text(value) { return String(value ?? '').trim(); }
