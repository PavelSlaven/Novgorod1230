import { canonicalDigest } from '@rus/materialization';
import {
  buildTurnStepPreparedBodyUpdate,
  requireTurnStepPreparedEffectLedger
} from '@rus/turn';
import { phase2IntegrityError } from './lower-dvina-trace-phase-2-read.js';
import { buildTurnStepBodyEffectRef, preparedBodyHistoryInput } from
  './lower-dvina-trace-turn-step-body-history.js';

export async function assertTurnStepBodyHistoryRows(pool, payload, headRow,
  trustedBodyNeedsBindingPin = null, trustedBodyNeedsProfile = null) {
  assertNormalizedBody(payload, headRow);
  const history = payload.turn_step_body_history ?? [];
  if (history.length === 0) {
    await assertCurrentEffect(pool, history, payload,
      trustedBodyNeedsBindingPin, trustedBodyNeedsProfile);
    return;
  }
  const ids = history.map(({ history_id: id }) => id);
  if (new Set(ids).size !== ids.length) invalid();
  const result = await pool.query(
    `SELECT history_id,party_id,subject_kind,subject_id,effect_ref,
            change_set_id,idempotency_record_id,
            occurred_at_whole_minutes::text,
            occurred_at_subminute_numerator::text,
            occurred_at_subminute_denominator::text
       FROM party_runtime.party_body_temporal_history
      WHERE history_id=ANY($1::text[])`,
    [ids]
  );
  if (result.rows.length !== history.length) invalid();
  const rows = new Map(result.rows.map((row) => [row.history_id, row]));
  if (rows.size !== result.rows.length) invalid();
  for (const expected of history) {
    const row = rows.get(expected.history_id);
    if (!row || !same(row, expected)
        || row.party_id !== payload.party_id
        || !validSubject(row, payload)) invalid();
  }
  await assertCurrentEffect(pool, history, payload,
    trustedBodyNeedsBindingPin, trustedBodyNeedsProfile);
}

