import { traceCombatTargetRefs } from './lower-dvina-trace-combat-command.js';

export function buildTracePhase2TargetRefs({ state, contracts,
  phase3Contracts, phase4Contracts, phase5Contracts, turn10, phase8,
  phase9 }) {
  return { actor: state.actor_id, wreck: contracts.locationRef,
    fishingCamp: phase3Contracts?.ids.campLocation,
    eremey: phase3Contracts?.actors[0]?.instance_id,
    evidence: phase3Contracts?.ids.evidence,
    dryingShed: phase4Contracts?.ids.shed,
    ratsha: phase4Contracts?.actors.ratsha_storehouse_helper.instance_id,
    onisim: phase5Contracts?.actors.onisim_boatman.instance_id,
    ...(turn10?.targetRefs ?? {}), ...traceCombatTargetRefs(state),
    ...(phase8?.targetRefs ?? {}), ...(phase9?.targetRefs ?? {}) };
}
