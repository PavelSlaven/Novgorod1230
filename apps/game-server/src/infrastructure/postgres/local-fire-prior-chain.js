import { isDeepStrictEqual } from 'node:util';
import { createLocalFireAtomicWritePlan } from
  './local-fire-atomic-write-plan.js';

export function validateLocalFirePriorChain({ rawPlans, partyId, actorRef,
  profilePin, partyStateVersion, rootTurnId, stepIndex, changeSetId,
  currentRequestId, completedSteps, processStates, itemPins }) {
  if (!Array.isArray(rawPlans) || !Array.isArray(completedSteps)
      || !(processStates instanceof Map) || !(itemPins instanceof Map)) {
    fail('LOCAL_FIRE_PRIOR_CHAIN_INVALID');
  }
  const plans = rawPlans.map((raw) => {
    try { return createLocalFireAtomicWritePlan(raw); }
    catch { fail('LOCAL_FIRE_PRIOR_CHAIN_INVALID'); }
  });
  if (plans.length === 0) return { plans, processStates, itemPins };
  const completed = new Set(completedSteps.map(({ step_index: index }) => index));
  const requestPrefix = requestPrefixFrom(currentRequestId, stepIndex);
  let priorStep = 0;
  for (const plan of plans) {
    const proposal = plan.transition_proposal;
    const cause = proposal.cause;
    const ref = proposal.process_after.process_ref;
    if (plan.party_id !== partyId || plan.actor_ref !== actorRef
        || plan.base_party_state_version !== partyStateVersion
        || plan.change_set_id !== changeSetId
        || cause.kind !== 'actor_step' || cause.root_turn_id !== rootTurnId
        || !Number.isSafeInteger(cause.step_index)
        || cause.step_index <= priorStep || cause.step_index >= stepIndex
        || !completed.has(cause.step_index)
        || cause.request_id !== `${requestPrefix}${cause.step_index}`
        || !sameProfile(profilePin, plan.profile_pin)
        || plan.profile_pin.ignition_basis_ref
          !== proposal.process_after.causal_basis_ref
        || proposal.process_before?.process_ref !== ref
          && proposal.process_before !== null) {
      fail('LOCAL_FIRE_PRIOR_CHAIN_INVALID');
    }
    const current = processStates.get(ref) ?? null;
    if (!isDeepStrictEqual(current, proposal.process_before)) {
      fail('LOCAL_FIRE_PROCESS_STALE');
    }
    assertPins(plan.input_pins, itemPins, 'LOCAL_FIRE_INPUT_STALE');
    if (plan.ignition_basis_pin != null) {
      assertPins([plan.ignition_basis_pin], itemPins,
        'LOCAL_FIRE_IGNITION_BASIS_STALE');
    }
    projectItemPins(plan, itemPins);
    processStates.set(ref, structuredClone(proposal.process_after));
    priorStep = cause.step_index;
  }
  return { plans, processStates, itemPins };
}

export function localFirePriorRefs(rawPlans) {
  if (!Array.isArray(rawPlans)) fail('LOCAL_FIRE_PRIOR_CHAIN_INVALID');
  const processRefs = new Set(), itemRefs = new Set();
  for (const raw of rawPlans) {
    let plan;
    try { plan = createLocalFireAtomicWritePlan(raw); }
    catch { fail('LOCAL_FIRE_PRIOR_CHAIN_INVALID'); }
    processRefs.add(plan.transition_proposal.process_after.process_ref);
    for (const pin of plan.input_pins) itemRefs.add(pin.item_id);
    if (plan.ignition_basis_pin != null) {
      itemRefs.add(plan.ignition_basis_pin.item_id);
    }
  }
  return { processRefs, itemRefs };
}

function assertPins(expectedPins, itemPins, code) {
  for (const expected of expectedPins) {
    if (!isDeepStrictEqual(itemPins.get(expected.item_id), expected)) fail(code);
  }
}

function projectItemPins(plan, itemPins) {
  const proposal = plan.transition_proposal;
  for (const transition of plan.fuel_placement_transitions) {
    itemPins.get(transition.item_id).placement =
      structuredClone(transition.after_placement);
  }
  for (const ref of proposal.added_fuel_refs) {
    itemPins.get(ref).bound_process_ref = proposal.process_after.process_ref;
  }
  for (const ref of proposal.released_fuel_refs) {
    if (itemPins.has(ref)) itemPins.get(ref).bound_process_ref = null;
  }
  if (plan.item_retirement_transition != null) {
    itemPins.get(plan.item_retirement_transition.item_id).item =
      structuredClone(plan.item_retirement_transition.after_item);
  }
}

function requestPrefixFrom(requestId, stepIndex) {
  const suffix = `:step:${stepIndex}`;
  if (typeof requestId !== 'string' || !requestId.endsWith(suffix)) {
    fail('LOCAL_FIRE_PRIOR_CHAIN_INVALID');
  }
  return `${requestId.slice(0, -suffix.length)}:step:`;
}

function sameProfile(expected, actual) {
  return expected.profile_ref === actual.profile_ref
    && expected.profile_version === actual.profile_version
    && expected.context_ref === actual.context_ref
    && expected.scope_ref === actual.scope_ref
    && isDeepStrictEqual(expected.policy, actual.policy);
}
function fail(code) { throw Object.assign(new Error(code), { code }); }