async function assertCurrentEffect(pool, history, payload,
  trustedBodyNeedsBindingPin, trustedBodyNeedsProfile) {
  const envelope = payload.last_turn?.turn_step_commit;
  if (!envelope) return;
  const batch = payload.last_turn?.turn_step_operation_batch;
  const current = history.filter(({ effect_ref: effect }) =>
    effect?.root_turn_id === envelope.root_turn_id);
  const preparedLedger = envelope.time_update?.prepared_effect_ledger;
  const preparedDigests = [
    envelope.time_update?.prepared_effect_ledger_digest,
    envelope.body_update?.prepared_effect_ledger_digest,
    envelope.consequence?.prepared_effect_ledger_digest
  ];
  let preparedBodySlices = [];
  if (preparedLedger == null
      && preparedDigests.some((digest) => digest != null)) invalid();
  if (preparedLedger != null) {
    let ledger;
    try {
      ledger = requireTurnStepPreparedEffectLedger(preparedLedger);
    } catch (cause) {
      invalid(readbackFailureReason(cause));
    }
    const digest = ledger.ledger_digest;
    if (typeof digest !== 'string'
        || ledger.root_turn_id !== envelope.root_turn_id
        || ledger.committed_state_version !== envelope.base_state_version
        || envelope.time_update.prepared_effect_ledger_digest !== digest
        || envelope.body_update?.prepared_effect_ledger_digest !== digest
        || envelope.consequence?.prepared_effect_ledger_digest !== digest
        || (isContinuousBodyTimeComposite(envelope.body_update)
          ? !continuousBodyLedgerMatches(envelope.body_update, ledger)
          : !same(envelope.body_update,
            buildTurnStepPreparedBodyUpdate(ledger)))) invalid();
    if (ledger.slices.some((slice) => slice.effect_kind !== 'semantic_activity')) {
      if (current.length !== 0) invalid();
      return;
    }
    const applied = ledger.slices.filter((slice) => slice.body_update.applied === true);
    preparedBodySlices = applied;
    for (const slice of applied) {
      const operations = batch?.operations?.filter(({ target, value }) =>
        target === 'party_events' && value?.activity_id === slice.operation_ref) ?? [];
      if (operations.length !== 1 || operations[0].value.step_index !== slice.step_index
          || operations[0].value.profile_ref !== slice.owner_ref) invalid();
    }
  }
  if (batch == null) {
    if (current.length !== 0) invalid();
    return;
  }
  if (batch.root_turn_id !== envelope.root_turn_id) invalid();
  if (envelope.body_update?.applied !== true) {
    if (current.length !== 0) invalid();
    return;
  }
  if (current.length !== 1) invalid();
  const expected = current[0];
  const subject = currentBodySubject(payload);
  if (isContinuousBodyTimeComposite(envelope.body_update)
      && trustedBodyNeedsProfile?.approved !== true) {
    invalid('trusted_body_profile_missing');
  }
  const rootState = isContinuousBodyTimeComposite(envelope.body_update)
    ? await loadRootBodyBaseline(pool, payload, envelope) : null;
  let effectRef;
  try {
    if (isContinuousBodyTimeComposite(envelope.body_update)) {
      const preparedHistory = preparedBodyHistoryInput({ factual: envelope,
        batch, bodySlices: preparedBodySlices });
      effectRef = buildTurnStepBodyEffectRef({
        factual: preparedHistory.factual, batch: preparedHistory.batch,
        state: rootState, trustedBodyNeedsBindingPin,
        trustedBodyNeedsProfile
      });
    } else {
      effectRef = buildTurnStepBodyEffectRef(preparedBodyHistoryInput({
          factual: envelope, batch, bodySlices: preparedBodySlices
        }));
    }
  } catch (cause) {
    invalid(readbackFailureReason(cause));
  }
  if (expected.subject_kind !== subject.kind
      || expected.subject_id !== subject.id
      || !same(expected.effect_ref, effectRef)
      || !(isContinuousBodyTimeComposite(envelope.body_update)
        ? samePersistedBodyState(subject.body, envelope.body_update.state_after)
        : sameBodyMetrics(subject.body, envelope.body_update.state_after))
      || expected.change_set_id
        !== bodyChangeSetId(payload)
      || expected.idempotency_record_id
        !== payload.last_turn.turn_step_idempotency_record_id
      || expected.occurred_at_whole_minutes
        !== envelope.time_update?.clock_after?.whole_minutes
      || expected.occurred_at_subminute_numerator
        !== envelope.time_update?.clock_after?.subminute_numerator
      || expected.occurred_at_subminute_denominator
        !== envelope.time_update?.clock_after?.subminute_denominator) invalid();
}

