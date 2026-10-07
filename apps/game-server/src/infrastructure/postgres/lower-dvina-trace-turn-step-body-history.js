import { canonicalDigest } from '@rus/materialization';
import { applyApprovedFixedBodyEffect, applyBodyTimeEffectProposals } from
  '@rus/body-state';
import { addRationalMinutes, compareRationalMinutes,
  normalizeRationalMinutes } from '@rus/time-events-history';
import { row } from './first-playable/plan-shared.js';
import { exactShape, fail, plain, text } from
  './lower-dvina-trace-turn-step-persistence-support.js';

const BODY_METRICS = ['health', 'satiety', 'energy'];

export function prepareTurnStepBodyHistory({
  partyId, state, factual, batch, changeSetId, idemId,
  trustedBodyNeedsBindingPin = null
}) {
  if (factual.body_update?.applied !== true) return null;
  const effectRef = buildTurnStepBodyEffectRef({ factual, batch, state,
    trustedBodyNeedsBindingPin });
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

export function preparedBodyHistoryInput({ factual, batch, bodySlices = [] }) {
  if (bodySlices.length === 0) return { factual, batch };
  const activityIds = new Set(bodySlices.map(
    ({ operation_ref: ref }) => ref));
  return {
    factual: bodySlices.length === 1 ? {
      ...factual,
      consequence: bodySlices[0].consequence,
      body_update: bodySlices[0].body_update
    } : {
      ...factual,
      consequence: { ...factual.consequence,
        state_changes: bodySlices.flatMap(
          ({ consequence }) => consequence.state_changes ?? []) }
    },
    batch: { ...batch, operations: batch.operations.filter(
      ({ target, value }) => target === 'party_events'
        && activityIds.has(value.activity_id)) }
  };
}

export function buildTurnStepBodyEffectRef({ factual, batch, state = null,
  trustedBodyNeedsBindingPin = null }) {
  const proposal = factual.body_update.proposal;
  const consequenceRef = factual.consequence?.body_effect_ref ?? null;
  const components = (factual.consequence?.state_changes ?? []).filter(
    ({ kind }) => ['semantic_activity', 'direct_body_event'].includes(kind));
  if (proposal?.proposal_kind === 'body_time_effect_composite') {
    return buildBodyTimeEffectRef({ factual, batch, proposal, components, state,
      trustedBodyNeedsBindingPin });
  }
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

export function validateTurnStepBodyTimeProposal({ factual, batch, state,
  trustedBodyNeedsBindingPin = null }) {
  const proposal = factual?.body_update?.proposal;
  if (proposal?.proposal_kind !== 'body_time_effect_composite') {
    bodyHistoryFail('continuous body-time composite owner is invalid');
  }
  return buildBodyTimeEffectRef({ factual, batch, proposal,
    components: (factual.consequence?.state_changes ?? []).filter(
      ({ kind }) => ['semantic_activity', 'direct_body_event'].includes(kind)),
    state, trustedBodyNeedsBindingPin });
}

function buildBodyTimeEffectRef({ factual, batch, proposal, components, state,
  trustedBodyNeedsBindingPin }) {
  const proposals = proposal.component_proposals;
  const proposalKeys = plain(proposal)
    ? Object.keys(proposal).sort() : null;
  if (!exactShape(proposal, ['proposal_kind', 'fixed_effect_proposals',
    'component_proposals', 'exact_changes'])) {
    bodyHistoryFail('continuous body-time composite owner is invalid', {
      failed_condition: 'shape_keys', keys: proposalKeys
    });
  }
  if (!Array.isArray(proposals) || proposals.length === 0) {
    bodyHistoryFail('continuous body-time composite owner is invalid', {
      failed_condition: 'component_proposals'
    });
  }
  if (!Array.isArray(proposal.fixed_effect_proposals)) {
    bodyHistoryFail('continuous body-time composite owner is invalid', {
      failed_condition: 'fixed_effect_proposals'
    });
  }
  if (components.length === 0) {
    const stateChanges = factual.consequence?.state_changes;
    const stateChangeKinds = stateChanges === undefined ? null
      : Array.isArray(stateChanges)
        ? [...new Set(stateChanges.map(({ kind }) => kind))].sort()
        : null;
    bodyHistoryFail('continuous body-time composite owner is invalid', {
      failed_condition: 'components_empty',
      state_change_kinds: stateChangeKinds
    });
  }
  const activityById = new Map();
  for (const component of components) {
    if (component.kind === 'semantic_activity') {
      if (!text(component.activity_id)) {
        bodyHistoryFail('continuous body effect activity identity is invalid');
      }
    } else if (component.kind !== 'direct_body_event'
        || !text(component.operation_id)) {
      bodyHistoryFail('continuous body effect component identity is invalid');
    }
    if (component.kind !== 'semantic_activity') continue;
    const effort = component.effort ?? component.body_effect_context?.effort;
    if (!text(effort) || activityById.has(component.activity_id)) {
      bodyHistoryFail('continuous activity identity or effort is invalid');
    }
    activityById.set(component.activity_id, { component, effort, profiles: [] });
  }
  let bindingPin = null;
  const allProfilePins = new Map();
  const groupedProposals = new Map();
  for (const [index, ownerProposal] of proposals.entries()) {
    const activityId = ownerProposal?.activity_id;
    const activity = activityById.get(activityId);
    if (!activity || !exactBodyTimeProposal(ownerProposal)
        || ownerProposal.effort !== activity.effort
        || !bodyTimeProfileMatchesMetric(ownerProposal)) {
      bodyHistoryFail('continuous ordered component owner is invalid', { index });
    }
    if (bindingPin == null) bindingPin = structuredClone(ownerProposal.binding_pin);
    else if (canonicalDigest(bindingPin)
        !== canonicalDigest(ownerProposal.binding_pin)) {
      bodyHistoryFail('body-time binding pin differs across proposals', { index });
    }
    const profileKey = canonicalDigest(ownerProposal.profile_pin);
    allProfilePins.set(profileKey, structuredClone(ownerProposal.profile_pin));
    const group = groupedProposals.get(activityId) ?? [];
    group.push(ownerProposal);
    groupedProposals.set(activityId, group);
  }
  if (!validBindingPin(trustedBodyNeedsBindingPin)) {
    bodyHistoryFail('continuous proposals lack trusted body binding approval', {
      failed_condition: 'trusted_pin_invalid'
    });
  }
  if (!validBindingPin(bindingPin)) {
    bodyHistoryFail('continuous proposals lack trusted body binding approval', {
      failed_condition: 'proposal_pin_invalid'
    });
  }
  if (!sameBindingApproval(bindingPin, trustedBodyNeedsBindingPin)) {
    bodyHistoryFail('continuous proposals lack trusted body binding approval', {
      failed_condition: 'binding_approval_mismatch'
    });
  }
  if (groupedProposals.size !== activityById.size) {
    bodyHistoryFail('continuous proposals lack trusted body binding approval', {
      failed_condition: 'activity_group_count',
      proposal_group_count: groupedProposals.size,
      activity_count: activityById.size
    });
  }
  let elapsed = normalizeRationalMinutes({ numerator: '0', denominator: '1' });
  const activityEffects = [];
  for (const [activityId, activity] of activityById) {
    const activityProposals = groupedProposals.get(activityId) ?? [];
    const elapsedForActivity = normalizeElapsed(activityProposals[0]?.exact_elapsed);
    const metrics = activityProposals.flatMap(({ metric_changes: changes }) =>
      changes.map(({ metric }) => metric));
    if (new Set(metrics).size !== metrics.length
        || metrics.some((metric) => !['satiety', 'energy', 'health'].includes(metric))
        || activityProposals.some((item) => !sameRational(
          item.exact_elapsed, elapsedForActivity))) {
      bodyHistoryFail('continuous activity profile set or elapsed is invalid', {
        activity_id: activityId
      });
    }
    try {
      elapsed = addRationalMinutes(elapsed, elapsedForActivity);
    } catch (cause) {
      bodyHistoryFail('continuous component elapsed is invalid', {
        activity_id: activityId, cause: cause.message
      });
    }
    activityEffects.push({
      kind: 'semantic_activity',
      component_ref: activityId,
      effort: activity.effort,
      exact_elapsed: structuredClone(elapsedForActivity),
      profile_effects: activityProposals.map((ownerProposal) => ({
        profile_ref: structuredClone(ownerProposal.profile_ref),
        time_effect_policy_ref: structuredClone(ownerProposal.time_effect_policy_ref),
        profile_pin: structuredClone(ownerProposal.profile_pin),
        proposal_digest: canonicalDigest(ownerProposal)
      })),
      fixed_effect: fixedEffectForActivity(proposal.fixed_effect_proposals,
        components, activityId)
    });
  }
  let committedElapsed;
  try {
    committedElapsed = normalizeRationalMinutes(
      factual.time_update?.exact_elapsed?.exact_minutes);
  } catch (cause) {
    bodyHistoryFail('committed body-time elapsed is invalid', {
      cause: cause.message
    });
  }
  if (compareRationalMinutes(elapsed, committedElapsed) !== 0) {
    bodyHistoryFail('continuous body elapsed differs from committed time');
  }
  const bodyEvent = batch.operations?.find(({ target, value }) =>
    target === 'party_state' && value?.operation_kind === 'apply_body_event');
  const actor = bodyEvent?.value?.payload?.actor_ref ?? state?.actor_id;
  if (state != null) {
    const bodyBefore = actor === state.actor_id ? state.body_state
      : state.npcs?.find(({ instance_id }) => instance_id === actor)
        ?.check_body_state;
    const afterFixed = replayFixedEffects(bodyBefore, components,
      proposal.fixed_effect_proposals);
    const replay = afterFixed.ok
      ? applyBodyTimeEffectProposals(afterFixed.state_after, proposals)
      : afterFixed;
    if (!sameBodyReplay(replay, proposal, factual.body_update.state_after)) {
      bodyHistoryFail('continuous body state differs from owner replay');
    }
  }
  return {
    schema: 'rus.turn_step.composite_body_time_effect_history.v1',
    entity_kind: 'body_effect',
    entity_id: bindingPin.artifact_id,
    root_turn_id: batch.root_turn_id,
    profile_ref: bindingPin.artifact_id,
    binding_pin: structuredClone(bindingPin),
    profile_pins: [...allProfilePins.values(),
      ...proposal.fixed_effect_proposals.map(({ profile_pin }) => profile_pin)],
    proposal_digest: canonicalDigest(proposal),
    exact_changes_digest: canonicalDigest(proposal.exact_changes),
    component_effects: [...activityEffects,
      ...fixedDirectEffectHistory(proposal.fixed_effect_proposals, components)],
    state_after_digest: canonicalDigest(factual.body_update.state_after)
  };
}

function exactBodyTimeProposal(value) {
  const allowed = ['proposal_kind', 'profile_ref', 'time_effect_policy_ref',
    'exact_elapsed', 'metric_changes', 'profile_pin', 'binding_pin',
    'activity_id', 'effort'];
  return plain(value) && allowed.every((key) => Object.hasOwn(value, key))
    && Object.keys(value).every((key) => allowed.includes(key))
    && value.proposal_kind === 'body_time_effect'
    && versionedProfileRef(value.profile_ref)
    && versionedPolicyRef(value.time_effect_policy_ref, value.profile_ref)
    && profilePin(value.profile_pin) && validBindingPin(value.binding_pin)
    && text(value.activity_id) && text(value.effort)
    && validElapsed(value.exact_elapsed)
    && Array.isArray(value.metric_changes) && value.metric_changes.length === 1
    && ['satiety', 'energy', 'health'].includes(value.metric_changes[0]?.metric)
    && value.metric_changes[0]?.direction === 'decrease'
    && validRational(value.metric_changes[0]?.amount);
}

function bodyTimeProfileMatchesMetric(proposal) {
  const metric = proposal.metric_changes[0].metric;
  const profileId = {
    satiety: 'satiety_hourly_spend_v2',
    energy: 'energy_awake_spend_v2',
    health: 'starvation_health_harm_v2'
  }[metric];
  const expectedArtifactId = `record:body_time_effect_profiles_thresholds:${profileId}`;
  return proposal.profile_pin.artifact_id === expectedArtifactId
    && proposal.profile_ref.entity_ref.entity_id === profileId;
}

function fixedEffectForActivity(proposals, components, activityId) {
  const index = components.findIndex((component) =>
    component.kind === 'semantic_activity'
      && component.activity_id === activityId);
  const proposal = proposals[index];
  return proposal == null ? null : {
    profile_ref: proposal.profile_ref,
    profile_pin: structuredClone(proposal.profile_pin),
    proposal_digest: canonicalDigest(proposal)
  };
}

function fixedDirectEffectHistory(proposals, components) {
  return components.flatMap((component, index) => {
    if (component.kind !== 'direct_body_event') return [];
    const proposal = proposals[index];
    return [{ kind: 'direct_body_event',
      component_ref: component.operation_id,
      profile_ref: proposal.profile_ref,
      profile_pin: structuredClone(proposal.profile_pin),
      proposal_digest: canonicalDigest(proposal) }];
  });
}

function replayFixedEffects(bodyBefore, components, proposals) {
  if (!Array.isArray(proposals) || proposals.length !== components.length
      || components.length === 0) {
    bodyHistoryFail('fixed body effects do not cover ordered components');
  }
  let stateAfter = bodyBefore == null ? null : structuredClone(bodyBefore);
  for (const [index, proposal] of proposals.entries()) {
    const component = components[index];
    const componentRef = component.kind === 'semantic_activity'
      ? component.activity_id : component.operation_id;
    if (!exactShape(proposal, ['schema', 'profile_ref', 'profile_pin',
          'selected_context', 'exact_deltas', 'condition_transitions',
          'selection_policy', 'rng_consumption', 'state_after'])
        || proposal.schema
          !== 'rus.body_state.fixed_approved_effect_proposal.v1'
        || proposal.profile_ref !== component.body_effect_profile_ref
        || !profilePin(proposal.profile_pin)
        || !same(proposal.profile_pin, component.profile_pin)
        || !same(proposal.selected_context, component.body_effect_context)
        || proposal.selection_policy !== 'fixed_approved_effect'
        || proposal.rng_consumption !== 'forbidden'
        || !text(componentRef) || !plain(proposal.state_after)) {
      bodyHistoryFail('fixed body effect does not match its ordered component', {
        index
      });
    }
    if (stateAfter == null) continue;
    const replay = applyApprovedFixedBodyEffect({ body_state: stateAfter,
      body_effect_profile: {
        schema: 'rus.body_state.fixed_approved_effect.v1',
        profile_ref: proposal.profile_ref,
        profile_pin: proposal.profile_pin,
        status: 'approved',
        applicability: proposal.selected_context,
        exact_deltas: proposal.exact_deltas,
        condition_outcomes: proposal.condition_transitions,
        selection_policy: proposal.selection_policy,
        rng_consumption: proposal.rng_consumption
      }, selected_context: proposal.selected_context });
    if (replay?.ok !== true || !same(replay.state_after, proposal.state_after)) {
      bodyHistoryFail('fixed body effect replay differs from its proposal', {
        index
      });
    }
    stateAfter = replay.state_after;
  }
  return { ok: true, state_after: stateAfter };
}

function same(left, right) {
  return canonicalDigest(left) === canonicalDigest(right);
}

function versionedProfileRef(value) {
  const version = value?.authoring_version;
  return plain(value) && plain(value.entity_ref)
    && value.entity_ref.entity_kind === 'body_effect'
    && text(value.entity_ref.entity_id)
    && ((Number.isSafeInteger(version) && version > 0)
      || (typeof version === 'string' && /^[1-9]\d*$/u.test(version)
        && Number.isSafeInteger(Number(version))));
}

function versionedPolicyRef(value, profileRef) {
  return plain(value) && plain(value.entity_ref)
    && value.entity_ref.entity_kind === 'body_effect'
    && value.entity_ref.entity_id
      === `${profileRef.entity_ref.entity_id}:time-policy`
    && value.authoring_version === profileRef.authoring_version;
}

function validBindingPin(value) {
  return plain(value) && text(value.artifact_id)
    && Number.isSafeInteger(value.revision) && value.revision > 0
    && typeof value.digest === 'string' && /^[a-f0-9]{64}$/u.test(value.digest)
    && typeof value.dataset_sha256 === 'string'
    && /^[a-f0-9]{64}$/u.test(value.dataset_sha256)
    && typeof value.source_approval_sha256 === 'string'
    && /^[a-f0-9]{64}$/u.test(value.source_approval_sha256)
    && typeof value.candidate_path === 'string'
    && value.candidate_path.length > 0
    && typeof value.candidate_sha256 === 'string'
    && /^[a-f0-9]{64}$/u.test(value.candidate_sha256)
    && typeof value.approval_attestation_path === 'string'
    && value.approval_attestation_path.length > 0
    && typeof value.approval_attestation_sha256 === 'string'
    && /^[a-f0-9]{64}$/u.test(value.approval_attestation_sha256)
    && ['APPROVE', 'APPROVE_CONDITIONAL'].includes(value.verdict)
    && value.status === 'approved_by_attestation'
    && value.approved === true;
}

function sameBindingApproval(proposalPin, trustedPin) {
  return canonicalDigest(proposalPin) === canonicalDigest(trustedPin);
}

function normalizeElapsed(value) {
  try {
    return normalizeRationalMinutes(value);
  } catch (cause) {
    bodyHistoryFail('continuous component elapsed is invalid', {
      cause: cause.message
    });
  }
}

function validElapsed(value) {
  try {
    return BigInt(normalizeRationalMinutes(value).numerator) >= 0n;
  } catch {
    return false;
  }
}

function validRational(value) {
  try {
    const normalized = normalizeRationalMinutes(value);
    return BigInt(normalized.numerator) >= 0n;
  } catch {
    return false;
  }
}

function sameRational(left, right) {
  try {
    return compareRationalMinutes(normalizeRationalMinutes(left),
      normalizeRationalMinutes(right)) === 0;
  } catch {
    return false;
  }
}

function sameBodyReplay(replay, proposal, stateAfter) {
  return replay?.ok === true
    && canonicalDigest(replay.exact_changes)
      === canonicalDigest(proposal.exact_changes)
    && canonicalDigest(replay.state_after) === canonicalDigest(stateAfter);
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
