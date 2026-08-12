import { planApprovedActorItemTransition } from '@rus/items-property';
import { traceCombatBindingForActor } from
  './lower-dvina-trace-combat-bindings.js';

export function applyTraceCombatItemTransition({ step,
  check_result: checkResult, working_state: working }, context) {
  const intent = context.session.participant_states.map(
    ({ current_intent: value }) => value).find(
    (candidate) => candidate?.intent_id === step.intent_ref.entity_id);
  const profile = intent == null ? null : executionProfile(intent, context);
  if (profile?.property_transition == null
      || checkResult?.outcome?.success !== true) return unchanged(working);
  const transition = profile.property_transition;
  const item = working.items?.find(
    ({ template_id: id }) => id === transition.subject_ref);
  const refs = actorRefs(context.state);
  if (!item || !refs[transition.requires.holder_ref]
      || !refs[transition.writes.holder_ref]) fail('TRACE_COMBAT_ITEM_GAP');
  const sourceId = refs[transition.requires.holder_ref];
  const destinationId = refs[transition.writes.holder_ref];
  const plan = planApprovedActorItemTransition({ party_id: context.state.party_id,
    item_id: item.item_id, state_version: context.session.state_version,
    expected_state_version: context.session.state_version,
    approved_transition: transition,
    approved_facts: [transition.requires.admission_fact],
    resolved_actor_refs: refs,
    source: { actor_id: sourceId, actor_kind: 'npc',
      controller_actor_id: refs[transition.requires.controller_ref],
      physical_position: transition.requires.physical_position,
      accessibility: transition.requires.accessibility },
    destination: { actor_id: destinationId, actor_kind: 'npc',
      controller_actor_id: refs[transition.writes.controller_ref],
      physical_position: transition.writes.physical_position,
      accessibility: transition.writes.accessibility },
    items: working.items,
    item_profiles: inventoryProfiles(working.items),
    containers: referencedContainers(working),
    item_placements: working.items.map((candidate) =>
      itemPlacement(candidate, context.state.party_id)),
    container_placements: referencedContainerPlacements(working),
    container_profiles: referencedContainerProfiles(working),
    ownership: working.items.map((candidate) =>
      itemOwnership(candidate, context.state.party_id)),
    actor_strengths: {} });
  if (!plan.pass) fail('TRACE_COMBAT_ITEM_TRANSITION_REJECTED', plan.errors);
  const next = structuredClone(working);
  next.items = next.items.map((candidate) => candidate.item_id !== item.item_id
    ? candidate : applyItemProposal(candidate, plan.proposal));
  const eventId = `combat-event:${context.session.combat_id}:step:${
    step.proposal_id}:item:${item.item_id}`;
  return { working_state: next, transition_profile_ref:
    transition.transition_profile_id, applied: true,
  outcome_events: [{ event_id: eventId,
    event_kind: 'combat_item_transition_completed',
    combat_id: context.session.combat_id,
    source_step_ref: { entity_kind: 'combat_technical_step',
      entity_id: step.proposal_id },
    item_ref: { entity_kind: 'item', entity_id: item.item_id },
    transition_profile_ref: transition.transition_profile_id }],
  signal_descriptors: [{ category: 'self', significance: 'material',
    source_event_ref: { entity_kind: 'combat_event', entity_id: eventId },
    subject_ref: intent.target_refs[0], scope_refs: [],
    perception_required: false,
    perceived_change_summary:
      'Участник непосредственно потерял доступ к удерживаемому оружию.' }],
  participant_status_updates: profile.participant_status_on_success == null
    ? [] : [{ actor_ref: intent.target_refs[0], combat_status:
      profile.participant_status_on_success, clear_intent: true }] };
}

function executionProfile(intent, context) {
  const records = intent.actor_ref.entity_kind === 'player_character'
    ? context.playerProfiles
    : traceCombatBindingForActor(intent.actor_ref.entity_id, context)
      ?.execution_profiles;
  return records?.find(({ intent_kind: kind }) => kind === intent.intent_kind)
    ?? null;
}
function actorRefs(state) { return Object.fromEntries((state.npcs ?? []).map(
  (npc) => [npc.participant_slot_ref, npc.instance_id]).concat(
    (state.route_participant_commitments ?? [])
      .filter(({ role }) => role === 'escort')
      .map(({ npc_ref: npc }) => ['participating_fisher', npc.entity_id]))); }
function itemPlacement(item, partyId) { return { party_id: partyId,
  item_id: item.item_id, ...structuredClone(item.placement ?? {}) }; }
function itemOwnership(item, partyId) { return { party_id: partyId,
  item_id: item.item_id,
  ...structuredClone(item.ownership ?? {}) }; }
function inventoryProfiles(items) {
  const byTemplate = new Map();
  for (const item of items ?? []) {
    const profile = item.inventory_profile
      ?? item.state?.inventory_profile_snapshot;
    if (profile && !byTemplate.has(item.template_id)) {
      byTemplate.set(item.template_id, { ...structuredClone(profile),
        template_id: item.template_id });
    }
  }
  return [...byTemplate.values()];
}
function referencedContainerIds(working) { return new Set((working.items ?? [])
  .map((item) => item.placement?.container_id).filter(Boolean)); }
function referencedContainers(working) { const ids = referencedContainerIds(
  working); return structuredClone((working.containers ?? []).filter(
    ({ container_id: id }) => ids.has(id))); }
function referencedContainerPlacements(working) { const ids =
  referencedContainerIds(working); return structuredClone(
    (working.container_placements ?? []).filter(
      ({ container_id: id }) => ids.has(id))); }
function referencedContainerProfiles(working) { return referencedContainers(
  working).map((container) => ({
    ...structuredClone(container.state?.inventory_profile_snapshot),
    template_id: container.template_id })); }
function applyItemProposal(item, proposal) { return { ...item,
  placement: { ...item.placement,
    holder_npc_id: proposal.placement.holder_npc_id ?? null,
    holder_character_id: proposal.placement.holder_character_id ?? null,
    physical_position: proposal.placement.physical_position },
  ownership: structuredClone(proposal.ownership.next),
  state: { ...item.state, accessibility: proposal.accessibility.value,
    approved_transition_history: [
      ...(item.state?.approved_transition_history ?? []),
      proposal.property_history] } }; }
function unchanged(working) { return { working_state: structuredClone(working),
  participant_status_updates: [], signal_descriptors: [], outcome_events: [],
  applied: false }; }
function fail(code, details = null) {
  throw Object.assign(new Error(code), { code, details });
}