async function loadRootBodyBaseline(pool, payload, envelope) {
  const baseStateVersion = envelope?.base_state_version;
  if (!Number.isSafeInteger(Number(baseStateVersion))
      || Number(baseStateVersion) < 0) invalid(
    'root_body_baseline_state_version_missing');
  const result = await pool.query(
    `SELECT state_version,state_payload,state_digest
       FROM party_runtime.party_state_snapshots
      WHERE party_id=$1 AND state_version=$2`,
    [payload.party_id, baseStateVersion]
  );
  const row = result.rows?.length === 1 ? result.rows[0] : null;
  const state = row?.state_payload;
  const authoredInitial = state?.schema
    === 'rus.authored_start_initial_party_snapshot.v3';
  const body = authoredInitial
    ? state.persisted_projection?.body : state?.body_state;
  const identityPartyId = authoredInitial
    ? state.request_identity?.party_id : state?.party_id;
  // The SQL key constrains this row to the requested state version. Test
  // adapters may only project payload and digest, so use that bound version
  // when the selected row version is omitted.
  const stateVersion = Number(row?.state_version ?? baseStateVersion);
  const bodyValid = body != null
    && ['health', 'satiety', 'energy'].every((key) =>
      Number.isFinite(body[key]));
  const authoredInitialValid = !authoredInitial || (
    stateVersion === 0
    && state.immediate?.player?.instance_id === payload.actor_id
    && state.persisted_projection?.player?.character_id === payload.actor_id
    && canonicalDigest(state.persisted_projection)
      === state.persisted_projection_digest
    && Array.isArray(state.persisted_projection?.conditions)
    && initialBodyValuesMatch(body, state.immediate?.body?.values)
    && initialConditionsMatch(state.persisted_projection.conditions,
      state.immediate?.body?.condition_bindings)
    && state.immediate?.environment_snapshot?.schema
      === 'rus.approved_initial_environment.v1');
  if (!state || !Number.isSafeInteger(stateVersion)
      || stateVersion !== Number(baseStateVersion)
      || row.state_digest !== canonicalDigest(state)
      || identityPartyId !== payload.party_id
      || !authoredInitial && Number(state.party_state?.state_version)
        !== Number(baseStateVersion)
      || !authoredInitial && state.actor_id !== payload.actor_id
      || !bodyValid || !authoredInitialValid) {
    invalid('root_body_baseline_snapshot_missing_or_invalid');
  }
  if (!authoredInitial) return state;
  const conditions = state.persisted_projection.conditions.map((condition) => ({
    id: condition.condition_profile_ref?.state ?? null,
    storage_condition_id: condition.condition_id,
    condition_profile_ref: structuredClone(condition.condition_profile_ref),
    status: condition.status,
    state_version: Number(condition.state_version)
  }));
  if (conditions.some(({ id, storage_condition_id, state_version: version }) =>
    typeof id !== 'string' || id.length === 0
      || typeof storage_condition_id !== 'string' || storage_condition_id.length === 0
      || !Number.isSafeInteger(version))) {
    invalid('root_body_baseline_snapshot_missing_or_invalid');
  }
  return {
    party_id: payload.party_id,
    actor_id: payload.actor_id,
    party_state: { state_version: stateVersion },
    body_state: { profile_ref: structuredClone(body.body_profile_ref),
      health: body.health, satiety: body.satiety, energy: body.energy,
      active_conditions: conditions },
    environment_snapshot: state.immediate.environment_snapshot
  };
}

function initialBodyValuesMatch(body, values) {
  return values != null
    && ['health', 'satiety', 'energy'].every((key) =>
      Number.isFinite(values[key]) && String(body[key]) === String(values[key]));
}

function initialConditionsMatch(conditions, bindings) {
  if (!Array.isArray(conditions) || !Array.isArray(bindings)
      || conditions.length !== bindings.length) return false;
  const expected = bindings.map((condition) => canonicalDigest(condition)).sort();
  const actual = conditions.map((condition) =>
    canonicalDigest(condition.condition_profile_ref)).sort();
  return conditions.every((condition) =>
    typeof condition.condition_id === 'string'
      && condition.condition_id.length > 0
      && condition.status === 'active'
      && Number(condition.state_version) === 1
      && condition.condition_profile_ref?.state != null)
    && new Set(conditions.map(({ condition_id }) => condition_id)).size
      === conditions.length
    && expected.every((digest, index) => digest === actual[index]);
}

function isContinuousBodyTimeComposite(bodyUpdate) {
  return bodyUpdate?.proposal?.proposal_kind
    === 'body_time_effect_composite';
}

function continuousBodyLedgerMatches(bodyUpdate, ledger) {
  const updates = ledger.slices
    .filter((slice) => slice.body_update.applied === true)
    .map((slice) => slice.body_update);
  const proposal = bodyUpdate.proposal;
  const componentProposals = updates.flatMap(({ proposal: sliceProposal }) =>
    sliceProposal?.proposal_kind === 'body_time_effect_composite'
      && Array.isArray(sliceProposal.component_proposals)
      ? sliceProposal.component_proposals
      : sliceProposal?.proposal_kind === 'body_time_effect'
        ? [sliceProposal] : []);
  return bodyUpdate.applied === true
    && bodyUpdate.prepared_effect_ledger_digest === ledger.ledger_digest
    && proposal?.proposal_kind === 'body_time_effect_composite'
    && Array.isArray(proposal.component_proposals)
    && componentProposals.length > 0
    && same(componentProposals, proposal.component_proposals);
}

