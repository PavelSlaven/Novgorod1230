import { resolveTraceCombatSpatialAffordances } from
  './lower-dvina-trace-combat-position-owner.js';
import { restrictTraceCombatSpatialIntents } from
  './lower-dvina-trace-combat-position-owner.js';
import { resolveTracePhase4Contracts } from
  './lower-dvina-trace-phase-4-contracts.js';
import { resolveTracePhase8Contracts } from
  './lower-dvina-trace-phase-8-contracts.js';

export function traceCombatMovementBindingsForSession({ state, bundle,
  session, bindings }) {
  if (session.scope_ref.entity_id === bindings.phase_8?.scope_location_ref) {
    return resolveTracePhase8Contracts({ state, bundle,
      conversationBindings: bundle.conversation_semantic_bindings })
      .combatMovementBindings;
  }
  return resolveTracePhase4Contracts({ state, bundle }).combatMovementBindings;
}

export function traceCombatMovementBindings(context) {
  context.movementBindings ??= traceCombatMovementBindingsForSession({
    state: context.state, bundle: context.bundle, session: context.session,
    bindings: context.bindings });
  return context.movementBindings;
}

export function traceCombatBindingForActor(actorId, context) {
  const npc = context.state.npcs?.find(({ instance_id: id }) => id === actorId);
  const slot = npc?.participant_slot_ref;
  const phase8 = context.bindings.phase_8;
  const scope = context.session?.scope_ref?.entity_id
    ?? npc?.machine_state?.location_ref ?? npc?.location_profile_ref;
  if (phase8 != null && scope === phase8.scope_location_ref) {
    if (slot === phase8.actor_slot) return phase8;
    return phase8.participant_roles?.[
      /^background_fisher_[12]$/.test(slot) ? 'participating_fisher' : slot]
      ?? null;
  }
  return scope === context.bindings.phase_4?.scope_location_ref
    && slot === context.bindings.phase_4?.actor_slot
    ? context.bindings.phase_4 : null;
}

export function traceCombatOperationContractForNpc(actorRef, context) {
  const binding = traceCombatBindingForActor(actorRef.entity_id, context);
  if (!binding) fail('TRACE_COMBAT_NPC_BINDING_GAP');
  const primary = context.state.npcs?.find(({ participant_slot_ref: value }) =>
    value === context.bindings.phase_8?.actor_slot);
  const ally = binding !== context.bindings.phase_8;
  const opponents = ally && primary ? [{ entity_kind: 'npc',
    entity_id: primary.instance_id }] : context.state.actor_id == null ? [] : [{
    entity_kind: 'player_character', entity_id: context.state.actor_id }];
  const scope = binding.scope_location_ref
    ?? context.bindings.phase_8?.scope_location_ref;
  const spatial = resolveTraceCombatSpatialAffordances({ actorRef,
    state: context.state, movementBindings: context.movementBindings });
  return restrictTraceCombatSpatialIntents({
    ...structuredClone(binding.operation_contract),
    engageable_actor_refs: opponents, controllable_actor_refs: opponents,
    protectable_refs: ally ? [{ entity_kind: 'player_character',
      entity_id: context.state.actor_id }] : [], holdable_scope_refs: [
      { entity_kind: 'location', entity_id: scope }] }, spatial);
}

function fail(code) { throw Object.assign(new Error(code), { code }); }
