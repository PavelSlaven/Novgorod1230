import { planApprovedPropertyTransition } from '@rus/items-property';
import { buildTemporaryDispositionProposal,
  planTemporaryDispositionPromiseOutcome,
  resolveTemporaryDispositionOptions } from '@rus/social-law';
import { selectTemporaryDispositionOptions } from '@rus/turn';
import { resolveEvidenceConclusions } from '@rus/visibility-knowledge-memory';

export function recoveryPlan(state, contracts) {
  const facts = new Set(committedFacts(state));
  const status = terminalZhdankoStatus(state, contracts);
  const admission = ['restrained', 'incapacitated'].includes(status)
      || facts.has('zhdanko_disarmed_and_temporarily_restrained')
    ? 'road_bag_recovery_after_zhdanko_disarm_admitted'
    : status === 'surrendered'
      ? 'road_bag_recovery_after_zhdanko_submission_admitted'
      : facts.has('zhdanko_fled')
        ? 'road_bag_recovery_after_zhdanko_departure_admitted' : null;
  return planApprovedPropertyTransition({
    state_version: state.party_state.state_version,
    expected_state_version: state.party_state.state_version,
    subject: currentContainer(state, contracts.bag.container_id),
    approved_transition: contracts.transitions.bag,
    committed_fact_ids: admission == null ? [] : [admission],
    resolved_actor_refs: actorRefs(state, contracts) });
}

export function openPlan(state, contracts) {
  return planApprovedPropertyTransition({
    state_version: state.party_state.state_version,
    expected_state_version: state.party_state.state_version,
    actor_ref: 'player_clerk', subject: currentContainer(state,
      contracts.bag.container_id),
    approved_transition: contracts.transitions.open,
    committed_fact_ids: committedFacts(state),
    resolved_actor_refs: actorRefs(state, contracts) });
}

export function packetPlan(state, contracts) {
  const packet = currentItem(state, contracts.packet.item_id);
  const transition = contracts.transitions.packet.find((record) =>
    record.requires.seal_state === packet?.state?.seal_state);
  if (transition == null) return { pass: false,
    errors: [{ code: 'TRACE_PHASE_9_PACKET_VARIANT_GAP' }] };
  return planApprovedPropertyTransition({
    state_version: state.party_state.state_version,
    expected_state_version: state.party_state.state_version,
    subject: packet,
    parent_container: currentContainer(state, contracts.bag.container_id),
    approved_transition: transition,
    committed_fact_ids: committedFacts(state),
    resolved_actor_refs: actorRefs(state, contracts) });
}

export function resolveEvidence(state, graph) {
  const admitted = new Set(graph.evidence_records.map(
    ({ evidence_id: id }) => id));
  return resolveEvidenceConclusions(graph, committedFacts(state)
    .filter((id) => admitted.has(id)).sort());
}

export function dispositionOptions(state, contracts) {
  return resolveTemporaryDispositionOptions(dispositionInput(state,
    contracts));
}

export function dispositionPlan(state, contracts, selectedOptionRefs) {
  const optionSet = state.phase9?.temporary_disposition_options;
  const selection = selectTemporaryDispositionOptions({ option_set: optionSet,
    selected_option_refs: selectedOptionRefs });
  const proposal = buildTemporaryDispositionProposal({
    contract: contracts.disposition,
    option_set: optionSet, selection });
  const promiseOutcome = planTemporaryDispositionPromiseOutcome({
    policy: contracts.promisePolicy, disposition_proposal: proposal,
    current_promise: state.promise_instances?.[0] ?? null });
  return { ...structuredClone(proposal),
    promise_outcome: structuredClone(promiseOutcome),
    committed_fact_outputs: [...new Set([
      ...proposal.committed_fact_outputs,
      promiseOutcome.basis_fact_id,
      promiseOutcome.transition?.current_state_projection?.next_fact
    ].filter(Boolean))] };
}

