import { canonicalDigest } from '@rus/materialization';
export const INITIAL_CARRIERS = Object.freeze(['player_clerk', 'eremey_fisher', 'ratsha_storehouse_helper']);
export const REPLACEMENT = 'trace_ld_v1_audience_slot_participating_fisher';
export function integerMinutes(value, code) { const number = Number(value); if (!Number.isSafeInteger(number)) fail(code); return number; }
export function requirePhase6State(state, contracts) {
  if (!state?.phase5_treatment?.activity_execution || state.phase5_treatment.activity_execution.status !== 'completed') fail('TRACE_PHASE_6_TREATMENT_NOT_COMPLETED');
  const facts = new Set((state.knowledge ?? []).map(({ fact_id }) => fact_id));
  if (!facts.has('onisim_first_aid_completed') || !facts.has('ratsha_surrender_without_further_harm_committed')) fail('TRACE_PHASE_6_REQUIRED_FACT_MISSING');
  if (state.position?.location_ref !== contracts.shed_location_ref) fail('TRACE_PHASE_6_PARTY_NOT_AT_SHED');
  if (!contracts?.route || contracts.route.duration_minutes !== 20 || contracts.route.carried_actor_rules?.single_root_clock !== true) fail('TRACE_PHASE_6_ROUTE_CONTRACT_INVALID');
}
export function actorMap(state) { return Object.fromEntries((state.npcs ?? []).map((actor) => [actor.participant_slot_ref, actor])); }
export function requiredActor(actors, slot, sourceAnchorId) {
  const actor = actors[slot];
  if (!actor?.instance_id || actor.anchor_id !== sourceAnchorId) {
    fail('TRACE_PHASE_6_PARTICIPANT_NOT_COLOCATED', {
      participant_slot_ref: slot,
      expected_anchor_id: sourceAnchorId,
      actual_anchor_id: actor?.anchor_id ?? null
    });
  }
  return actor;
}
export function requiredSelectedActor(state, actors, selectionId,
  sourceAnchorId) {
  const groups = (state.sealed_selections ?? []).filter(({ selection_kind: kind }) => kind === 'audience');
  const records = groups[0]?.records ?? [];
  if (groups.length !== 1 || records.length !== 1 || !String(records[0].selected_id ?? '').trim()) fail('TRACE_PHASE_6_PARTICIPATING_FISHER_BINDING_INVALID');
  const actor = requiredActor(
    actors,
    records[0].selected_id,
    sourceAnchorId
  );
  if (selectionId !== REPLACEMENT) fail('TRACE_PHASE_6_PARTICIPATING_FISHER_BINDING_INVALID');
  return actor;
}
export function exactResources({ state, actors, onisim, prior }) {
  const exact = (templateId) => (state.items ?? []).filter(
    ({ template_id: value }) => value === templateId
  );
  const nets = exact('trace_ld_v1_item_fishing_net');
  const poleSets = exact('trace_ld_v1_item_carry_poles');
  const net = nets[0];
  const poles = poleSets[0];
  if (nets.length !== 1 || poleSets.length !== 1 ||
      !net?.item_id || !poles?.item_id || net.item_id === poles.item_id) {
    fail('TRACE_PHASE_6_ASSEMBLY_RESOURCE_GAP');
  }
  const terminalAttempt = [...(state.phase5_history ?? [])].reverse().find(
    ({ treatment }) => treatment?.final === true
  )?.treatment?.attempt;
  const terminalResourceIds = new Set(
    (terminalAttempt?.resource_consumptions ?? []).map(
      ({ resource_ref: ref }) => ref?.entity_id
    )
  );
  const expected = [
    [net, actors.eremey_fisher, 'temporary_leg_splint_support'],
    [poles, actors.background_fisher_1, 'temporary_leg_splint_frame']
  ];
  const proof = expected.map(([item, owner, useState]) => {
    if (!terminalResourceIds.has(item.item_id)
        || !owner?.instance_id
        || item.condition_state !== 'serviceable'
        || item.placement?.holder_npc_id !== onisim.instance_id
        || item.placement?.holder_character_id != null
        || item.placement?.physical_position !== 'external'
        || item.ownership?.owner_npc_id !== owner.instance_id
        || item.ownership?.controller_npc_id !== onisim.instance_id
        || item.state?.accessibility
          !== 'applied_not_available_as_resource'
        || item.state?.use_state !== useState) {
      fail('TRACE_PHASE_6_ASSEMBLY_RESOURCE_STATE_INVALID', {
        item_id: item.item_id,
        item_template_ref: item.template_id
      });
    }
    return resourceProof(item);
  });
  if (prior?.assembly_snapshot != null
      && canonicalResourceProof(prior.assembly_snapshot.resources) !==
        canonicalResourceProof(proof)) {
    fail('TRACE_PHASE_6_ASSEMBLY_SNAPSHOT_STALE');
  }
  return { net, poles, proof };
}

