import { canonicalDigest } from '@rus/materialization';
import { row } from './first-playable/plan-shared.js';
import { exactShape, fail, plain, text } from
  './lower-dvina-trace-turn-step-persistence-support.js';

const BODY_METRICS = ['health', 'satiety', 'energy'];

export function prepareTurnStepBodyHistory({
  partyId, state, factual, batch, changeSetId, idemId
}) {
  if (factual.body_update?.applied !== true) return null;
  const effectRef = buildTurnStepBodyEffectRef({ factual, batch });
  const occurredAt = factual.time_update?.clock_after;
  if (!gameTimestamp(occurredAt)) bodyHistoryFail('clock_after is unavailable');
  const bodyEvent = batch.operations?.find(({ target, value }) =>
    target === 'party_state' && value?.operation_kind === 'apply_body_event');
  const actor = bodyEvent?.value?.payload?.actor_ref ?? state.actor_id;
  const turnNumber = state.party_state.turn_number + 1;
  const historyId = `body-history:${partyId}:turn-step:${turnNumber}`;
  const record = {
    history_id: historyId,
    party_id: partyId,
    subject_kind: actor === state.actor_id ? 'player_character' : 'npc',
    subject_id: actor,
    effect_ref: effectRef,
    change_set_id: changeSetId,
    idempotency_record_id: idemId,
    occurred_at_whole_minutes: occurredAt.whole_minutes,
    occurred_at_subminute_numerator: occurredAt.subminute_numerator,
    occurred_at_subminute_denominator: occurredAt.subminute_denominator
  };
  return {
    snapshot: structuredClone(record),
    write: row('party_body_temporal_history', historyId, record)
  };
}

export function buildTurnStepBodyEffectRef({ factual, batch }) {
  const proposal = factual.body_update.proposal;
  const consequenceRef = factual.consequence?.body_effect_ref ?? null;
  const components = (factual.consequence?.state_changes ?? []).filter(
    ({ kind }) => ['semantic_activity', 'direct_body_event'].includes(kind));
  const proposals = proposal?.component_proposals;
  if (!exactShape(proposal, [
        'schema', 'profile_ref', 'profile_pin', 'component_proposals',
        'exact_deltas', 'selection_policy', 'rng_consumption'
      ])
      || proposal.schema !== 'rus.body_state.composite_fixed_effect_proposal.v1'
      || !text(proposal.profile_ref) || !profilePin(proposal.profile_pin)
      || !bodyDeltas(proposal.exact_deltas)
      || (consequenceRef != null
        && (!text(consequenceRef) || proposal.profile_ref !== consequenceRef))
      || proposal.selection_policy !== 'ordered_committed_step_components'
      || proposal.rng_consumption !== 'forbidden'
      || !Array.isArray(proposals) || proposals.length !== components.length
      || proposals.length === 0) bodyHistoryFail('composite owner is invalid');
  const componentEffects = components.map((component, index) => {
    const componentRef = component.kind === 'direct_body_event'
      ? component.operation_id : component.activity_id;
    const ownerProposal = proposals[index];
    if (!text(componentRef) || !text(component.body_effect_profile_ref)
        || !profilePin(component.profile_pin)
        || !exactShape(ownerProposal, [
          'schema', 'profile_ref', 'profile_pin', 'selected_context',
          'exact_deltas', 'condition_transitions', 'selection_policy',
          'rng_consumption', 'state_after'
        ])
        || ownerProposal.schema
          !== 'rus.body_state.fixed_approved_effect_proposal.v1'
        || !profilePin(ownerProposal?.profile_pin)
        || ownerProposal?.profile_ref !== component.body_effect_profile_ref
        || canonicalDigest(ownerProposal.profile_pin)
          !== canonicalDigest(component.profile_pin)
        || canonicalDigest(proposal.profile_pin)
          !== canonicalDigest(component.profile_pin)
        || canonicalDigest(ownerProposal.selected_context)
          !== canonicalDigest(component.body_effect_context)
        || !bodyDeltas(ownerProposal.exact_deltas)
        || !Array.isArray(ownerProposal.condition_transitions)
        || ownerProposal.selection_policy !== 'fixed_approved_effect'
        || ownerProposal.rng_consumption !== 'forbidden'
        || !plain(ownerProposal.state_after)) {
      bodyHistoryFail('ordered component owner is invalid', { index });
    }
    return {
      kind: component.kind,
      component_ref: componentRef,
      profile_ref: component.body_effect_profile_ref,
      profile_pin: structuredClone(component.profile_pin),
      proposal_digest: canonicalDigest(ownerProposal)
    };
  });
  const summedDeltas = Object.fromEntries(BODY_METRICS.map((metric) => [
    metric,
    proposals.reduce((sum, ownerProposal) =>
      sum + ownerProposal.exact_deltas[metric], 0)
  ]));
  if (canonicalDigest(proposal.exact_deltas)
      !== canonicalDigest(summedDeltas)) {
    bodyHistoryFail('composite exact deltas differ from ordered components');
  }
  if (canonicalDigest(proposals.at(-1).state_after)
      !== canonicalDigest(factual.body_update.state_after)) {
    bodyHistoryFail('final owner state is invalid');
  }
  return {
    schema: 'rus.turn_step.composite_body_effect_history.v1',
    entity_kind: 'body_effect',
    entity_id: proposal.profile_ref,
    root_turn_id: batch.root_turn_id,
    profile_ref: proposal.profile_ref,
    profile_pin: structuredClone(proposal.profile_pin),
    proposal_digest: canonicalDigest(proposal),
    component_effects: componentEffects,
    state_after_digest: canonicalDigest(factual.body_update.state_after)
  };
}

function gameTimestamp(value) {
  return value != null
    && typeof value.whole_minutes === 'string'
    && typeof value.subminute_numerator === 'string'
    && typeof value.subminute_denominator === 'string';
}

function profilePin(value) {
  return plain(value)
    && Object.keys(value).length === 3
    && text(value.artifact_id)
    && Number.isSafeInteger(value.revision)
    && value.revision >= 1
    && typeof value.digest === 'string'
    && /^[a-f0-9]{64}$/u.test(value.digest);
}

function bodyDeltas(value) {
  return exactShape(value, BODY_METRICS)
    && BODY_METRICS.every((metric) => Number.isSafeInteger(value[metric]));
}

function bodyHistoryFail(reason, details = {}) {
  fail('TRACE_TURN_STEP_BODY_HISTORY_RECONCILIATION_FAILED', {
    reason, ...details
  });
}
