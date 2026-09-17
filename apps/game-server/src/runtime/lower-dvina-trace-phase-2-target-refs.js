import { traceCombatTargetRefs } from './lower-dvina-trace-combat-command.js';

export function buildTracePhase2TargetRefs({ state, contracts,
  phase3Contracts, phase4Contracts, phase5Contracts, turn10, phase8,
  phase9 }) {
  return { actor: state.actor_id, wreck: contracts.locationRef,
    fishingCamp: phase3Contracts?.ids.campLocation,
    eremey: phase3Contracts?.actors[0]?.instance_id,
    phase3ConversationActors: phase3Contracts == null ? undefined
      : phase3Contracts.actors.map(
        ({ instance_id: instanceId }) => instanceId),
    evidence: phase3Contracts?.ids.evidence,
    dryingShed: phase4Contracts?.ids.shed,
    ratsha: phase4Contracts?.actors.ratsha_storehouse_helper.instance_id,
    onisim: phase5Contracts?.actors.onisim_boatman.instance_id,
    phase4ConversationActors: phase4Contracts == null ? undefined
      : Object.values(phase4Contracts.actors)
        .map(({ instance_id: instanceId }) => instanceId),
    ...(turn10?.targetRefs ?? {}), ...traceCombatTargetRefs(state,
      phase8?.contracts ?? null),
    ...(phase8?.targetRefs ?? {}), ...(phase9?.targetRefs ?? {}) };
}

export function phase3ConversationTargetId(context, contracts) {
  return phase3ConversationTargetRefs(context, contracts)?.[0]?.entity_id
    ?? null;
}

export function phase3ConversationTargetRefs(context, contracts) {
  const targetRefs = context.semanticPlan?.operations?.find(
    ({ op }) => op === 'emit_interaction')?.target_actor_refs;
  const selected = Array.isArray(targetRefs) && targetRefs.length > 0
    ? targetRefs : [contracts.actors[0]?.instance_id];
  const available = new Set(contracts.actors.map(
    ({ instance_id: instanceId }) => instanceId));
  return new Set(selected).size === selected.length
      && selected.every((targetId) => available.has(targetId))
    ? selected.map((targetId) => ({ entity_kind: 'npc', entity_id: targetId }))
    : null;
}

export function phase3ConversationTarget(contracts, addressee) {
  return contracts.actors.find(({ ref, instance_id: instanceId }) =>
    addressee == null ? ref === contracts.ids.eremeyRef
      : instanceId === addressee.entity_id);
}