export function participantBinding({ state, prior, initial, replacement,
  onisim }) {
  const ids = [...initial, replacement.instance_id, onisim.instance_id];
  if (new Set(ids).size !== ids.length) {
    fail('TRACE_PHASE_6_PARTICIPANT_BINDING_CONFLICT');
  }
  const value = {
    source_anchor_id: state.position.g5_anchor_id,
    player_actor_id: state.actor_id,
    initial_carrier_ids: [...initial],
    replacement_carrier_id: replacement.instance_id,
    carried_actor_id: onisim.instance_id
  };
  if (prior != null && canonicalResourceProof(prior.participant_bindings)
      !== canonicalResourceProof(value)) {
    fail('TRACE_PHASE_6_PERSISTED_PARTICIPANT_BINDING_MISMATCH', {
      persisted: prior.participant_bindings,
      resolved: value
    });
  }
  return value;
}

function resourceProof(item) {
  return {
    item_id: item.item_id,
    item_template_ref: item.template_id,
    condition_state: item.condition_state,
    holder_npc_id: item.placement.holder_npc_id,
    physical_position: item.placement.physical_position,
    owner_npc_id: item.ownership.owner_npc_id,
    controller_npc_id: item.ownership.controller_npc_id,
    accessibility: item.state.accessibility,
    use_state: item.state.use_state
  };
}

function canonicalResourceProof(value) {
  return canonicalDigest(value ?? null);
}
export function requiredCamp(state, contracts) { const values = (state.prepared_scenes ?? []).filter((scene) => scene.location_profile_ref === contracts.terminalPlacement.group.location_ref); const camp = values.length === 1 ? values[0] : values.length === 0 && state.first_entry_preparation?.spatial_v3?.target?.status === 'prepared' && state.first_entry_preparation.scene?.location_profile_ref === contracts.terminalPlacement.group.location_ref ? state.first_entry_preparation.scene : null; if (camp?.anchor?.template_id !== contracts.terminalPlacement.group.anchor_template_ref || !camp.node?.instance_id || !camp.anchor?.instance_id) fail('TRACE_PHASE_6_TERMINAL_POSITION_GAP'); return camp; }
export function bodyEffectsBySubject({ state, contracts, eremey, ratsha, replacement, onisim }) {
  const onisimState = onisim.machine_state?.body_condition?.state;
  const onisimFact = onisimState === 'stabilized_unable_to_walk' ? 'onisim_stabilized_unable_to_walk' : onisimState === 'injured_unable_to_walk' ? 'onisim_first_aid_completed_without_stabilization' : null;
  const onisimProfile = onisimFact == null ? null : contracts.bodyEffectBindings.onisim_boatman?.[onisimFact];
  if (!onisimProfile) fail('TRACE_PHASE_6_ONISIM_BODY_BRANCH_GAP');
  return [[state.actor_id, 'player_clerk', contracts.bodyEffectBindings.player_clerk], [eremey.instance_id, 'eremey_fisher', contracts.bodyEffectBindings.eremey_fisher], [ratsha.instance_id, 'ratsha_storehouse_helper', contracts.bodyEffectBindings.ratsha_storehouse_helper], [replacement.instance_id, 'resolved_participating_fisher', contracts.bodyEffectBindings.resolved_participating_fisher], [onisim.instance_id, 'onisim_boatman', onisimProfile]].map(([subject_id, subject_ref, profile_ref]) => { const effect = contracts.bodyEffects.find((entry) => entry.effect_profile_id === profile_ref); if (!effect) fail('TRACE_PHASE_6_BODY_EFFECT_GAP'); return { subject_id, subject_ref, profile_ref, effect: structuredClone(effect) }; });
}
function fail(code, details = null) { throw Object.assign(new Error(code), { code, details }); }
