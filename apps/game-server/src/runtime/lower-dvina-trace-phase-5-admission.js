export function phase5PreconditionsSatisfied(state, contracts) {
  const ratsha = currentActor(state, 'ratsha_storehouse_helper');
  const onisim = currentActor(state, 'onisim_boatman');
  const eremey = currentActor(state, 'eremey_fisher');
  const participatingFisher = contracts.actors.participating_fisher;
  const bandage = (state.items ?? []).filter(
    ({ template_id: id }) => id === contracts.ids.bandage
  );
  const knife = (state.items ?? []).find(
    ({ template_id: id }) => id === 'trace_ld_v1_item_ratsha_knife'
  );
  const surrenderKnown = (state.knowledge ?? []).some(
    ({ fact_id: id }) => id === 'ratsha_surrender_without_further_harm_committed'
  );
  const requiredExecution = state.phase5_treatment?.activity_execution?.id;
  const noIncompatible = [onisim, eremey, participatingFisher]
    .every((actor) => {
      const current = actor?.machine_state?.current_activity_execution_id;
      return current == null || current === requiredExecution;
    });
  return state.position?.location_ref === contracts.ids.shed
    && state.player_response_boundary == null
    && state.ratsha_surrendered === true
    && ratsha?.machine_state?.surrender_state
      === 'surrendered_without_further_harm'
    && ratsha.machine_state.restraint_state === 'not_restrained'
    && surrenderKnown
    && knife?.state?.property_state?.accessibility
      === 'secured_not_available_to_ratsha'
    && knife.placement?.holder_npc_id !== ratsha.instance_id
    && knife.ownership?.controller_npc_id !== ratsha.instance_id
    && [onisim, eremey, participatingFisher].every((actor) =>
      actor?.anchor_id === state.position.g5_anchor_id)
    && onisim.machine_state?.body_condition?.state
      === 'injured_unable_to_walk'
    && noIncompatible
    && bandage.length === 1
    && bandage[0].condition_state === 'clean_serviceable'
    && bandage[0].placement?.holder_npc_id === eremey.instance_id
    && bandage[0].ownership?.owner_npc_id === eremey.instance_id
    && bandage[0].ownership?.controller_npc_id === eremey.instance_id
    && bandage[0].placement?.physical_position === 'worn_quick'
    && bandage[0].state?.accessibility === 'quick'
    && phase5ResourceStateSatisfied(state, contracts, onisim, eremey,
      participatingFisher);
}

export function tracePhase5PreconditionSatisfied(precondition, state,
  contracts) {
  return precondition?.kind?.startsWith('phase5_') === true
    && phase5PreconditionsSatisfied(state, contracts);
}

function phase5ResourceStateSatisfied(state, contracts, onisim, eremey,
  participatingFisher) {
  const progress = Number(
    state.phase5_treatment?.activity_execution?.progress?.current?.numerator ?? 0
  );
  const prepared = progress >= 5;
  const net = exactItem(state, contracts.ids.net);
  const poles = exactItem(state, contracts.ids.poles);
  const water = exactItem(state, contracts.ids.water);
  if (!net || !poles || !water) return false;
  const backgroundOne = currentActor(state, 'background_fisher_1');
  const commonCarrier = (item, owner) =>
    item.ownership?.owner_npc_id === owner.instance_id
      && item.placement?.holder_npc_id === participatingFisher.instance_id
      && item.ownership?.controller_npc_id === participatingFisher.instance_id
      && item.placement?.physical_position === 'external_load'
      && item.condition_state === 'serviceable'
      && item.state?.accessibility === 'quick'
      && item.state?.use_state === (prepared
        ? 'reserved_for_onisim_treatment' : 'carried_for_group_use');
  const waterReady = water.ownership?.owner_npc_id === eremey.instance_id
    && water.placement?.holder_npc_id === eremey.instance_id
    && water.ownership?.controller_npc_id === eremey.instance_id
    && water.placement?.physical_position === 'worn_quick'
    && water.condition_state === 'serviceable'
    && water.state?.accessibility === 'quick'
    && water.state?.use_state === (prepared
      ? 'empty_after_onisim_drink' : 'one_patient_drink_available')
    && water.state?.water_portions_remaining === (prepared ? 0 : 1);
  const rope = onisim.machine_state?.binding_item;
  const ropeReady = prepared
    ? rope?.holder_npc_id === eremey.instance_id
      && rope.controller_npc_id === eremey.instance_id
      && rope.physical_position === 'external_load'
      && rope.accessibility === 'secured_not_available_to_ratsha'
      && rope.condition_state === 'serviceable'
      && rope.use_state === 'coiled_ready_for_reuse'
    : rope?.holder_npc_id === onisim.instance_id
      && rope.controller_npc_id
        === contracts.actors.ratsha_storehouse_helper.instance_id
      && rope.use_state === 'binding_onisim';
  return Boolean(backgroundOne
    && commonCarrier(net, eremey)
    && commonCarrier(poles, backgroundOne)
    && waterReady
    && ropeReady);
}

function exactItem(state, templateId) {
  const matches = (state.items ?? []).filter(
    ({ template_id: id }) => id === templateId
  );
  return matches.length === 1 ? matches[0] : null;
}

function currentActor(state, slot) {
  return (state.npcs ?? []).find(
    ({ participant_slot_ref: ref }) => ref === slot
  );
}
