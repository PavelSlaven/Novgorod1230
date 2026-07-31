import { canonicalDigest } from '@rus/materialization';
import { validateInventoryTopology } from '@rus/items-property';

const PREPARE = 'prepare_cloth_and_expose_injury';
const TERMINAL = 'apply_bandage_and_reassess';

export function applyTracePhase5ResourceTransitions({ next, contracts,
  completedStageIds, priorCompletedStageIds, changeSetId }) {
  const prior = new Set(priorCompletedStageIds ?? []);
  const newlyCompleted = new Set(
    (completedStageIds ?? []).filter((stageId) => !prior.has(stageId))
  );
  if (newlyCompleted.has(PREPARE)) {
    applyRopeRelease({ next, contracts, changeSetId });
    applyItemTransition({ next, contracts,
      transition: contracts.resourceTransitions.waterUse, changeSetId,
      approvedFacts: ['trace_ld_v1_treatment_stage_prepare_committed'] });
    applyItemTransition({ next, contracts,
      transition: contracts.resourceTransitions.netReserve, changeSetId,
      approvedFacts: ['trace_ld_v1_treatment_stage_prepare_committed'] });
    applyItemTransition({ next, contracts,
      transition: contracts.resourceTransitions.polesReserve, changeSetId,
      approvedFacts: ['trace_ld_v1_treatment_stage_prepare_committed'] });
  }
  if (newlyCompleted.has(TERMINAL)) {
    applyItemTransition({ next, contracts,
      transition: contracts.resourceTransitions.netApply, changeSetId,
      approvedFacts: ['onisim_first_aid_final_stage_committed'] });
    applyItemTransition({ next, contracts,
      transition: contracts.resourceTransitions.polesApply, changeSetId,
      approvedFacts: ['onisim_first_aid_final_stage_committed'] });
  }
  const topology = validateInventoryTopology({
    party_id: next.party_id,
    actor_id: next.actor_id,
    items: next.items.map(({ item_id, template_id, quantity }) => ({
      item_id, template_id, quantity
    })),
    item_placements: next.items.map((item) => ({
      party_id: next.party_id,
      item_id: item.item_id,
      ...structuredClone(item.placement)
    })),
    containers: structuredClone(next.containers ?? []),
    container_placements: structuredClone(next.container_placements ?? [])
  });
  if (!topology.pass) fail('TRACE_PHASE_5_RESOURCE_TOPOLOGY_INVALID');
}

function applyRopeRelease({ next, contracts, changeSetId }) {
  const transition = contracts.resourceTransitions.ropeRelease;
  const onisim = contracts.actors.onisim_boatman;
  const ratsha = contracts.actors.ratsha_storehouse_helper;
  const eremey = contracts.actors.eremey_fisher;
  const target = next.npcs.find(({ instance_id: id }) => id === onisim.instance_id);
  const source = target?.machine_state?.binding_item;
  if (transition.subject_ref !== source?.item_template_ref
      || source.owner_ref !== transition.requires.owner_ref
      || source.holder_npc_id !== onisim.instance_id
      || source.controller_npc_id !== ratsha.instance_id
      || source.use_state !== transition.requires.use_state
      || transition.writes.holder_ref !== 'eremey_fisher'
      || transition.writes.controller_ref !== 'eremey_fisher') {
    fail('TRACE_PHASE_5_ROPE_RELEASE_PRECONDITION_FAILED');
  }
  target.machine_state.binding_item = {
    ...source,
    holder_npc_id: eremey.instance_id,
    controller_npc_id: eremey.instance_id,
    physical_position: transition.writes.physical_position,
    accessibility: transition.writes.accessibility,
    condition_state: transition.writes.condition_state,
    use_state: transition.writes.use_state,
    last_transition: historyEntry({ transition, changeSetId,
      approvedFacts: ['trace_ld_v1_treatment_stage_prepare_committed'] })
  };
}

function applyItemTransition({ next, contracts, transition, changeSetId,
  approvedFacts }) {
  const matches = next.items.filter(
    ({ template_id: id }) => id === transition.subject_ref
  );
  if (matches.length !== 1) fail('TRACE_PHASE_5_RESOURCE_INSTANCE_MISSING');
  const item = matches[0];
  const refs = resolvedRefs(contracts);
  const requiredHolder = refs[transition.requires.holder_ref];
  const requiredController = refs[transition.requires.controller_ref];
  const requiredOwner = transition.requires.owner_ref == null
    ? null : refs[transition.requires.owner_ref];
  if (!requiredHolder || !requiredController
      || (transition.requires.owner_ref != null && !requiredOwner)
      || item.placement?.holder_npc_id !== requiredHolder
      || item.ownership?.controller_npc_id !== requiredController
      || (requiredOwner != null && item.ownership?.owner_npc_id !== requiredOwner)
      || (transition.requires.physical_position != null
        && item.placement.physical_position
          !== transition.requires.physical_position)
      || (transition.requires.accessibility != null
        && item.state?.accessibility !== transition.requires.accessibility)
      || (transition.requires.condition_state != null
        && item.condition_state !== transition.requires.condition_state)
      || (transition.requires.use_state != null
        && item.state?.use_state !== transition.requires.use_state)
      || (transition.requires.water_portions_remaining != null
        && item.state?.water_portions_remaining
          !== transition.requires.water_portions_remaining)) {
    fail('TRACE_PHASE_5_RESOURCE_TRANSITION_PRECONDITION_FAILED');
  }
  const destinationHolder = refs[transition.writes.holder_ref];
  const destinationController = refs[transition.writes.controller_ref];
  if (!destinationHolder || !destinationController
      || transition.owner_change !== 'forbidden') {
    fail('TRACE_PHASE_5_RESOURCE_TRANSITION_CONTRACT_INVALID');
  }
  item.placement = {
    ...item.placement,
    holder_npc_id: destinationHolder,
    holder_character_id: null,
    physical_position: transition.writes.physical_position
  };
  item.ownership = {
    ...item.ownership,
    controller_npc_id: destinationController,
    controller_character_id: null
  };
  item.condition_state = transition.writes.condition_state;
  item.state = {
    ...item.state,
    accessibility: transition.writes.accessibility,
    use_state: transition.writes.use_state,
    ...(transition.writes.water_portions_remaining == null ? {} : {
      water_portions_remaining: transition.writes.water_portions_remaining
    }),
    approved_transition_history: [
      ...(item.state?.approved_transition_history ?? []),
      historyEntry({ transition, changeSetId, approvedFacts })
    ]
  };
}

function resolvedRefs(contracts) {
  return {
    eremey_fisher: contracts.actors.eremey_fisher.instance_id,
    onisim_boatman: contracts.actors.onisim_boatman.instance_id,
    background_fisher_1: contracts.actors.background_fisher_1.instance_id,
    resolved_participating_fisher:
      contracts.actors.participating_fisher.instance_id
  };
}

function historyEntry({ transition, changeSetId, approvedFacts }) {
  return {
    transition_profile_id: transition.transition_profile_id,
    transition_digest: canonicalDigest(transition),
    approved_facts: [...approvedFacts],
    owner_change: 'forbidden',
    change_set_id: changeSetId
  };
}

function fail(code) {
  const error = new Error('Phase 5 resource transition failed closed.');
  error.code = code;
  throw error;
}