function assertNormalizedBody(payload, row) {
  const body = payload.body_state;
  const valid = body != null
    && ['health', 'energy', 'satiety'].every((key) =>
      Number.isFinite(body[key]))
    && Number(row?.body_state_version)
      === payload.party_state?.body_state_version
    && row?.body_health === String(body.health)
    && row?.body_energy === String(body.energy)
    && row?.body_satiety === String(body.satiety);
  if (!valid) invalid();
  const envelope = payload.last_turn?.turn_step_commit;
  if (isContinuousBodyTimeComposite(envelope?.body_update)) {
    const after = envelope.body_update.state_after;
    if (!sameBodyScalarStrings(body, after)
        || row?.body_health !== String(after?.health)
        || row?.body_energy !== String(after?.energy)
        || row?.body_satiety !== String(after?.satiety)
        || canonicalDigest(bodyMetricProjection(body))
          !== canonicalDigest(bodyMetricProjection(after))) invalid();
  }
  if (envelope?.body_update?.applied === true
      && currentBodySubject(payload).kind === 'player_character'
      && (!sameBodyMetrics(body, envelope.body_update.state_after)
        || row.body_updated_change_set_id
          !== bodyChangeSetId(payload))) invalid();
}

function validSubject(row, payload) {
  if (row.subject_kind === 'player_character') {
    return row.subject_id === payload.actor_id;
  }
  return row.subject_kind === 'npc' && (payload.npcs ?? []).some(
    ({ instance_id: id }) => id === row.subject_id);
}

function currentBodySubject(payload) {
  const npcRef = payload.last_turn?.turn_step_operation_batch?.operations
    ?.find(({ target, value }) => target === 'party_state'
      && value?.operation_kind === 'apply_body_event')
    ?.value?.payload?.actor_ref;
  if (npcRef == null || npcRef === payload.actor_id) return {
    kind: 'player_character', id: payload.actor_id, body: payload.body_state
  };
  const npc = (payload.npcs ?? []).find(({ instance_id: id }) => id === npcRef);
  if (npc?.check_body_state == null) invalid();
  return { kind: 'npc', id: npcRef, body: npc.check_body_state };
}

function bodyChangeSetId(payload) {
  return payload.completion?.status === 'committed'
    ? payload.last_turn.change_set_id
    : payload.last_turn.visible_package?.change_set_id;
}

function sameBodyMetrics(left, right) {
  return ['health', 'energy', 'satiety'].every((key) =>
    left?.[key] === right?.[key]);
}

function sameBodyScalarStrings(left, right) {
  return ['health', 'energy', 'satiety'].every((key) =>
    String(left?.[key]) === String(right?.[key]));
}

function bodyMetricProjection(value) {
  return Object.fromEntries(['health', 'energy', 'satiety'].map((key) =>
    [key, value?.[key]]));
}

function samePersistedBodyState(left, right) {
  return sameBodyScalarStrings(left, right)
    && canonicalDigest(bodyMetricProjection(left))
      === canonicalDigest(bodyMetricProjection(right));
}

function same(left, right) {
  return canonicalDigest(left) === canonicalDigest(right);
}

function readbackFailureReason(cause) {
  const details = cause?.details ?? {};
  const reason = [cause?.code, details.reason,
    details.failed_condition == null
      ? null : `failed_condition=${details.failed_condition}`,
    details.keys == null ? null : `keys=${JSON.stringify(details.keys)}`,
    details.state_change_kinds === undefined ? null
      : `state_change_kinds=${JSON.stringify(details.state_change_kinds)}`,
    details.operation_id == null
      ? null : `operation_id=${details.operation_id}`]
    .filter(Boolean).join(': ');
  return reason || cause?.message;
}

function invalid(reason = null) {
  const error = phase2IntegrityError();
  if (reason != null) error.details = { reason };
  throw error;
}