function dispositionInput(state, contracts) {
  const facts = dispositionFacts(state, contracts.disposition);
  const actorPredicates = (state.npcs ?? []).flatMap((actor) => {
    const slot = actor.participant_slot_ref;
    const camp = actor.location_profile_ref ===
      'trace_ld_v1_loc_fishing_camp';
    return [`${slot}:${camp ? 'at_fishing_camp' :
      'outside_fishing_camp'}`,
    ...(actor.machine_state?.temporary_custody === true ? []
      : [`${slot}:not_in_temporary_custody`])];
  });
  const witnessSlots = (state.route_participant_commitments ?? [])
    .map(({ npc_ref: npc }) => (state.npcs ?? []).find(
      ({ instance_id: id }) => id === npc?.entity_id)?.participant_slot_ref)
    .filter(Boolean);
  if ((state.route_participant_commitments ?? []).some(({ role }) =>
    role === 'escort')) witnessSlots.push(
    'trace_ld_v1_audience_slot_participating_fisher');
  const packet = currentItem(state, contracts.packet.item_id);
  return { committed_fact_ids: facts,
    committed_actor_predicates: [...new Set(actorPredicates)].sort(),
    committed_witness_slots: [...new Set(witnessSlots)].sort(),
    committed_property_owner_ref: externalOwnerId(
      packet?.ownership?.owner_external_ref),
    contract: contracts.disposition };
}

export function returnAvailable(state, contracts) {
  return state.position?.location_ref === contracts.ids.storehouse
    && !(state.combat_sessions ?? []).some(({ status }) => status !== 'ended')
    && state.player_response_boundary == null;
}
export const atCamp = (state, contracts) =>
  state.position?.location_ref === contracts.ids.camp;
export const hasTestimony = (state) => committedFacts(state)
  .includes('trace_ld_v1_evidence_onisim_testimony');
export const testimonyStageResolved = (state) =>
  state.phase9?.onisim_testimony != null;
export function presentParticipantIds(state) {
  return [state.actor_id, ...(state.npcs ?? []).filter((npc) =>
    npc.location_profile_ref === state.position.location_ref
      || npc.anchor_id === state.position.g5_anchor_id)
    .map(({ instance_id: id }) => id)];
}

function committedFacts(state) {
  return [...new Set([...(state.knowledge ?? []).map(({ fact_id: id }) => id),
    ...(state.phase9?.committed_facts ?? [])].filter(Boolean))];
}
function dispositionFacts(state, contract) {
  const required = new Set(['required_committed_facts',
    'required_any_of_committed_facts', 'none_of_committed_facts'].flatMap(
    (key) => ['custody', 'property', 'promise'].flatMap((dimension) =>
      contract[`${dimension}_options`].flatMap(
        (option) => option[key] ?? []))));
  const factual = new Set(state.phase9?.committed_facts ?? []);
  for (const fact of state.knowledge ?? []) {
    if (required.has(fact.fact_id)
        && /^known_from_committed_/u.test(fact.knowledge_state ?? '')) {
      factual.add(fact.fact_id);
    }
  }
  for (const promise of state.promise_instances ?? []) {
    const current = promise.current_state ?? promise.state;
    if (['active', 'fulfilled', 'broken'].includes(current)) {
      factual.add(`promise_current_${current}`);
    }
  }
  return [...factual].filter((id) => required.has(id)).sort();
}
function terminalZhdankoStatus(state, contracts) {
  const combatStatus = state.last_turn?.consequence?.combat?.session_after
    ?.participant_states
    ?.find(({ actor_ref: actor }) => actor.entity_id
      === actorRefs(state, contracts).zhdanko_storehouse_controller)
    ?.combat_status ?? null;
  if (combatStatus != null) return combatStatus;
  return (state.npcs ?? []).some((npc) =>
    npc.participant_slot_ref === 'zhdanko_storehouse_controller'
    && npc.machine_state?.surrender_state
      === 'surrendered_without_further_attack') ? 'surrendered' : null;
}
function actorRefs(state, contracts) {
  const zhdanko = (state.npcs ?? []).find(({ participant_slot_ref: slot }) =>
    slot === 'zhdanko_storehouse_controller')?.instance_id;
  return { player_clerk: state.actor_id,
    zhdanko_storehouse_controller: zhdanko,
    trace_ld_v1_external_owner_savva_tverdich:
      'trace_ld_v1_external_owner_savva_tverdich' };
}
function currentContainer(state, id) {
  return structuredClone((state.containers ?? []).find(
    ({ container_id: ref }) => ref === id));
}
function currentItem(state, id) {
  return structuredClone((state.items ?? []).find(
    ({ item_id: ref }) => ref === id));
}
function externalOwnerId(value) {
  return typeof value === 'string' ? value : value?.entity_id ?? null;
}
function fail(code) { throw Object.assign(new Error(code), { code }); }
